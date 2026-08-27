#!/usr/bin/env node
// SiteTrack Pro — RLS proof for the RBAC V2 → RLS shadow wiring (migration 217).
//
// Phase 1 / 1.1 (SEC-01, RBAC V2). Migration 217 added v2_policy_check() — a
// mode-aware gate ANDed into the org-scoped domain policies of leads /
// research_documents / research_collections / collection_documents /
// procurement_quotes:
//   matrix  → true (V2 off; matrix decides)
//   shadow  → computes v2_check_access() but returns true (matrix decides —
//             zero behavior change; the V2 path is exercised per row)
//   enforce → returns v2_check_access() (V2 decides)
//
// This suite proves the ladder inside a rolled-back tx on `leads`:
//   1. matrix: a plain org member CAN insert a lead (matrix decides).
//   2. matrix: the member CAN read an admin-created lead.
//   3. After an explicit resource_acl_entries DENY for crm:manage on the org
//      (subject = the member): matrix STILL allows the insert — the V2 deny is
//      ignored → zero behavior change.
//   4. shadow: the member STILL allows the insert — V2 deny computed but matrix
//      decides → zero behavior change (the 1.1 DoD).
//   5. enforce: the SAME insert is now blocked — the V2 deny wins → the gate is
//      real and wired.
//   6. enforce: the member CAN still read the lead (crm:view has NO deny) →
//      capability-specific gating.
//   7. enforce: the org admin (no deny entry) CAN still insert → only the denied
//      subject is affected.
//
// READ-ONLY net effect (ROLLBACK). Usage: node scripts/test-rbac-v2-shadow.mjs

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
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping RBAC V2 shadow RLS tests.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const U = randomUUID();  // org admin
const M = randomUUID();  // org member (subject of the V2 deny)
const O = randomUUID();  // temp org
const L1 = randomUUID(); // lead created by the org admin
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  🟢 ${label}`); } else { fail++; console.log(`  🔴 ${label}`); } };
const asUser = async (id) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${id}","role":"authenticated"}', true)`);
};
const asPostgres = async () => { await c.query("reset role"); };
// Run `fn` inside a savepoint so a denied statement doesn't abort the tx.
const inTx = async (fn) => {
  await c.query("savepoint sp");
  try { const out = await fn(); await c.query("release savepoint sp"); return { ok: true, val: out }; }
  catch (e) { await c.query("rollback to savepoint sp"); return { ok: false, err: e.message }; }
};
const setMode = async (mode) => {
  await asPostgres();
  await c.query(`update public.org_rbac_settings set mode=$1 where org_id=$2`, [mode, O]);
};

// Pre-clean any leftovers from a prior aborted run (committed, outside the tx).
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };
await clean(`delete from public.resource_acl_entries where org_id=$1`, [O]);
await clean(`delete from public.org_rbac_settings where org_id=$1`, [O]);
await clean(`delete from public.leads where org_id=$1`, [O]);
await clean(`delete from public.org_members where org_id=$1 or profile_id=$2 or profile_id=$3`, [O, U, M]);
await clean(`delete from public.organizations where id=$1`, [O]);
await clean(`delete from public.profiles where id=$1 or id=$2`, [U, M]);
await clean(`delete from auth.users where id=$1 or id=$2`, [U, M]);

try {
  await c.query("begin");
  // Seed with triggers OFF so handle_new_signup doesn't auto-create profiles/orgs.
  await c.query("set local session_replication_role = 'replica'");
  for (const [id, email, role, name] of [
    [U, 'v2-admin@sitetrack.test', 'orgadmin', 'V2 Admin'],
    [M, 'v2-member@sitetrack.test', 'architect', 'V2 Member'],
  ]) {
    await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2, now(), now())`, [id, email]);
    await c.query(`insert into public.profiles (id, name, role, is_staff) values ($1,$2,$3, false)`, [id, name, role]);
  }
  await c.query(`insert into public.organizations (id, slug, name, plan) values ($1,'rls-v2-shadow-org','RLS V2 Shadow','enterprise')`, [O]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'admin','active')`, [O, U]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'architect','active')`, [O, M]);
  // Org V2 mode defaults to matrix (V2 off).
  await c.query(`insert into public.org_rbac_settings (org_id, mode) values ($1,'matrix')`, [O]);
  await c.query("set local session_replication_role = 'origin'"); // triggers + RLS back on

  // 1. matrix: plain member CAN insert a lead.
  await asUser(M);
  const m1 = await inTx(() => c.query(
    `insert into public.leads (id, org_id, name, stage) values ($1,$2,'V2 Lead','new')`, [randomUUID(), O]));
  ok(m1.ok, "matrix: org member CAN insert a lead");

  // 2. matrix: member reads the admin-created lead.
  await asUser(U);
  await inTx(() => c.query(
    `insert into public.leads (id, org_id, name, stage) values ($1,$2,'Admin Lead','new')`, [L1, O]));
  await asUser(M);
  const m2 = await inTx(() => c.query(`select count(*)::int n from public.leads where id=$1`, [L1]));
  ok(m2.ok && m2.val.rows[0].n === 1, "matrix: org member CAN read admin-created lead");

  // Explicit V2 deny: crm:manage on the org, subject = the member (M).
  await asPostgres();
  await c.query(
    `insert into public.resource_acl_entries (org_id, resource_type, resource_id, subject_type, subject_id, capability, effect)
     values ($1,'org',$1,'user',$2::text,'crm:manage','deny')`, [O, M]);

  // 3. matrix: the deny is IGNORED — matrix still decides (zero behavior change).
  await asUser(M);
  const m3 = await inTx(() => c.query(
    `insert into public.leads (id, org_id, name, stage) values ($1,$2,'V2 Lead','new')`, [randomUUID(), O]));
  ok(m3.ok, "matrix: member STILL inserts despite V2 crm:manage DENY (deny ignored)");

  // 4. shadow: V2 deny computed but matrix decides → zero behavior change (DoD).
  await setMode("shadow");
  await asUser(M);
  const m4 = await inTx(() => c.query(
    `insert into public.leads (id, org_id, name, stage) values ($1,$2,'V2 Lead','new')`, [randomUUID(), O]));
  ok(m4.ok, "shadow: member STILL inserts despite V2 crm:manage DENY (matrix decides — zero change)");

  // 5. enforce: the same insert is now BLOCKED — the V2 deny wins (gate is wired).
  await setMode("enforce");
  await asUser(M);
  const m5 = await inTx(() => c.query(
    `insert into public.leads (id, org_id, name, stage) values ($1,$2,'V2 Lead','new')`, [randomUUID(), O]));
  ok(!m5.ok, "enforce: member insert now BLOCKED by V2 crm:manage DENY");

  // 6. enforce: crm:view has NO deny → the member can still read (capability-specific).
  const m6 = await inTx(() => c.query(`select count(*)::int n from public.leads where id=$1`, [L1]));
  ok(m6.ok && m6.val.rows[0].n === 1, "enforce: member CAN still read (crm:view not denied)");

  // 7. enforce: the org admin (no deny entry) CAN still insert — only M is affected.
  await asUser(U);
  const m7 = await inTx(() => c.query(
    `insert into public.leads (id, org_id, name, stage) values ($1,$2,'Admin Lead','new')`, [randomUUID(), O]));
  ok(m7.ok, "enforce: org admin (no deny) CAN still insert");
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${fail === 0 ? `✅ All ${pass} RBAC-V2-shadow RLS assertions passed.` : `❌ ${fail} assertion(s) failed.`}`);
process.exit(fail === 0 ? 0 : 1);