#!/usr/bin/env node
// SiteTrack Pro — verification for migration 225 (project risk signals).
//
// Proves, against the LIVE DB inside a rolled-back tx (net read-only):
//   RSK-001  schedule-slip scoring: ≥3d-late milestones → medium; max slip
//            ≥14d escalates the signal to high weight; delay_days = max slip.
//   RSK-002  budget-burn scoring: spend/budget ≥80% → +20 + accelerating flag;
//            ≥100% → +34, no accelerating flag.
//   RSK-003  high-severity open issues: >0 → +20, ≥3 → +34; resolved ignored.
//   RSK-004  fold + bands: combined signals cap at 100/critical; probability
//            caps at 0.9; clean project scores 0/low.
//   RSK-005  non-active projects (completed) are NOT scored.
//   RSK-006  idempotent re-run overwrites (no duplicate rows, same values).
//   RSK-007  RLS: org members read their org's rows; other-org rows invisible;
//            superadmin sees all.
//   RSK-008  cron-only writes: authenticated INSERT is denied (no grant).
//   RSK-009  pg_cron job 'compute-risk-signals' registered at 02:05 UTC.
//
// Usage: npm run test:rls:risk

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
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping risk-signal tests.");
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

// Pre-clean leftovers from a prior aborted run (committed, outside the tx).
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };
await clean(`delete from public.projects where org_id in ($1,$2)`, [ORG_A, ORG_B]);
await clean(`delete from public.org_members where org_id in ($1,$2) or profile_id in ($3,$4,$5)`, [ORG_A, ORG_B, U_A, U_B, U_S]);
await clean(`delete from public.organizations where id in ($1,$2)`, [ORG_A, ORG_B]);
await clean(`delete from public.profiles where id in ($1,$2,$3,$4)`, [U_A, U_M, U_B, U_S]);
await clean(`delete from auth.users where id in ($1,$2,$3,$4)`, [U_A, U_M, U_B, U_S]);

try {
  await c.query("begin");
  await c.query("set local session_replication_role = 'replica'");

  // ── Fixtures: users / profiles / orgs / memberships ────────────────────────
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rsk-admin@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rsk-member@sitetrack.test', now(), now()),
           ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rsk-other@sitetrack.test', now(), now()),
           ($4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rsk-super@sitetrack.test', now(), now())`,
    [U_A, U_M, U_B, U_S]);
  await c.query(`insert into public.profiles (id, name, role, is_staff) values
    ($1,'Risk Admin','orgadmin', false),
    ($2,'Risk Member','pm', false),
    ($3,'Risk OtherOrg','orgadmin', false),
    ($4,'Risk Super','superadmin', true)`, [U_A, U_M, U_B, U_S]);
  await c.query(`insert into public.organizations (id, slug, name, plan) values
    ($1,'risk-org-a','Risk Org A','pro'),
    ($2,'risk-org-b','Risk Org B','pro')`, [ORG_A, ORG_B]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$3,'admin','active'),
    ($1,$4,'pm','active'),
    ($2,$5,'admin','active')`, [ORG_A, ORG_B, U_A, U_M, U_B]);

  // ── Fixture projects (org A ×4 + org B ×1 + completed control) ────────────
  const P = {};
  for (const [key, status] of [["slip", "active"], ["burn", "active"], ["red", "active"], ["clean", "active"], ["done", "completed"]]) {
    P[key] = randomUUID();
    await c.query(`insert into public.projects (id, org_id, name, status, budget)
      values ($1,$2,$3,$4, case when $5 = 'done' then 0 else 100000 end)`,
      [P[key], ORG_A, `RSK ${key}`, status, key === "done" ? "done" : "x"]);
    // budget override per scenario below
  }
  const P_FOREIGN = randomUUID();
  await c.query(`insert into public.projects (id, org_id, name, status, budget)
    values ($1,$2,'RSK foreign active','active',100000)`, [P_FOREIGN, ORG_B]);

  // Budget overrides (bigint ₹)
  await c.query(`update public.projects set budget = 100000 where id = any($1)`, [[P.slip, P.red, P.clean]]);
  await c.query(`update public.projects set budget = 1000    where id = $1`, [P.burn]);

  // ── Scenario data ──────────────────────────────────────────────────────────
  // RSK-001 slip: 5d-late + 20d-late pending milestones (max_late 20 ≥ 14 → high weight)
  await c.query(`insert into public.milestones (project_id, title, status, due_date) values
    ($1,'M early','pending', current_date + 30),
    ($1,'M 5d late','in_progress', current_date - 5),
    ($1,'M 20d late','pending', current_date - 20)`, [P.slip]);

  // RSK-002 burn: 90% burn + 1 open high issue (+20) → 40 medium, accelerating
  await c.query(`insert into public.expenses (project_id, category, description, amount)
    values ($1,'material','burn probe',900)`, [P.burn]);
  await c.query(`insert into public.issues (project_id, title, severity, status)
    values ($1,'high issue','high','open')`, [P.burn]);

  // RSK-003: a RESOLVED high issue must be ignored — plant one on the clean
  // project and assert it stays 0/low below.
  await c.query(`insert into public.issues (project_id, title, severity, status)
    values ($1,'resolved high ignored','high','resolved')`, [P.clean]);

  // RSK-004 red: 15d-late milestone (+34) + 150% burn (+34) + 3 open highs (+34) → 102→100 critical
  await c.query(`insert into public.milestones (project_id, title, status, due_date)
    values ($1,'M 15d late','pending', current_date - 15)`, [P.red]);
  await c.query(`insert into public.expenses (project_id, category, description, amount)
    values ($1,'material','overrun probe',150000)`, [P.red]);
  await c.query(`insert into public.issues (project_id, title, severity, status)
    values ($1,'h1','high','open'),($1,'h2','high','open'),($1,'h4','high','open'),
           ($1,'h3-resolved ignored','high','resolved')`, [P.red]);

  // Foreign org project gets red-level data too (RLS invisibility probe):
  // single 30d-late milestone → HIGH-weighted slip signal → score 34.
  await c.query(`insert into public.milestones (project_id, title, status, due_date)
    values ($1,'M 30d late','pending', current_date - 30)`, [P_FOREIGN]);

  await c.query("set local session_replication_role = 'origin'");

  // ── Run the scorer (twice — proves idempotent overwrite) ──────────────────
  await c.query("savepoint before_run1");
  await c.query("select * from public.compute_project_risk_signals()");
  const rows1 = await c.query(
    `select * from public.project_risk_signals where project_id = any($1) order by project_id`,
    [[P.slip, P.burn, P.red, P.clean, P.done, P_FOREIGN]]);
  await c.query("select * from public.compute_project_risk_signals()");
  const rows2 = await c.query(
    `select * from public.project_risk_signals where project_id = any($1)`,
    [[P.slip, P.burn, P.red, P.clean, P.done, P_FOREIGN]]);
  const byId = Object.fromEntries(rows1.rows.map(r => [r.project_id, r]));

  console.log("\nRSK-001 schedule slip");
  const s = byId[P.slip];
  ok(s && s.risk_score === 34, `slip: single HIGH-weighted signal (max_late 20 ≥ 14) → score 34 (got ${s?.risk_score})`);
  ok(s?.risk_level === "medium", "slip: 34 falls in medium band");
  ok(s?.delay_days === 20, "slip: delay_days = max slip 20");

  console.log("RSK-002 budget burn");
  const b = byId[P.burn];
  ok(b?.risk_score === 40, `burn 90% (+20) + 1 high issue (+20) → 40 (got ${b?.risk_score})`);
  ok(b?.burn_accelerating === true, "burn: accelerating flag set (0.8 ≤ burn < 1.0)");

  console.log("RSK-003 high-severity issues");
  const cl = byId[P.clean];
  ok(cl?.risk_score === 0, `clean project: resolved high issue ignored → still 0 (got ${cl?.risk_score})`);

  console.log("RSK-004 fold + bands");
  const r = byId[P.red];
  ok(r?.risk_score === 100, `red: 34+34+34 = 102 capped at 100 (got ${r?.risk_score})`);
  ok(r?.risk_level === "critical", "red: level critical");
  ok(Number(r?.delay_probability) === 0.9, `red: probability capped at 0.9 (got ${r?.delay_probability})`);
  ok(r?.burn_accelerating === false, "red: burn ≥100% → NOT flagged accelerating");
  ok(cl?.risk_level === "low" && Number(cl?.delay_probability) === 0,
    "clean: low / 0.0");

  console.log("RSK-005 non-active projects skipped + active scored");
  ok(!byId[P.done], "completed project not scored");
  ok(byId[P_FOREIGN]?.risk_score === 34,
    `foreign active project scored: 30d-late milestone ≥14d → high weight 34 (got ${byId[P_FOREIGN]?.risk_score})`);

  console.log("RSK-006 idempotent re-run");
  ok(rows2.rowCount === rows1.rowCount,
    `re-run overwrites without duplicating (${rows2.rowCount} rows after 2nd run)`);

  console.log("RSK-007 RLS scoping");
  await asUser(U_M);
  const seenMember = await c.query(
    `select project_id from public.project_risk_signals where project_id = any($1)`,
    [[P.slip, P.red, P_FOREIGN]]);
  ok(seenMember.rows.some(x => x.project_id === P.slip) && seenMember.rows.some(x => x.project_id === P.red),
    "org A member sees own org rows");
  ok(!seenMember.rows.some(x => x.project_id === P_FOREIGN),
    "org A member cannot see org B rows");
  await asUser(U_S);
  const seenSuper = await c.query(
    `select project_id from public.project_risk_signals where project_id = any($1)`,
    [[P.slip, P_FOREIGN]]);
  ok(seenSuper.rows.length === 2, "superadmin sees across orgs");

  console.log("RSK-008 cron-only writes");
  await asUser(U_M);
  let denied = false;
  try {
    await c.query("savepoint ins_probe");
    await c.query(`insert into public.project_risk_signals (project_id) values ($1)`, [P.red]);
    await c.query("release savepoint ins_probe");
  } catch { denied = true; await c.query("rollback to savepoint ins_probe"); }
  ok(denied, "authenticated INSERT denied (no DML grants)");

  await c.query("rollback"); // net read-only

  console.log("RSK-009 cron registration");
  const job = await c.query(`select schedule, command from cron.job where jobname = 'compute-risk-signals'`);
  ok(job.rowCount === 1, "pg_cron job 'compute-risk-signals' registered");
  ok(job.rows[0]?.schedule === "5 2 * * *", "schedule = 02:05 UTC daily");
  ok(String(job.rows[0]?.command).includes("compute_project_risk_signals"), "command targets the scorer");

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
} catch (e) {
  console.error("Harness error:", e.message);
  await c.query("rollback").catch(() => {});
  process.exitCode = 1;
} finally {
  await c.end();
}
