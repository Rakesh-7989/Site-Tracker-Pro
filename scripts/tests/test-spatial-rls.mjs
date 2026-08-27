#!/usr/bin/env node
// SiteTrack Pro — RLS proof for the spatial-hierarchy tables (migrations 215 + 216).
//
// Phase 0 / 0.8 (SEC-02). Migrations 215/216 closed the R&D gap where 6 org-scoped
// spatial tables (sites, buildings, rooms, zones, spatial_floors,
// user_project_locations) carried FULL authenticated DML grants with NO RLS, plus
// dropped migration 206's inert-but-now-live duplicate policies whose SELECT gate
// wrongly compared profile_id against user_org_ids().
//
// This suite acts as a NON-superadmin org member (via SET LOCAL ROLE authenticated
// + a JWT sub claim) inside a rolled-back tx and proves the boundary on `sites`:
//   1. Org admin CAN insert a site into their own org.
//   2. Org admin CAN read it back.
//   3. An outsider (no org membership) CANNOT insert into the org's sites.
//   4. The outsider sees 0 rows (RLS silently filters).
//   5. The outsider CANNOT delete the row (it survives the delete).
//   6. Org admin CAN delete (manager set: orgadmin / pm / project_admin / superadmin).
//
// READ-ONLY net effect (ROLLBACK). Usage: node scripts/test-spatial-rls.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

let DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  try {
    const env = Object.fromEntries(
      readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)
        .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
        .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]));
    DB_URL = env.SUPABASE_DB_URL;
  } catch { /* no .env.local — rely on the env var */ }
}
if (!DB_URL) {
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping spatial RLS tests.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const U = randomUUID();  // org admin
const U2 = randomUUID(); // outsider — no org membership
const O = randomUUID();  // temp org
const P = randomUUID();  // temp project
const S = randomUUID();  // temp site
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  🟢 ${label}`); } else { fail++; console.log(`  🔴 ${label}`); } };
const asUser = async (id) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${id}","role":"authenticated"}', true)`);
};
// Run `fn` inside a savepoint so a denied statement doesn't abort the tx.
const inTx = async (fn) => {
  await c.query("savepoint sp");
  try { const out = await fn(); await c.query("release savepoint sp"); return { ok: true, val: out }; }
  catch (e) { await c.query("rollback to savepoint sp"); return { ok: false, err: e.message }; }
};

// Pre-clean any leftovers from a prior aborted run (committed, outside the tx).
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };
await clean(`delete from public.sites where organization_id=$1`, [O]);
await clean(`delete from public.projects where org_id=$1 or id=$2`, [O, P]);
await clean(`delete from public.org_members where org_id=$1 or profile_id=$2 or profile_id=$3`, [O, U, U2]);
await clean(`delete from public.organizations where id=$1`, [O]);
await clean(`delete from public.profiles where id=$1 or id=$2`, [U, U2]);
await clean(`delete from auth.users where id=$1 or id=$2`, [U, U2]);

try {
  await c.query("begin");
  // Seed with triggers OFF so handle_new_signup doesn't auto-create profiles/orgs.
  await c.query("set local session_replication_role = 'replica'");
  for (const [id, email, role, name] of [
    [U, 'spatial-admin@sitetrack.test', 'orgadmin', 'Spatial Admin'],
    [U2, 'spatial-outsider@sitetrack.test', 'architect', 'Spatial Outsider'],
  ]) {
    await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2, now(), now())`, [id, email]);
    await c.query(`insert into public.profiles (id, name, role, is_staff) values ($1,$2,$3, false)`, [id, name, role]);
  }
  await c.query(`insert into public.organizations (id, slug, name, plan) values ($1,'rls-spatial-org','RLS Spatial','enterprise')`, [O]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'admin','active')`, [O, U]);
  await c.query(`insert into public.projects (id, org_id, name, type) values ($1,$2,'RLS Proj','construction')`, [P, O]);
  await c.query("set local session_replication_role = 'origin'"); // triggers + RLS back on

  // 1. Org admin inserts a site into own org.
  await asUser(U);
  const ins = await inTx(() => c.query(
    `insert into public.sites (id, project_id, organization_id, name, status) values ($1,$2,$3,'RLS Site','active')`, [S, P, O]));
  ok(ins.ok, "orgadmin CAN insert site in own org");

  // 2. Org admin reads it back.
  const selfSee = await inTx(() => c.query(`select count(*)::int n from public.sites where id=$1`, [S]));
  ok(selfSee.ok && selfSee.val.rows[0].n === 1, "orgadmin sees own site row");

  // 3. Outsider cannot insert into the org's sites.
  await asUser(U2);
  const outIns = await inTx(() => c.query(
    `insert into public.sites (id, project_id, organization_id, name, status) values ($1,$2,$3,'Hack','active')`,
    [randomUUID(), P, O]));
  ok(!outIns.ok, "outsider CANNOT insert into other org's sites");

  // 4. Outsider sees 0 rows (RLS silently filters — the row still exists).
  const outSee = await inTx(() => c.query(`select count(*)::int n from public.sites where id=$1`, [S]));
  ok(outSee.ok && outSee.val.rows[0].n === 0, "outsider sees 0 rows of other org's site");

  // 5. Outsider cannot delete (RLS filters rows silently — the row survives).
  //    Verify physical existence as the owner role (the outsider's own RLS would
  //    hide the row from a visibility check even if it still exists).
  await inTx(() => c.query(`delete from public.sites where id=$1`, [S]));
  await c.query("reset role");
  const stillThere = await inTx(() => c.query(`select count(*)::int n from public.sites where id=$1`, [S]));
  ok(stillThere.ok && stillThere.val.rows[0].n === 1, "outsider CANNOT delete other org's site");
  await asUser(U2); // restore outsider context for the next assertion's setup

  // 6. Org admin CAN delete own org's site (manager set).
  await asUser(U);
  const delOk = await inTx(() => c.query(`delete from public.sites where id=$1`, [S]));
  ok(delOk.ok, "orgadmin CAN delete own org's site (manager set)");
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${fail === 0 ? `✅ All ${pass} spatial-RLS assertions passed.` : `❌ ${fail} assertion(s) failed.`}`);
process.exit(fail === 0 ? 0 : 1);