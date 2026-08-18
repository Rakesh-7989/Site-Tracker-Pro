#!/usr/bin/env node
// SiteTrack Pro — RLS proof for project-scope enforcement (migration 213).
//
// Acts as NON-superadmin org admins (via SET LOCAL ROLE authenticated + a JWT
// sub claim) and proves the security boundary, all inside a rolled-back tx:
//   SEC-001 (P0): a member may insert a project ONLY into an org they belong to
//                 (cross-tenant INSERT blocked).
//   SEC-004 (P0): a project's org_id is immutable (trigger); out-of-scope
//                 UPDATE is blocked by the WITH CHECK; superadmin bypasses.
//
// READ-ONLY net effect (ROLLBACK). Usage: node scripts/test-project-scope-rls.mjs

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
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping RLS tests.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const U_A = randomUUID(); // orgadmin in org A
const U_B = randomUUID(); // orgadmin in org B
const U_S = randomUUID(); // superadmin
const A = randomUUID();
const B = randomUUID();
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  🟢 ${label}`); } else { fail++; console.log(`  🔴 ${label}`); } };
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
};
const asOwner = async () => { await c.query("reset role"); };
async function tryInsert(sql, params) {
  try { await c.query("savepoint sp"); await c.query(sql, params); await c.query("release savepoint sp"); return true; }
  catch { await c.query("rollback to savepoint sp"); return false; }
}
async function tryUpdate(sql, params) {
  try {
    await c.query("savepoint sp");
    const r = await c.query(sql, params);
    await c.query("release savepoint sp");
    // RLS blocks by silently filtering rows — 0 rows updated = access denied.
    return r.rowCount > 0;
  } catch { await c.query("rollback to savepoint sp"); return false; }
}

// Pre-clean leftovers from a prior aborted run (committed, outside the tx).
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };
await clean(`delete from public.projects where org_id in ($1,$2)`, [A, B]);
await clean(`delete from public.org_members where org_id in ($1,$2) or profile_id in ($3,$4,$5)`, [A, B, U_A, U_B, U_S]);
await clean(`delete from public.organizations where id in ($1,$2)`, [A, B]);
await clean(`delete from public.profiles where id in ($1,$2,$3)`, [U_A, U_B, U_S]);
await clean(`delete from auth.users where id in ($1,$2,$3)`, [U_A, U_B, U_S]);

try {
  await c.query("begin");
  // Seed with triggers OFF so handle_new_signup doesn't auto-create orgs.
  await c.query("set local session_replication_role = 'replica'");
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','proj-a@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','proj-b@sitetrack.test', now(), now()),
           ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','proj-s@sitetrack.test', now(), now())`, [U_A, U_B, U_S]);
  await c.query(`insert into public.profiles (id, name, role, is_staff) values
    ($1,'ProjA Admin','orgadmin', false),
    ($2,'ProjB Admin','orgadmin', false),
    ($3,'SuperAdmin','superadmin', true)`, [U_A, U_B, U_S]);
  await c.query(`insert into public.organizations (id, slug, name, plan) values
    ($1,'proj-test-org-a','Proj Test Org A','enterprise'),
    ($2,'proj-test-org-b','Proj Test Org B','enterprise')`, [A, B]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$2,'admin','active'),
    ($3,$4,'admin','active')`, [A, U_A, B, U_B]);
  await c.query("set local session_replication_role = 'origin'"); // triggers + RLS back on

  // Sanity: each admin's active org set.
  await asUser(U_A);
  const orgsA = (await c.query("select public.user_org_ids() o")).rows[0].o;
  ok(orgsA.includes(A) && !orgsA.includes(B), "admin A is member of org A only");

  // SEC-001 — cross-tenant INSERT blocked, same-org INSERT allowed.
  ok(await tryInsert(`insert into public.projects (org_id, name) values ($1,'Proj A1')`, [A]),
     "admin A CAN create a project in their org (A)");
  ok(!(await tryInsert(`insert into public.projects (org_id, name) values ($1,'Proj B1')`, [B])),
     "admin A CANNOT create a project in another org (B) — SEC-001");

  // Out-of-scope UPDATE blocked (WITH CHECK).
  await asOwner();
  await c.query(`insert into public.projects (id, org_id, name) values ($1,$2,'Proj B2')`, [randomUUID(), B]);
  const P_B = (await c.query(`select id from public.projects where org_id=$1 and name='Proj B2'`, [B])).rows[0].id;
  await asUser(U_B);
  ok(await tryUpdate(`update public.projects set name='Proj B2 v2' where id=$1`, [P_B]),
     "admin B CAN rename their org's project");
  await asUser(U_A);
  ok(!(await tryUpdate(`update public.projects set name='hacked' where id=$1`, [P_B])),
     "admin A CANNOT update a project outside their scope — SEC-004");

  // SEC-004 — org_id immutability trigger (superadmin passes the policy, trigger still blocks).
  await asUser(U_S);
  ok(!(await tryUpdate(`update public.projects set org_id=$1 where id=$2`, [A, P_B])),
     "org_id is immutable even for superadmin — SEC-004 trigger");

  // Superadmin bypass for INSERT.
  ok(await tryInsert(`insert into public.projects (org_id, name) values ($1,'Proj B3')`, [B]),
     "superadmin CAN create a project in any org (bypass)");
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${fail === 0 ? `✅ All ${pass} RLS assertions passed.` : `❌ ${fail} assertion(s) failed.`}`);
process.exit(fail === 0 ? 0 : 1);