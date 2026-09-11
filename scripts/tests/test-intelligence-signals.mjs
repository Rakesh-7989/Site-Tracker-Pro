#!/usr/bin/env node
// SiteTrack Pro — verification for migration 263/265 (intelligence signals).
//
// Proves, against the LIVE DB inside a rolled-back tx (net read-only):
//   INT-001  cost_forecast math: v_vals=[100,80,60] (current/prev/prev-1 month),
//            budget 250, expected_end_date +15d, one REJECTED expense ignored.
//            slope=(3*sxy-6*sy)/6 = (1320-1440)/6 = -20; burn=greatest(0,80-40)=40;
//            months=ceil(15/30)=1; projected=240+40=280; remaining=250-240=10;
//            overrun=greatest(0,40-10)=30; confidence=0.8 (n=3). Re-run is
//            idempotent (ON CONFLICT upsert -> 1 table row). RPC returns 5 cols
//            (no computed_at).
//   INT-002  labour_metrics math: prev ISO week vWs..vWs+6. 5 shift_roster rows
//            (scheduled=5), 3 labour_register (wages 500/400/300), 3 attendance
//            present (hours 9, overtime 2, one per labour). rate=3/5=0.6;
//            hours=27; otr=round(6/27,4)=0.2222; cost=500+400+300=1200;
//            output_units/units_per_labour_day/cost_per_unit = NULL by design.
//   INT-003  material_stockout math at offsets from today (in/out/wastage with
//            direction semantics): cement 86/30.00/14/86.0 ok; paint 1/2.14/14/14.0
//            critical; nails monthly 0 -> days null, not critical; sand 50/21.43/
//            14/70.0 ok (wastage subtracts); steel 20/21.43/lead 30 (org quote)/
//            28.0 critical.
//   INT-004  gating + RLS: orgadmin and pm can run project stockout; only orgadmin
//            + superadmin can run cost/labour ("insufficient privileges");
//            cross-org denial; unknown project -> cost/labour "project not found",
//            stockout "insufficient privileges"; result tables SELECT-only via
//            can_read_project (foreign org sees 0 rows, admin/super see them);
//            authenticated INSERT denied by grants.
//   INT-005  pg_cron: 'compute-cost-forecast' at 30 2 1 * *,
//            'compute-labour-metrics' at 30 23 * * 0, no stockout job.
//
// Usage: npm run test:rls:intel

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
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping intelligence-signal tests.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const U_A = randomUUID(); // orgadmin identity in org A
const U_M = randomUUID(); // ordinary pm member in org A
const U_B = randomUUID(); // orgadmin identity in org B (foreign-org probe)
const U_S = randomUUID(); // superadmin
const ORG_A = randomUUID();
const ORG_B = randomUUID();
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  🟢 ${label}`); } else { fail++; console.log(`  🔴 ${label}`); } };
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
};
const isoAddDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const expectError = async (label, fn, needle) => {
  try {
    await c.query("savepoint probe");
    await fn();
    await c.query("release savepoint probe");
    ok(false, `${label}: expected error, none thrown`);
  } catch (e) {
    await c.query("rollback to savepoint probe");
    const msg = String(e.message || "");
    ok(msg.includes(needle), `${label}: raised "${needle}" (got: ${msg.slice(0, 120)})`);
  }
};

// Pre-clean leftovers from a prior aborted run (committed, outside the tx).
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };
await clean(`delete from public.projects where org_id in ($1,$2)`, [ORG_A, ORG_B]);
await clean(`delete from public.org_members where org_id in ($1,$2) or profile_id in ($3,$4,$5)`, [ORG_A, ORG_B, U_A, U_M, U_S]);
await clean(`delete from public.organizations where id in ($1,$2)`, [ORG_A, ORG_B]);
await clean(`delete from public.profiles where id in ($1,$2,$3,$4)`, [U_A, U_M, U_B, U_S]);
await clean(`delete from auth.users where id in ($1,$2,$3,$4)`, [U_A, U_M, U_B, U_S]);

try {
  await c.query("begin");
  await c.query("set local session_replication_role = 'replica'");

  // ── Fixtures: users / profiles / orgs / memberships ────────────────────────
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','int-admin@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','int-member@sitetrack.test', now(), now()),
           ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','int-other@sitetrack.test', now(), now()),
           ($4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','int-super@sitetrack.test', now(), now())`,
    [U_A, U_M, U_B, U_S]);
  await c.query(`insert into public.profiles (id, name, role, is_staff) values
    ($1,'Intel Admin','orgadmin', false),
    ($2,'Intel Member','pm', false),
    ($3,'Intel OtherOrg','orgadmin', false),
    ($4,'Intel Super','superadmin', true)`, [U_A, U_M, U_B, U_S]);
  await c.query(`insert into public.organizations (id, slug, name, plan) values
    ($1,'int-org-a','Intel Org A','pro'),
    ($2,'int-org-b','Intel Org B','pro')`, [ORG_A, ORG_B]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$3,'admin','active'),
    ($1,$4,'pm','active'),
    ($2,$5,'admin','active')`, [ORG_A, ORG_B, U_A, U_M, U_B]);

  // ── Reference clock (IST) ──────────────────────────────────────────────────
  const clk = await c.query(`select
      (now() at time zone 'Asia/Kolkata')::date::text as d,
      (date_trunc('week', (now() at time zone 'Asia/Kolkata')::date) - interval '7 days')::date::text as ws`);
  const vt = clk.rows[0].d;      // 'YYYY-MM-DD'
  const vWs = clk.rows[0].ws;    // previous ISO week Monday
  const vMonth = vt.slice(0, 7); // 'YYYY-MM'

  // ── Projects ───────────────────────────────────────────────────────────────
  const PA = randomUUID(); // org A — cost + labour + stockout fixture
  const PB = randomUUID(); // org A — no-expense positive control
  const PF = randomUUID(); // org B — cross-org probe
  await c.query(`insert into public.projects (id, org_id, name, status, budget, expected_end_date) values
    ($1,$2,'INT fixture','active',250, $3::date + 15),
    ($4,$2,'INT control','active',100, null),
    ($5,$6,'INT foreign','active',100, null)`,
    [PA, ORG_A, vt, PB, PF, ORG_B]);

  // ── INT-001 fixtures: expenses (months m0/m1/m2 + ignored rejected) ────────
  await c.query(`insert into public.expenses (project_id, category, description, amount, expense_date, status) values
    ($1,'material','m0',100, (date_trunc('month', $2::date))::date, 'recorded'),
    ($1,'material','m1',80,  (date_trunc('month', $2::date) - interval '1 month')::date, 'recorded'),
    ($1,'material','m2',60,  (date_trunc('month', $2::date) - interval '2 months')::date, 'recorded'),
    ($1,'material','rejected',500, (date_trunc('month', $2::date))::date, 'rejected')`, [PA, vt]);

  // ── INT-002 fixtures: shift roster + labour register + attendance ──────────
  for (let i = 0; i < 5; i++) {
    await c.query(`insert into public.shift_roster (project_id, worker_name, shift_date, shift_name)
      values ($1,$2,$3::date,'day')`, [PA, `W${i + 1}`, isoAddDays(vWs, i)]);
  }
  const regs = await c.query(`insert into public.labour_register (project_id, name, trade, wage)
    values ($1,'L1','mason',500),($1,'L2','carpenter',400),($1,'L3','helper',300) returning id`,
    [PA]);
  const [L1, L2, L3] = regs.rows.map(r => r.id);
  await c.query(`insert into public.attendance
    (project_id, attendee_kind, attendee_name, labour_id, date, status, hours, overtime) values
    ($1,'labour','L1',$2,$4::date,'present',9,2),
    ($1,'labour','L2',$3,$5::date,'present',9,2),
    ($1,'labour','L3',$6,$7::date,'present',9,2)`,
    [PA, L1, L2, isoAddDays(vWs, 1), isoAddDays(vWs, 2), L3, isoAddDays(vWs, 3)]);

  // ── INT-003 fixtures: inventory transactions ───────────────────────────────
  await c.query(`insert into public.inventory_transactions (project_id, material, unit, qty, direction, txn_date) values
    ($1,'cement','bags',100,'inward', $2::date - 40),
    ($1,'cement','bags',10,'outward', $2::date - 10),
    ($1,'cement','bags',4,'outward',  $2::date - 3),
    ($1,'paint','ltr',2,'inward',      $2::date - 30),
    ($1,'paint','ltr',1,'outward',     $2::date - 3),
    ($1,'nails','kg',10,'inward',      $2::date - 30),
    ($1,'sand','cubm',100,'inward',    $2::date - 30),
    ($1,'sand','cubm',10,'outward',    $2::date - 5),
    ($1,'sand','cubm',40,'wastage',    $2::date - 1),
    ($1,'steel','ton',30,'inward',     $2::date - 40),
    ($1,'steel','ton',10,'outward',    $2::date - 3)`, [PA, vt]);
  // Org quote drives steel's lead time (project_id null -> org-wide match).
  await c.query(`insert into public.procurement_quotes (org_id, project_id, item_name, lead_days, status)
    values ($1,null,'Steel rod 16mm',30,'received')`, [ORG_A]);

  await c.query("set local session_replication_role = 'origin'");

  // ── INT-001: cost forecast ─────────────────────────────────────────────────
  console.log("\nINT-001 cost_forecast math");
  await asUser(U_A);
  const cost = await c.query(
    `select project_id, forecast_month::text as forecast_month, projected_spend,
            projected_overrun, confidence
       from public.compute_cost_forecast($1::uuid)`, [PA]);
  const cf = cost.rows[0];
  ok(cost.rowCount === 1, `single forecast row (got ${cost.rowCount})`);
  ok(cf.forecast_month === `${vMonth}-01`, `forecast_month = ${vMonth}-01 (got ${cf.forecast_month})`);
  ok(Number(cf.projected_spend) === 280, `projected_spend 280 (got ${cf.projected_spend})`);
  ok(Number(cf.projected_overrun) === 30, `projected_overrun 30 (got ${cf.projected_overrun})`);
  ok(Number(cf.confidence) === 0.8, `confidence 0.8 (got ${cf.confidence})`);
  ok(!Object.prototype.hasOwnProperty.call(cf, "computed_at"), "RPC returns 5 cols, no computed_at");
  await c.query(`select * from public.compute_cost_forecast($1::uuid)`, [PA]);
  const ctab = await c.query(`select count(*)::int as n, bool_and(computed_at is not null) as has_ts
    from public.cost_forecast where project_id = $1`, [PA]);
  ok(ctab.rows[0].n === 1, `idempotent re-run: 1 table row (got ${ctab.rows[0].n})`);
  ok(ctab.rows[0].has_ts === true, "table row carries computed_at");

  // ── INT-002: labour metrics ────────────────────────────────────────────────
  console.log("INT-002 labour_metrics math");
  const lab = await c.query(
    `select project_id, week_start::text as week_start, attendance_rate, overtime_ratio,
            labour_hours, labour_cost, output_units, units_per_labour_day, cost_per_unit
       from public.compute_labour_metrics($1::uuid)`, [PA]);
  const lf = lab.rows[0];
  ok(lab.rowCount === 1, `single labour row (got ${lab.rowCount})`);
  ok(lf.week_start === vWs, `week_start = prev ISO Monday ${vWs} (got ${lf.week_start})`);
  ok(Number(lf.attendance_rate) === 0.6, `attendance_rate 3/5 = 0.6 (got ${lf.attendance_rate})`);
  ok(Math.abs(Number(lf.overtime_ratio) - 0.2222) < 0.0001, `overtime_ratio 6/27 ≈ 0.2222 (got ${lf.overtime_ratio})`);
  ok(Number(lf.labour_hours) === 27, `labour_hours 27 (got ${lf.labour_hours})`);
  ok(Number(lf.labour_cost) === 1200, `labour_cost 500+400+300 = 1200 (got ${lf.labour_cost})`);
  ok(lf.output_units === null && lf.units_per_labour_day === null && lf.cost_per_unit === null,
    "output_units/units_per_labour_day/cost_per_unit stay NULL");
  ok(!Object.prototype.hasOwnProperty.call(lf, "computed_at"), "RPC returns 9 cols, no computed_at");
  const ltab = await c.query(`select count(*)::int as n from public.labour_metrics where project_id = $1`, [PA]);
  ok(ltab.rows[0].n === 1, `labour_metrics table: 1 row (got ${ltab.rows[0].n})`);

  // ── INT-003: material stockout ─────────────────────────────────────────────
  console.log("INT-003 material stockout math");
  const so = await c.query(`select * from public.compute_material_stockout($1::uuid)`, [PA]);
  const soMap = Object.fromEntries(so.rows.map(r => [r.material, r]));
  const cement = soMap.cement, paint = soMap.paint, nails = soMap.nails, sand = soMap.sand, steel = soMap.steel;
  ok(cement && Number(cement.current_stock) === 86 && Number(cement.monthly_consumption) === 30
    && Number(cement.lead_days) === 14 && Number(cement.days_remaining) === 86 && cement.stockout_critical === false,
    `cement 100-10-4=86 / 30.00 / lead 14 / 86d, not critical`);
  ok(cement?.unit === "bags", `cement unit coalesced to 'bags' (got ${cement?.unit})`);
  ok(paint && Number(paint.current_stock) === 1 && Number(paint.monthly_consumption) === 2.14
    && Number(paint.days_remaining) === 14 && paint.stockout_critical === true,
    `paint 2-1=1 / 2.14 / 14d <= 14 -> critical`);
  ok(nails && Number(nails.current_stock) === 10 && Number(nails.monthly_consumption) === 0
    && nails.days_remaining === null && nails.stockout_critical === false,
    "nails: outward 0 -> monthly 0, days null, not critical");
  ok(sand && Number(sand.current_stock) === 50 && Number(sand.monthly_consumption) === 21.43
    && Number(sand.days_remaining) === 70 && sand.stockout_critical === false,
    `sand 100-10-40=50 / 21.43 / 70d (wastage subtracted), not critical`);
  ok(steel && Number(steel.current_stock) === 20 && Number(steel.monthly_consumption) === 21.43
    && Number(steel.lead_days) === 30 && Number(steel.days_remaining) === 28 && steel.stockout_critical === true,
    `steel 30-10=20 / 21.43 / org-quote lead 30 / 28d <= 30 -> critical`);

  // ── INT-004a: positive control (no expenses) + superadmin idempotency ─────
  console.log("INT-004 gating + RLS");
  await asUser(U_S);
  const pb = await c.query(
    `select project_id, projected_spend, projected_overrun, confidence
       from public.compute_cost_forecast($1::uuid)`, [PB]);
  ok(pb.rows[0] && Number(pb.rows[0].projected_spend) === 0 && Number(pb.rows[0].projected_overrun) === 0
    && Number(pb.rows[0].confidence) === 0.2,
    `superadmin positive control: 0 expenses -> 0/0, confidence 0.2 (got ${pb.rows[0]?.confidence})`);
  await c.query(`select * from public.compute_cost_forecast($1::uuid)`, [PA]);
  const paAgain = await c.query(
    `select projected_spend, projected_overrun from public.compute_cost_forecast($1::uuid)`, [PA]);
  ok(Number(paAgain.rows[0].projected_spend) === 280 && Number(paAgain.rows[0].projected_overrun) === 30,
    `superadmin recompute of PA is idempotent (still 280/30, got ${paAgain.rows[0].projected_spend}/${paAgain.rows[0].projected_overrun})`);

  // ── INT-004b: member gates ─────────────────────────────────────────────────
  await asUser(U_M); // pm, org A
  const pmSo = await c.query(`select * from public.compute_material_stockout($1::uuid)`, [PA]);
  ok(pmSo.rowCount > 0, `pm member can run compute_material_stockout(PA) (${pmSo.rowCount} rows)`);
  await expectError("pm -> compute_cost_forecast(PA)", () => c.query(`select * from public.compute_cost_forecast($1::uuid)`, [PA]), "insufficient privileges");
  await expectError("pm -> compute_labour_metrics(PA)", () => c.query(`select * from public.compute_labour_metrics($1::uuid)`, [PA]), "insufficient privileges");
  await expectError("pm -> compute_org_material_stockout(ORG_A)", () => c.query(`select * from public.compute_org_material_stockout($1::uuid)`, [ORG_A]), "insufficient privileges");

  // ── INT-004c: cross-org + unknown-project denial ───────────────────────────
  await asUser(U_B); // orgadmin, ORG_B
  await expectError("cross-org -> compute_material_stockout(PA)", () => c.query(`select * from public.compute_material_stockout($1::uuid)`, [PA]), "insufficient privileges");
  await expectError("cross-org -> compute_org_material_stockout(ORG_A)", () => c.query(`select * from public.compute_org_material_stockout($1::uuid)`, [ORG_A]), "insufficient privileges");
  const unk = randomUUID();
  await expectError("unknown project -> compute_cost_forecast", () => c.query(`select * from public.compute_cost_forecast($1::uuid)`, [unk]), "project not found");
  await expectError("unknown project -> compute_labour_metrics", () => c.query(`select * from public.compute_labour_metrics($1::uuid)`, [unk]), "project not found");
  await expectError("unknown project -> compute_material_stockout", () => c.query(`select * from public.compute_material_stockout($1::uuid)`, [unk]), "insufficient privileges");

  // ── INT-004d: result-table RLS + INSERT denial ─────────────────────────────
  const visB = await c.query(`select count(*)::int as n from public.cost_forecast
    where project_id = any($1::uuid[])`, [[PA, PB]]);
  ok(visB.rows[0].n === 0, `foreign org sees 0 cost_forecast rows (got ${visB.rows[0].n})`);
  await asUser(U_A);
  const visA = await c.query(`select count(*)::int as n from public.cost_forecast
    where project_id = any($1::uuid[])`, [[PA, PB]]);
  ok(visA.rows[0].n === 2, `org A admin sees 2 cost_forecast rows (got ${visA.rows[0].n})`);
  await asUser(U_B);
  const lvisB = await c.query(`select count(*)::int as n from public.labour_metrics where project_id = $1`, [PA]);
  ok(lvisB.rows[0].n === 0, `foreign org sees 0 labour_metrics rows (got ${lvisB.rows[0].n})`);
  let insDenied = false;
  try {
    await c.query("savepoint ins_probe");
    await c.query(`insert into public.cost_forecast (project_id, forecast_month, projected_spend, projected_overrun, confidence)
      values ($1, date_trunc('month', now())::date, 1, 1, 0.5)`, [PA]);
    await c.query("release savepoint ins_probe");
  } catch { insDenied = true; await c.query("rollback to savepoint ins_probe"); }
  ok(insDenied, "authenticated INSERT into cost_forecast denied (no DML grants)");
  insDenied = false;
  try {
    await c.query("savepoint ins_probe2");
    await c.query(`insert into public.labour_metrics (project_id, week_start, attendance_rate)
      values ($1, current_date - 7, 0.5)`, [PA]);
    await c.query("release savepoint ins_probe2");
  } catch { insDenied = true; await c.query("rollback to savepoint ins_probe2"); }
  ok(insDenied, "authenticated INSERT into labour_metrics denied (no DML grants)");

  await c.query("rollback"); // net read-only

  // ── INT-005: pg_cron registration (checked after the tx, same client) ─────
  console.log("INT-005 cron registration");
  const jobs = await c.query(`select jobname, schedule, command from cron.job order by jobname`);
  const job = Object.fromEntries(jobs.rows.filter(r => r.jobname.includes("intelligence") || r.jobname.includes("cost-forecast") || r.jobname.includes("labour")).map(r => [r.jobname, r]));
  ok(job["compute-cost-forecast"]?.schedule === "30 2 1 * *", "pg_cron 'compute-cost-forecast' @ 30 2 1 * *");
  ok(String(job["compute-cost-forecast"]?.command || "").includes("compute_all_cost_forecasts"),
    "cost job calls compute_all_cost_forecasts()");
  ok(job["compute-labour-metrics"]?.schedule === "30 23 * * 0", "pg_cron 'compute-labour-metrics' @ 30 23 * * 0");
  ok(String(job["compute-labour-metrics"]?.command || "").includes("compute_all_labour_metrics"),
    "labour job calls compute_all_labour_metrics()");
  const stockJobs = jobs.rows.filter(r => (r.jobname || "").toLowerCase().includes("stockout"));
  ok(stockJobs.length === 0, `no stockout cron job registered (got ${stockJobs.length})`);

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
} catch (e) {
  console.error("Harness error:", e.message);
  await c.query("rollback").catch(() => {});
  process.exitCode = 1;
} finally {
  await c.end();
}