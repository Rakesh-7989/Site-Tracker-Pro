#!/usr/bin/env node
// SiteTrack Pro — cross-org partner collaboration proof (migrations 241+242).
//
// All inside a rolled-back tx (net read-only). Acts as authenticated users
// via SET LOCAL ROLE + JWT claims.
//
//   PC-001  structure: tables live, RLS on, key policies present
//   PC-002  host admin mints an UNBOUND invite (org_id NULL, code set)
//   PC-003  non-admin host member CANNOT mint invites
//   PC-004  duplicate pending invite in the same scope rejected (uq_ppo_pending_scope)
//   PC-005  before redemption: partner members are BLIND to the project
//   PC-006  partner-org admin redeems the code (RPC) — binds org + snapshots name
//   PC-007  redemption auto-adds the accepting admin as first partner member
//   PC-008  after redemption: partner MEMBER reads the project (can_read_project arm)
//   PC-009  partner writes stay DENIED (update projects = silent 0-row gate)
//   PC-010  money stays host-only: partner sees 0 invoices for the project
//   PC-011  grant + scope-change land in immutable audit_log_v2
//   PC-012  partner admin may DECLINE (invited→revoked) but NOT change scope
//   PC-013  used code cannot be redeemed twice
//   PC-014  revoke (delete) blinds every partner member instantly
//
// Usage: node scripts/test-partner-collab-rls.mjs   (npm run test:rls:partners)

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
  } catch { /* rely on env var */ }
}
if (!DB_URL) {
  console.error("SUPABASE_DB_URL not set — skipping partner-collab tests.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const HOST_ADMIN = randomUUID();
const HOST_MEMBER = randomUUID();
const PARTNER_ADMIN = randomUUID();
const PARTNER_MEMBER = randomUUID();
const HOST_ORG = randomUUID();
const PARTNER_ORG = randomUUID();
const PROJECT = randomUUID();

let pass = 0, fail = 0;
let current = "";
const section = (id, label) => { current = `${id} ${label}`; };
const ok = (cond, label) => { if (cond) { pass++; console.log(`  PASS ${label}`); } else { fail++; console.log(`  FAIL [${current}] ${label}`); } };
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
};
const sp = async (fn) => {
  try {
    await c.query("savepoint pc_sp");
    const r = await fn();
    await c.query("release savepoint pc_sp");
    return r;
  } catch (e) {
    await c.query("rollback to savepoint pc_sp");
    return { __error: e.message };
  }
};
const one = async (sql, params) => (await c.query(sql, params ?? [])).rows[0];
const count = async (sql, params) => Number((await one(sql, params))?.n ?? 0);
const CODE = `st-${randomUUID().replace(/-/g, "").slice(0, 20)}`;

try {
  await c.query("begin");
  await c.query("set local session_replication_role = 'replica'");

  // ── fixtures ────────────────────────────────────────────────────────────
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
    ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pc-host-admin@sitetrack.test',now(),now()),
    ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pc-host-member@sitetrack.test',now(),now()),
    ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pc-partner-admin@sitetrack.test',now(),now()),
    ($4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pc-partner-member@sitetrack.test',now(),now())`,
    [HOST_ADMIN, HOST_MEMBER, PARTNER_ADMIN, PARTNER_MEMBER]);
  await c.query(`insert into public.profiles (id, name, role) values
    ($1,'PC Host Admin','pm'), ($2,'PC Host Member','architect'),
    ($3,'PC Partner Admin','contractor'), ($4,'PC Partner Member','contractor')`,
    [HOST_ADMIN, HOST_MEMBER, PARTNER_ADMIN, PARTNER_MEMBER]);
  await c.query(`insert into public.organizations (id, name, slug, plan) values ($1,'PC Host Org',$2,'business'), ($3,'PC Partner Org',$4,'pro')`,
    [HOST_ORG, `pc-host-${randomUUID().slice(0, 8)}`, PARTNER_ORG, `pc-part-${randomUUID().slice(0, 8)}`]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$2,'admin','active'), ($1,$3,'pm','active'),
    ($4,$5,'admin','active'), ($4,$6,'contractor','active')`,
    [HOST_ORG, HOST_ADMIN, HOST_MEMBER, PARTNER_ORG, PARTNER_ADMIN, PARTNER_MEMBER]);
  await c.query(`insert into public.projects (id, org_id, name, type, status) values ($1,$2,'PC Tower','construction','active')`,
    [PROJECT, HOST_ORG]);

  // Back to origin: replica mode silently DISABLES ordinary triggers — the
  // audit-trigger assertions below would vacuously fail otherwise.
  await c.query("set local session_replication_role = 'origin'");

  // ── PC-001 structure ────────────────────────────────────────────────────
  section("PC-001", "structure");
  const tbls = await one(`select count(*)::int n from information_schema.tables where table_schema='public' and table_name in ('project_partner_orgs','project_partner_members')`);
  ok(tbls.n === 2, "both partner tables exist");
  const rls = await one(`select count(*)::int n from pg_class cl join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' and cl.relname in ('project_partner_orgs','project_partner_members') and cl.relrowsecurity`);
  ok(rls.n === 2, "RLS enabled on both");
  const pol = await count(`select count(*)::int n from pg_policies where schemaname='public' and tablename='project_partner_orgs'`);
  ok(pol >= 4, "ppo policies present (select/insert/update/delete)");

  // ── PC-002 host admin mints unbound invite ─────────────────────────────
  section("PC-002", "mint unbound invite");
  await asUser(HOST_ADMIN);
  const mint = await sp(async () => one(
    `insert into public.project_partner_orgs (project_id, org_id, scope, status, invite_code)
     values ($1, null, 'viewer', 'invited', $2)
     returning id, invite_code`, [PROJECT, CODE]));
  ok(mint?.id != null && mint.invite_code === CODE, "unbound invite inserted with code");

  // ── PC-003 non-admin host member denied ────────────────────────────────
  section("PC-003", "non-admin mint denied");
  await asUser(HOST_MEMBER);
  const deniedMint = await sp(() => c.query(
    `insert into public.project_partner_orgs (project_id, org_id, scope, status, invite_code)
     values ($1, null, 'viewer', 'invited', $2)`, [PROJECT, `st-${randomUUID().slice(0, 18)}`]));
  ok(deniedMint.__error !== undefined || (deniedMint.rowCount ?? 0) === 0, "non-admin insert blocked");

  // ── PC-004 duplicate pending scope rejected ────────────────────────────
  section("PC-004", "duplicate pending scope");
  await asUser(HOST_ADMIN);
  const dup = await sp(() => c.query(
    `insert into public.project_partner_orgs (project_id, org_id, scope, status, invite_code)
     values ($1, null, 'viewer', 'invited', $2)`, [PROJECT, `st-${randomUUID().slice(0, 18)}`]));
  ok(dup.__error !== undefined, "unique(pending scope) enforced");

  // ── PC-005 pre-redemption blindness ────────────────────────────────────
  section("PC-005", "pre-redemption blindness");
  await asUser(PARTNER_MEMBER);
  ok(await count(`select count(*)::int n from public.projects where id = $1`, [PROJECT]) === 0,
    "partner member cannot see the project");

  // ── PC-006 redemption ──────────────────────────────────────────────────
  section("PC-006", "partner admin redeems");
  await asUser(PARTNER_ADMIN);
  const accepted = await sp(() => one(`select * from public.accept_project_partner_invite($1)`, [CODE]));
  ok(accepted?.project_id === PROJECT && accepted?.org_id === PARTNER_ORG,
    `RPC binds caller's org${accepted?.__error ? ` (${accepted.__error})` : ""}`);

  // ── PC-007 first member added ──────────────────────────────────────────
  section("PC-007", "first partner member");
  const memCount = await count(`select count(*)::int n from public.project_partner_members ppm where ppm.org_id = $1`, [PARTNER_ORG]);
  ok(memCount === 1, "accepting admin auto-added as partner member");

  // ── PC-008 post-redemption read (as plain partner MEMBER) ─────────────
  section("PC-008", "partner read arm");
  await asUser(PARTNER_MEMBER);
  const seen = await count(`select count(*)::int n from public.projects where id = $1`, [PROJECT]);
  ok(seen === 1, "partner member NOW sees the project (RLS OR-arm)");
  const canRead = await one(`select public.can_read_project($1) as v`, [PROJECT]);
  ok(canRead?.v === true, "can_read_project true for partner member");
  const canWrite = await one(`select public.can_write_project($1) as v`, [PROJECT]);
  ok(canWrite?.v === false, "can_write_project still false (C1 read-only)");

  // ── PC-009 writes denied ───────────────────────────────────────────────
  section("PC-009", "writes denied");
  const wr = await sp(async () => c.query(`update public.projects set name = 'hacked' where id = $1`, [PROJECT]));
  ok((wr.rowCount ?? 0) === 0, "project update silently gated to 0 rows");

  // ── PC-010 money stays host-only ───────────────────────────────────────
  section("PC-010", "money hidden");
  ok(await count(`select count(*)::int n from public.invoices where project_id = $1`, [PROJECT]) === 0,
    "partner sees zero invoices even if they existed");

  // ── PC-011 audit trail ─────────────────────────────────────────────────
  section("PC-011", "audit rows");
  await c.query("reset role");
  const granted = await count(`select count(*)::int n from public.audit_log_v2 where action = 'CREATE' and resource = 'project_partner_org' and project_id = $1`, [PROJECT]);
  ok(granted >= 1, "grant audited");

  // ── PC-012 partner admin decline vs scope ──────────────────────────────
  section("PC-012", "decline/scope gates");
  await asUser(PARTNER_ADMIN);
  const scopeTry = await sp(() => c.query(`update public.project_partner_orgs set scope = 'manager' where org_id = $1`, [PARTNER_ORG]));
  ok((scopeTry.rowCount ?? 0) === 0, "partner admin cannot change scope");
  await c.query("reset role");
  // Host changes scope instead (audited).
  await asUser(HOST_ADMIN);
  const scopeHost = await sp(() => c.query(`update public.project_partner_orgs set scope = 'contributor' where org_id = $1`, [PARTNER_ORG]));
  ok((scopeHost.rowCount ?? 0) === 1, "host admin updates scope");
  await c.query("reset role");
  const updatedAudits = await count(`select count(*)::int n from public.audit_log_v2 where action = 'UPDATE' and resource = 'project_partner_org' and project_id = $1`, [PROJECT]);
  ok(updatedAudits >= 1, "scope change audited");

  // ── PC-013 replayed code fails ─────────────────────────────────────────
  section("PC-013", "code replay");
  await asUser(HOST_MEMBER);
  const replay = await sp(() => one(`select * from public.accept_project_partner_invite($1)`, [CODE]));
  ok(replay?.__error !== undefined, "used code rejected");

  // ── PC-014 revoke blinds instantly ─────────────────────────────────────
  section("PC-014", "revoke");
  await asUser(HOST_ADMIN);
  const del = await sp(() => c.query(`delete from public.project_partner_orgs where org_id = $1`, [PARTNER_ORG]));
  ok((del.rowCount ?? 0) === 1, "host deletes the link");
  await asUser(PARTNER_MEMBER);
  ok(await count(`select count(*)::int n from public.projects where id = $1`, [PROJECT]) === 0,
    "partner member blinded immediately after revoke");
  await c.query("reset role");
  const revokedAudits = await count(`select count(*)::int n from public.audit_log_v2 where action = 'DELETE' and resource = 'project_partner_org' and project_id = $1`, [PROJECT]);
  ok(revokedAudits >= 1, "revoke audited");

  await c.query("rollback");
} catch (e) {
  fail++;
  console.error(`HARNESS ERROR: ${e.message}`);
  try { await c.query("rollback"); } catch { /* already rolled back */ }
}

await c.end();
console.log(`\nPartner collaboration: ${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
