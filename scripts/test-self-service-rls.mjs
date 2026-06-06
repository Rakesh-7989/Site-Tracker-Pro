#!/usr/bin/env node
// SiteTrack Pro — RLS proof for self-service custom roles (migration 98).
//
// Acts as a NON-superadmin org admin (via SET LOCAL ROLE authenticated + a JWT
// sub claim) and proves the security boundary, all inside a rolled-back tx:
//   1. Enterprise org admin CAN define a custom role + grant a safe cap.
//   2. The SAME admin CANNOT grant a platform:* cap (privilege-escalation block).
//   3. A Basic-plan org admin CANNOT define a custom role (plan gate).
//
// READ-ONLY net effect (ROLLBACK). Usage: node scripts/test-self-service-rls.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]));

const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const U = randomUUID(); // temp user (fresh each run — no collisions)
const O = randomUUID(); // temp org
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  🟢 ${label}`); } else { fail++; console.log(`  🔴 ${label}`); } };
const asAdmin = async () => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${U}","role":"authenticated"}', true)`);
};
const asOwner = async () => { await c.query("reset role"); };
async function tryInsert(sql, params) {
  try { await c.query("savepoint sp"); await c.query(sql, params); await c.query("release savepoint sp"); return true; }
  catch { await c.query("rollback to savepoint sp"); return false; }
}

// Pre-clean any leftovers from a prior aborted run (committed, outside the tx).
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };
await clean(`delete from public.org_role_capabilities where org_role_id in (select id from public.org_roles where org_id=$1)`, [O]);
await clean(`delete from public.org_roles where org_id=$1`, [O]);
await clean(`delete from public.org_members where org_id=$1 or profile_id=$2`, [O, U]);
await clean(`delete from public.organizations where id=$1 or slug='rls-test-org'`, [O]);
await clean(`delete from public.profiles where id=$1 or name='RLS Test'`, [U]);
await clean(`delete from auth.users where id=$1 or email='rls-test@sitetrack.test'`, [U]);

try {
  await c.query("begin");
  // Seed with triggers OFF so handle_new_signup doesn't auto-create a profile/org.
  await c.query("set local session_replication_role = 'replica'");
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-test@sitetrack.test', now(), now())`, [U]);
  await c.query(`insert into public.profiles (id, name, role, is_staff) values ($1,'RLS Test','orgadmin', false)`, [U]);
  await c.query(`insert into public.organizations (id, slug, name, plan) values ($1,'rls-test-org','RLS Test Org','enterprise')`, [O]);
  await c.query(`insert into public.org_members (org_id, profile_id, role) values ($1,$2,'admin')`, [O, U]);
  await c.query("set local session_replication_role = 'origin'"); // triggers + RLS back on

  // Sanity: helpers behave for this user/org.
  await asAdmin();
  const sa = (await c.query("select public.is_superadmin() s")).rows[0].s;
  const tier = (await c.query("select public.has_org_tier($1,'admin') t", [O])).rows[0].t;
  const unlocked = (await c.query("select public.org_unlocks_custom_roles($1) u", [O])).rows[0].u;
  ok(sa === false, "test user is NOT superadmin");
  ok(tier === true, "test user IS org-tier admin of the enterprise org");
  ok(unlocked === true, "enterprise org unlocks custom_roles");

  // 1. Enterprise admin can define a custom role.
  const RID = randomUUID();
  ok(await tryInsert(`insert into public.org_roles (id, org_id, key, label, created_by) values ($1,$2,'site-lead','Site Lead',$3)`, [RID, O, U]),
     "enterprise admin CAN create a custom role");
  // 2a. Safe cap allowed.
  ok(await tryInsert(`insert into public.org_role_capabilities (org_role_id, capability) values ($1,'finance')`, [RID]),
     "enterprise admin CAN grant a safe cap (finance)");
  // 2b. platform:* cap blocked.
  ok(!(await tryInsert(`insert into public.org_role_capabilities (org_role_id, capability) values ($1,'platform:impersonate')`, [RID])),
     "enterprise admin CANNOT grant platform:* cap (escalation blocked)");

  // 3. Downgrade org to basic → admin can no longer define roles.
  await asOwner();
  await c.query("update public.organizations set plan='basic' where id=$1", [O]);
  await asAdmin();
  ok(!(await tryInsert(`insert into public.org_roles (id, org_id, key, label, created_by) values ($1,$2,'x','X',$3)`,
        [randomUUID(), O, U])),
     "basic-plan org admin CANNOT create a custom role (plan gate)");
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${fail === 0 ? `✅ All ${pass} RLS assertions passed.` : `❌ ${fail} assertion(s) failed.`}`);
process.exit(fail === 0 ? 0 : 1);
