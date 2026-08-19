#!/usr/bin/env node
// SiteTrack Pro — RLS proof for multi-org isolation (SEC-03) + client portal
// isolation (SEC-08), phase 1.4.
//
// Acts as non-superadmin users (via SET LOCAL ROLE authenticated + a JWT sub
// claim) and proves the security boundary, all inside a rolled-back tx:
//   SEC-03:
//     ISO-001  an org A admin can read org A but NOT org B's organizations row
//     ISO-002  org-scoped tables (org_members, leads, procurement_quotes,
//              vendors) in org B are invisible to an org A user
//     ISO-003  set_tenant_context is membership-gated: org A user CAN set A,
//              CANNOT set B; null ok; superadmin CAN set any org
//   SEC-08 (client portal — email-linked client, no org/project membership):
//     CL-001  client sees their email-matched project P_A but NOT P_B
//     CL-002  client CANNOT read purchase_orders / ra_bills of their own project
//     CL-003  client sees ONLY current drawings released_to client
//     CL-004  client CANNOT read another project's invoices / milestones
//     CL-005  client CAN read their own project's invoices / milestones
//
// READ-ONLY net effect (ROLLBACK). Usage: node scripts/test-multi-org-client-portal-rls.mjs

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
const U_C = randomUUID(); // client (email-linked only)
const A = randomUUID();
const B = randomUUID();
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  \u{1F7E2} ${label}`); } else { fail++; console.log(`  \u{1F534} ${label}`); } };
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
};
const asOwner = async () => { await c.query("reset role"); };
async function countFor(sql, params) {
  const r = await c.query(sql, params);
  return r.rows[0].n;
}
async function trySetTenant(sub, orgId) {
  await asUser(sub);
  try {
    await c.query("savepoint sp");
    await c.query(`select public.set_tenant_context($1::uuid)`, [orgId]);
    await c.query("release savepoint sp");
    return true;
  } catch {
    await c.query("rollback to savepoint sp");
    return false;
  } finally {
    await asOwner();
  }
}

// Pre-clean leftovers from a prior aborted run (committed, outside the tx).
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };
await clean(`delete from public.procurement_quotes where org_id in ($1,$2)`, [A, B]);
await clean(`delete from public.leads where org_id in ($1,$2)`, [A, B]);
await clean(`delete from public.ra_bills where project_id in (select id from public.projects where org_id in ($1,$2))`, [A, B]);
await clean(`delete from public.purchase_orders where project_id in (select id from public.projects where org_id in ($1,$2))`, [A, B]);
await clean(`delete from public.payments where project_id in (select id from public.projects where org_id in ($1,$2))`, [A, B]);
await clean(`delete from public.invoices where project_id in (select id from public.projects where org_id in ($1,$2))`, [A, B]);
await clean(`delete from public.milestones where project_id in (select id from public.projects where org_id in ($1,$2))`, [A, B]);
await clean(`delete from public.drawings where project_id in (select id from public.projects where org_id in ($1,$2))`, [A, B]);
await clean(`delete from public.vendors where org_id in ($1,$2)`, [A, B]);
await clean(`delete from public.project_members where profile_id in ($3,$4,$5,$6) or project_id in (select id from public.projects where org_id in ($1,$2))`, [A, B, U_A, U_B, U_S, U_C]);
await clean(`delete from public.org_members where org_id in ($1,$2) or profile_id in ($3,$4,$5,$6)`, [A, B, U_A, U_B, U_S, U_C]);
await clean(`delete from public.projects where org_id in ($1,$2)`, [A, B]);
await clean(`delete from public.organizations where id in ($1,$2)`, [A, B]);
await clean(`delete from public.profiles where id in ($1,$2,$3,$4)`, [U_A, U_B, U_S, U_C]);
await clean(`delete from auth.users where id in ($1,$2,$3,$4)`, [U_A, U_B, U_S, U_C]);

try {
  await c.query("begin");
  await c.query("set local session_replication_role = 'replica'");
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','iso-a@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','iso-b@sitetrack.test', now(), now()),
           ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','iso-s@sitetrack.test', now(), now()),
           ($4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','client.iso@sitetrack.test', now(), now())`, [U_A, U_B, U_S, U_C]);
  await c.query(`insert into public.profiles (id, name, role, is_staff) values
    ($1,'Iso A Admin','orgadmin', false),
    ($2,'Iso B Admin','orgadmin', false),
    ($3,'Iso Super','superadmin', true),
    ($4,'Iso Client','client', false)`, [U_A, U_B, U_S, U_C]);
  await c.query(`insert into public.organizations (id, slug, name, plan) values
    ($1,'iso-org-a','Iso Org A','enterprise'),
    ($2,'iso-org-b','Iso Org B','enterprise')`, [A, B]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$2,'admin','active'),
    ($3,$4,'admin','active')`, [A, U_A, B, U_B]);

  // Projects: P_A (org A, client_email = client), P_B (org B).
  await c.query(`insert into public.projects (id, org_id, name, type, status, client_email) values
    ($1,$2,'Iso Proj A','construction','active','client.iso@sitetrack.test'),
    ($3,$4,'Iso Proj B','construction','active',null)`, [randomUUID(), A, randomUUID(), B]);
  const P_A = (await c.query(`select id from public.projects where org_id=$1 and name='Iso Proj A'`, [A])).rows[0].id;
  const P_B = (await c.query(`select id from public.projects where org_id=$1 and name='Iso Proj B'`, [B])).rows[0].id;

  // Org-scoped rows in org B (must be invisible to org A users).
  await c.query(`insert into public.leads (org_id, name, stage) values ($1,'B Lead','new')`, [B]);
  await c.query(`insert into public.procurement_quotes (org_id, item_name, unit_price, qty, status) values
    ($1,'B Quote',100,2,'received')`, [B]);
  await c.query(`insert into public.vendors (org_id, name, category) values ($1,'B Vendor','materials')`, [B]);

  // Project-scoped rows on P_A for client portal bounds.
  await c.query(`insert into public.milestones (project_id, title, status) values
    ($1,'A Foundation','pending')`, [P_A]);
  await c.query(`insert into public.milestones (project_id, title, status) values
    ($1,'B Foundation','pending')`, [P_B]);
  await c.query(`insert into public.invoices (project_id, no, amount, status) values
    ($1,'INV-A-1',100000,'sent')`, [P_A]);
  await c.query(`insert into public.invoices (project_id, no, amount, status) values
    ($1,'INV-B-1',100000,'sent')`, [P_B]);
  await c.query(`insert into public.purchase_orders (project_id, po_no, amount) values
    ($1,'PO-A-1',50000)`, [P_A]);
  await c.query(`insert into public.ra_bills (project_id, no, bill_amount, status) values
    ($1,'RA-A-1',20000,'submitted')`, [P_A]);
  await c.query(`insert into public.drawings (project_id, title, type, status, released_to) values
    ($1,'A Released Plan','architectural','current','{client}'),
    ($1,'A Secret Plan','architectural','current','{pm}')`, [P_A]);

  await c.query("set local session_replication_role = 'origin'"); // triggers + RLS back on

  // ── SEC-03: multi-org isolation ─────────────────────────────────────────
  await asUser(U_A);
  const orgsA = (await c.query("select public.user_org_ids() o")).rows[0].o;
  ok(orgsA.includes(A) && !orgsA.includes(B), "admin A is active member of org A only");

  const nOrgB = await countFor(`select count(*)::int n from public.organizations where id = $1`, [B]);
  const nOrgA = await countFor(`select count(*)::int n from public.organizations where id = $1`, [A]);
  ok(nOrgA === 1 && nOrgB === 0, "admin A reads org A but NOT org B organizations row — ISO-001");

  ok((await countFor(`select count(*)::int n from public.org_members where org_id = $1`, [B])) === 0,
     "admin A cannot read org B's org_members — ISO-002");
  ok((await countFor(`select count(*)::int n from public.leads where org_id = $1`, [B])) === 0,
     "admin A cannot read org B's leads — ISO-002");
  ok((await countFor(`select count(*)::int n from public.procurement_quotes where org_id = $1`, [B])) === 0,
     "admin A cannot read org B's procurement_quotes — ISO-002");
  ok((await countFor(`select count(*)::int n from public.vendors where org_id = $1`, [B])) === 0,
     "admin A cannot read org B's vendors — ISO-002");
  await asOwner();

  ok(await trySetTenant(U_A, A), "admin A CAN set tenant context to org A — ISO-003");
  ok(!(await trySetTenant(U_A, B)), "admin A CANNOT set tenant context to org B — ISO-003");
  ok(!(await trySetTenant(U_C, A)), "email-linked client CANNOT set tenant context to org A — ISO-003");
  ok(await trySetTenant(U_S, B), "superadmin CAN set tenant context to any org — ISO-003");

  // ── SEC-08: client portal isolation (email-linked client) ───────────────
  await asUser(U_C);
  const visC = (await c.query(`select id from public.projects where id = any($1::uuid[])`, [[P_A, P_B]])).rows.map(r => r.id);
  ok(visC.includes(P_A) && !visC.includes(P_B), "client sees email-matched P_A but NOT P_B — CL-001");

  ok((await countFor(`select count(*)::int n from public.purchase_orders where project_id = $1`, [P_A])) === 0,
     "client CANNOT read purchase_orders of their own project — CL-002");
  ok((await countFor(`select count(*)::int n from public.ra_bills where project_id = $1`, [P_A])) === 0,
     "client CANNOT read ra_bills of their own project — CL-002");

  const drw = (await c.query(`select title from public.drawings where project_id = $1 order by title`, [P_A])).rows.map(r => r.title);
  ok(drw.length === 1 && drw[0] === "A Released Plan", "client sees ONLY the released-to-client drawing — CL-003");

  ok((await countFor(`select count(*)::int n from public.invoices where project_id = $1`, [P_B])) === 0 &&
     (await countFor(`select count(*)::int n from public.milestones where project_id = $1`, [P_B])) === 0,
     "client CANNOT read another project's invoices / milestones — CL-004");

  ok((await countFor(`select count(*)::int n from public.invoices where project_id = $1`, [P_A])) === 1 &&
     (await countFor(`select count(*)::int n from public.milestones where project_id = $1`, [P_A])) === 1,
     "client CAN read their own project's invoices / milestones — CL-005");
  await asOwner();
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${fail === 0 ? `\u2705 All ${pass} RLS assertions passed.` : `\u274C ${fail} assertion(s) failed.`}`);
process.exit(fail === 0 ? 0 : 1);