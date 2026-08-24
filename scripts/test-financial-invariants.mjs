#!/usr/bin/env node
// SiteTrack Pro — financial-chain invariant proof (migration 239).
//
// All inside a rolled-back tx (net read-only). Acts as authenticated users
// via SET LOCAL ROLE + JWT claims.
//
//   FC-001  structure: guard trigger on payments + chk_ra_paid_range live
//   FC-002  valid invoice payment within net receivable accepted
//   FC-003  overpayment beyond cap rejected, target untouched
//   FC-004  second payment filling exactly to the cap accepted
//   FC-005  payment UPDATE increasing amount past remaining room rejected
//   FC-006  cross-project target rejected (FI-1)
//   FC-007  dangling target_id rejected (FI-1)
//   FC-008  delete frees room (rejected insert succeeds afterwards)
//   FC-009  ra_bill: payment up to retention-adjusted net ok; excess rejected
//   FC-010  ra_bills.paid_amount > bill_amount blocked by CHECK (owner path)
//   FC-011  RLS layering: non-writer member insert denied regardless of guard
//   FC-012  invoice cap honours GST/TDS percentages (amount×(1+gst−tds))
//
// Usage: node scripts/test-financial-invariants.mjs   (npm run test:rls:finance)

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
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping financial-invariant tests.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const U_W = randomUUID(); // pm identity + project member (can_write_project)
const U_R = randomUUID(); // plain member without write (contributor-ish)
const A = randomUUID();
const P = randomUUID();

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  PASS ${label}`); } else { fail++; console.log(`  FAIL ${label}`); } };
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
};
/** Returns { rc, error } — rc>0 rows affected; rc=0 silent gate; rc=-1 raised error. */
const tryWrite = async (sql, params) => {
  try {
    await c.query("savepoint fc_sp");
    const r = await c.query(sql, params);
    await c.query("release savepoint fc_sp");
    return { rc: r.rowCount ?? 0, error: null };
  } catch (e) {
    await c.query("rollback to savepoint fc_sp");
    return { rc: -1, error: e.message };
  }
};
const one = async (sql, params) => (await c.query(sql, params)).rows[0];

try {
  await c.query("begin");
  await c.query("set local session_replication_role = 'replica'");

  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fc-writer@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','fc-reader@sitetrack.test', now(), now())`, [U_W, U_R]);
  await c.query(`insert into public.profiles (id, name, role) values ($1,'FC Writer','pm'), ($2,'FC Reader','architect')`, [U_W, U_R]);
  await c.query(`insert into public.organizations (id, name, slug, plan) values ($1,'FC Org',$2,'pro')`, [A, `fc-org-${randomUUID().slice(0, 8)}`]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'admin','active'), ($1,$3,'client','active')`, [A, U_W, U_R]);
  await c.query(`insert into public.projects (id, org_id, name, type, budget, status) values ($1,$2,'FC Project','construction',5000000,'active')`, [P, A]);
  await c.query(`insert into public.project_members (project_id, profile_id, role) values ($1,$2,'pm'), ($1,$3,'client')`, [P, U_W, U_R]);

  await c.query("set local session_replication_role = 'origin'"); // re-enable ordinary triggers

  // Targets: invoice ₹100k +18% GST −2% TDS → cap 116000; RA ₹200k @5% retention → net 190000.
  const INV = (await one(`insert into public.invoices (project_id, no, amount, gst, tds) values ($1,'FC-INV',100000,18,2) returning id`, [P])).id;
  const RA = (await one(`insert into public.ra_bills (project_id, no, bill_amount, retention_pct, paid_amount) values ($1,'FC-RA',200000,5,0) returning id`, [P])).id;
  // A second project + its invoice to prove the cross-project rejection
  // (seeded as owner NOW — U_W has no membership on P2 so RLS would block).
  const P2 = randomUUID();
  await c.query(`insert into public.projects (id, org_id, name, type, budget, status) values ($1,$2,'FC Project 2','construction',1000000,'active')`, [P2, A]);
  const INV2 = (await one(`insert into public.invoices (project_id, no, amount) values ($1,'FC-INV-P2',90000) returning id`, [P2])).id;

  await asUser(U_W);

  // ── FC-001 structure (pg_trigger: world-readable, role-independent) ──
  const trg = await c.query(`select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname='payments' and t.tgname='trg_payments_guard_target' and not t.tgisinternal`);
  ok(trg.rowCount === 1, "FC-001 guard trigger exists on payments");
  const chk = await c.query(`select 1 from information_schema.table_constraints where table_schema='public' and table_name='ra_bills' and constraint_name='chk_ra_paid_range'`);
  ok(chk.rowCount === 1, "FC-001 chk_ra_paid_range constraint live");

  // ── FC-002 valid invoice payment ──
  let w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,50000,'bank')`, [P, INV]);
  ok(w.rc === 1, `FC-002 payment within receivable accepted (rc=${w.rc} ${w.error ?? ""})`);
  const PAY1 = (await one(`select id from public.payments where target_id=$1 limit 1`, [INV]))?.id;

  // ── FC-003 overpayment rejected ──
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,70000,'bank')`, [P, INV]);
  ok(w.rc === -1 && /exceeds outstanding/.test(w.error ?? ""), "FC-003 overpayment rejected with clear error");

  // ── FC-004 fill exactly to cap (116000 − 50000 = 66000) ──
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,66000,'upi')`, [P, INV]);
  ok(w.rc === 1, `FC-004 exact-cap payment accepted (rc=${w.rc} ${w.error ?? ""})`);

  // ── FC-005 update past remaining room rejected ──
  w = await tryWrite(`update public.payments set amount=60000 where id=$1 and version=$2`, [PAY1, 1]);
  ok(w.rc === -1 && /exceeds outstanding/.test(w.error ?? ""), "FC-005 update increasing past cap rejected");

  // ── FC-006 cross-project target ──
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,1000,'cash')`, [P, INV2]);
  ok(w.rc === -1 && /different project/.test(w.error ?? ""), "FC-006 cross-project target rejected");
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,1000,'cash')`, [P2, INV]);
  ok(w.rc === -1 && /different project/.test(w.error ?? ""), "FC-006 reverse-direction cross-project rejected");

  // ── FC-007 dangling target ──
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,1000,'cash')`, [P, randomUUID()]);
  ok(w.rc === -1 && /does not exist/.test(w.error ?? ""), "FC-007 dangling target rejected");

  // ── FC-008 delete frees room ──
  // State before: PAY1(50k) + PAY-FC004(66k) = 116k = cap.
  w = await tryWrite(`delete from public.payments where id=$1`, [PAY1]);
  ok(w.rc === 1, "FC-008 delete allowed (frees room)");
  // Remaining paid = 66k ⇒ room = 50k: 51k must fail, 50k must fit exactly.
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,51000,'bank')`, [P, INV]);
  ok(w.rc === -1 && /exceeds outstanding/.test(w.error ?? ""), "FC-008 over-remaining insert still rejected");
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,50000,'bank')`, [P, INV]);
  ok(w.rc === 1, "FC-008 insert fitting the freed room accepted (back to exact cap)");

  // ── FC-009 ra_bill retention-adjusted cap (net 190000) ──
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'ra_bill',$2,190000,'bank')`, [P, RA]);
  ok(w.rc === 1, "FC-009 ra payment up to net payable accepted");
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'ra_bill',$2,1,'bank')`, [P, RA]);
  ok(w.rc === -1, "FC-009 ra payment of even ₹1 over cap rejected");

  // ── FC-010 paid_amount CHECK (owner path — authenticated has no direct policy need here) ──
  await c.query("reset role");
  let e = null;
  try { await c.query("savepoint fc10"); await c.query(`update public.ra_bills set paid_amount = bill_amount + 1 where id=$1`, [RA]); await c.query("release savepoint fc10"); }
  catch (err) { await c.query("rollback to savepoint fc10"); e = err.message; }
  ok(e !== null && /chk_ra_paid_range|check constraint/.test(e), "FC-010 paid_amount > bill_amount violates CHECK");
  await asUser(U_W);

  // ── FC-011 RLS layering: reader-role member cannot insert at all ──
  await asUser(U_R);
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,1000,'cash')`, [P, INV]);
  ok(w.rc === 0 || w.rc === -1, "FC-011 non-writer member insert gated by RLS (rc=" + w.rc + ")");
  await asUser(U_W);

  // ── FC-012 GST/TDS percentage math (cap = 100000×(1+18%−2%) = 116000) ──
  const totalPaid = (await one(`select coalesce(sum(amount),0)::numeric as n from public.payments where target_type='invoice' and target_id=$1`, [INV])).n;
  w = await tryWrite(`insert into public.payments (project_id, target_type, target_id, amount, method) values ($1,'invoice',$2,1,'cash')`, [P, INV]);
  ok(Number(totalPaid) === 116000 && w.rc === -1, "FC-012 invoice cap exactly 116000 (percentage-based)");
  const invRow = await one(`select round(amount*(1+gst/100.0-tds/100.0))::numeric as cap from public.invoices where id=$1`, [INV]);
  ok(Number(invRow.cap) === 116000, "FC-012 server formula matches expected percentage math");

  await c.query("rollback"); // net read-only
  console.log(`\n${pass}/${pass + fail} green`);
  await c.query("reset role");
  await c.end();
  process.exit(fail === 0 ? 0 : 1);
} catch (err) {
  console.error("Harness error:", err.message);
  try { await c.query("rollback"); await c.query("reset role"); await c.end(); } catch { /* best-effort teardown */ }
  process.exit(1);
}
