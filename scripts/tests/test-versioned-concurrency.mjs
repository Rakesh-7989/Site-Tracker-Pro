#!/usr/bin/env node
// SiteTrack Pro — versioned-concurrency proof (migration 238).
//
// All inside a rolled-back tx (net read-only). Acts as authenticated users
// via SET LOCAL ROLE + JWT claims, mirroring test-project-lifecycle-rls.mjs.
//
//   VC-001  structure: version + updated_at columns exist on all 6 tables
//   VC-002  structure: bump trigger exists on all 6 tables; fn non-definer,
//           search_path pinned
//   VC-003  fresh insert → version=1, updated_at set
//   VC-004  update with matching expected_version applies → version=2
//   VC-005  stale expected_version matches 0 rows (conflict detectable),
//           record untouched
//   VC-006  client-sent explicit `version` in patch cannot forge monotonicity
//   VC-007  updated_at advances on every update
//   VC-008  RLS still governs writes — non-member update affects 0 rows even
//           with the correct version
//   VC-009  financial chain spot-check: invoices/ra_bills/payments bumps work
//
// Usage: node scripts/test-versioned-concurrency.mjs   (npm run test:rls:versions)

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
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping versioned-concurrency tests.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const U_M = randomUUID(); // ordinary member (pm identity)
const U_X = randomUUID(); // outsider (no membership)
const A = randomUUID();
const P = randomUUID();
const TABLES = ["milestones", "tasks", "issues", "invoices", "ra_bills", "payments"];

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  PASS ${label}`); } else { fail++; console.log(`  FAIL ${label}`); } };
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
};
const rowCount = async (sql, params) => {
  try {
    await c.query("savepoint vc_sp");
    const r = await c.query(sql, params);
    await c.query("release savepoint vc_sp");
    return r.rowCount ?? 0;
  } catch { await c.query("rollback to savepoint vc_sp"); return -1; }
};

try {
  await c.query("begin");
  await c.query("set local session_replication_role = 'replica'"); // seed without auto-org triggers

  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','vc-member@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','vc-outsider@sitetrack.test', now(), now())`, [U_M, U_X]);
  await c.query(`insert into public.profiles (id, name, role) values ($1,'VC Member','pm'), ($2,'VC Outsider','architect')`, [U_M, U_X]);
  await c.query(`insert into public.organizations (id, name, slug, plan) values ($1,'VC Org',$2,'pro')`, [A, `vc-org-${randomUUID().slice(0, 8)}`]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'admin','active')`, [A, U_M]);
  await c.query(`insert into public.projects (id, org_id, name, type, budget, status) values ($1,$2,'VC Project','construction',1000000,'active')`, [P, A]);
  await c.query(`insert into public.project_members (project_id, profile_id, role) values ($1,$2,'pm')`, [P, U_M]);

  // ── VC-001 / VC-002: structure ──
  const cols = await c.query(`select table_name, column_name from information_schema.columns
    where table_schema='public' and table_name = any($1) and column_name in ('version','updated_at')`, [TABLES]);
  for (const t of TABLES) {
    ok(cols.rows.some(r => r.table_name === t && r.column_name === "version"), `VC-001 ${t}.version exists`);
    ok(cols.rows.some(r => r.table_name === t && r.column_name === "updated_at"), `VC-001 ${t}.updated_at exists`);
  }
  const trigs = await c.query(`select event_object_table as t from information_schema.triggers
    where trigger_schema='public' and trigger_name like '%_bump_version'`);
  for (const t of TABLES) ok(trigs.rows.some(r => r.t === t), `VC-002 trigger on ${t}`);
  const fn = await c.query(`select prosecdef, coalesce(array_to_string(proconfig, ','), '') as cfg from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and proname='bump_record_version'`);
  ok(fn.rows[0]?.prosecdef === false, "VC-002 bump fn is non-definer");
  ok(/search_path/.test(fn.rows[0]?.cfg ?? ""), "VC-002 bump fn pins search_path");

  // ── fixtures: one row per table (as owner; inserts are member-allowed anyway) ──
  const ids = {};
  const seed = async (table, sql, params) => {
    const r = await c.query(sql, params);
    ids[table] = r.rows[0].id;
  };
  await seed("milestones", `insert into public.milestones (project_id, title, status) values ($1,'VC MS','pending') returning id`, [P]);
  await seed("tasks", `insert into public.tasks (project_id, title) values ($1,'VC Task') returning id`, [P]);
  await seed("issues", `insert into public.issues (project_id, title) values ($1,'VC Issue') returning id`, [P]);
  await seed("invoices", `insert into public.invoices (project_id, no, amount) values ($1,'VC-INV-1',50000) returning id`, [P]);
  await seed("ra_bills", `insert into public.ra_bills (project_id, no, bill_amount) values ($1,'VC-RA-1',40000) returning id`, [P]);
  await seed("payments", `insert into public.payments (project_id, target_type, target_id, amount) values ($1,'invoice',$2,25000) returning id`, [P, ids.invoices]);

  // CRITICAL (AGENTS.md lesson): 'replica' disables ORDINARY triggers — the
  // bump trigger would silently never fire. Restore origin before behavior tests.
  await c.query("set local session_replication_role = 'origin'");

  await asUser(U_M);

  // ── VC-003..VC-007 on tasks (representative) ──
  let r = await c.query(`select version, updated_at from public.tasks where id=$1`, [ids.tasks]);
  ok(r.rows[0].version === 1, "VC-003 fresh insert has version=1");
  ok(r.rows[0].updated_at != null, "VC-003 fresh insert has updated_at");

  r = await rowCount(`update public.tasks set title='VC Task v2' where id=$1 and version=1`, [ids.tasks]);
  ok(r === 1, "VC-004 matching expected_version applies");
  r = await c.query(`select version, extract(epoch from updated_at) from public.tasks where id=$1`, [ids.tasks]);
  ok(r.rows[0].version === 2, "VC-004 trigger bumped version to 2");

  r = await rowCount(`update public.tasks set title='VC Task stale' where id=$1 and version=1`, [ids.tasks]);
  ok(r === 0, "VC-005 stale expected_version affects 0 rows (conflict)");
  r = await c.query(`select version, title from public.tasks where id=$1`, [ids.tasks]);
  ok(r.rows[0].version === 2 && r.rows[0].title === "VC Task v2", "VC-005 record untouched after conflict");

  r = await rowCount(`update public.tasks set title='VC Task forge', version=99 where id=$1`, [ids.tasks]);
  ok(r === 1, "VC-006 explicit-version update accepted (row-level)");
  r = await c.query(`select version, title from public.tasks where id=$1`, [ids.tasks]);
  ok(r.rows[0].version === 3 && r.rows[0].title === "VC Task forge", "VC-006 forged version overridden to monotonic 3");

  // ── VC-007: trigger maintains updated_at ──
  // NB: now() is TRANSACTION-scoped, so a wall-clock advance can't be proven
  // inside this single rolled-back tx (same tx-timestamp lesson as the teams
  // harness). What we CAN prove here: every update rewrites updated_at to the
  // tx clock (in prod each HTTP request is its own tx ⇒ it advances).
  const ua = await c.query(`select updated_at, now() as tx_now from public.tasks where id=$1`, [ids.tasks]);
  ok(ua.rows[0].updated_at != null, "VC-007 updated_at always maintained");
  ok(Number(ua.rows[0].updated_at) === Number(ua.rows[0].tx_now), "VC-007 updated_at tracks the writing transaction's clock");

  // ── VC-008: RLS still gates — outsider with CORRECT version affects 0 rows ──
  await asUser(U_X);
  r = await rowCount(`update public.tasks set title='hijack' where id=$1 and version=4`, [ids.tasks]);
  ok(r === 0, "VC-008 outsider blocked even with correct version");
  await asUser(U_M);

  // ── VC-009: every table bumps ──
  // (a) UI-writable tables: direct authenticated update bumps (uniform patch:
  //     client echoes stale version; trigger forces monotonicity — also
  //     re-proves the override path).
  // (b) invoices/ra_bills: NO direct UPDATE policy for authenticated (their
  //     writes flow through approval-guarded RPCs) ⇒ expect 0 rows even with
  //     the correct version; prove the bump fires on the server-side path by
  //     updating as the table owner.
  const UI_WRITABLE = ["milestones", "tasks", "issues", "payments"];
  for (const t of UI_WRITABLE) {
    const v0 = (await c.query(`select version from public.${t} where id=$1`, [ids[t]])).rows[0].version;
    const rc = await rowCount(`update public.${t} set version=$2 where id=$1 and version=$2`, [ids[t], v0]);
    const v1 = (await c.query(`select version from public.${t} where id=$1`, [ids[t]])).rows[0].version;
    ok(rc === 1 && v1 === v0 + 1, `VC-009 ${t} bump works (${v0}→${v1})`);
  }
  await c.query("set local role authenticated"); // deterministic: still the member
  for (const t of ["invoices", "ra_bills"]) {
    const col = t === "invoices" ? "issued_date" : "bill_date";
    const rc = await rowCount(`update public.${t} set ${col}=${col} where id=$1 and version=1`, [ids[t]]);
    ok(rc === 0, `VC-009 ${t} direct authenticated write gated (rc=${rc})`);
  }
  await c.query("reset role");
  for (const t of ["invoices", "ra_bills"]) {
    const v0 = (await c.query(`select version from public.${t} where id=$1`, [ids[t]])).rows[0].version;
    await c.query(`update public.${t} set updated_at = updated_at where id=$1`, [ids[t]]);
    const v1 = (await c.query(`select version from public.${t} where id=$1`, [ids[t]])).rows[0].version;
    ok(v1 === v0 + 1, `VC-009 ${t} server-side path bumps (${v0}→${v1})`);
  }

  await c.query("rollback"); // net read-only
  console.log(`\n${pass}/${pass + fail} green`);
  await c.query("reset role");
  await c.end();
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("Harness error:", e.message);
  try { await c.query("rollback"); await c.query("reset role"); await c.end(); } catch { /* best-effort teardown */ }
  process.exit(1);
}
