#!/usr/bin/env node
// SiteTrack Pro — RLS/behavior proof for transaction-safe quota enforcement
// (migration 224, DB-001).
//
// Migrations 35/97 enforced plan caps with a check-then-act trigger:
//   select count(*) ... then compare against cap
// Two concurrent inserts for the SAME org both read the same pre-insert count
// and both pass → org exceeds its cap (TOCTOU race). Migration 224 serializes
// per-org via pg_advisory_xact_lock(quota_lock_key(org, resource)) acquired
// BEFORE the count.
//
// This matrix proves against the LIVE DB:
//   QT-001  single-threaded cap still enforced (no over-block regression).
//   QT-002  concurrent project inserts can never exceed the cap (race closed).
//   QT-003  concurrent member inserts can never exceed the cap (race closed).
//   QT-004  the trigger blocks on the SAME advisory lock the test holds
//           (deterministic proof that serialization uses quota_lock_key).
//   QT-005  unlimited plans (null cap) are not locked / not blocked.
//   QT-006  migration 224 structures are live (function + triggers).
//
// Strategy: seed a fixture org with a small cap, then hammer concurrent
// inserts from a small pg.Pool and assert the final count NEVER exceeds cap.
// For the deterministic lock proof, hold the advisory lock in one client while
// a second client tries to insert — it must BLOCK until the lock releases.
//
// Uses only committed fixtures (concurrency can't run in a rolled-back tx) and
// cleans them up afterwards. Net effect on live data: transient fixture rows
// only.
//
// Usage: node scripts/test-quota-toctou.mjs

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
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping quota tests.");
  process.exit(0);
}

const ORG = randomUUID();
const SLUG = `qt-fixture-${randomUUID().slice(0, 8)}`;
const ADMIN = randomUUID();
const MEMBER1 = randomUUID();
const MEMBER2 = randomUUID();
const RACERS = Array.from({ length: 6 }, () => randomUUID());
const PROJECT_CAP = 5; // basic plan projects_max = 5
const MEMBER_SLOTS = 5; // basic plan users_max = 5 (3 fixture members → 2 free)
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  🟢 ${label}`); } else { fail++; console.log(`  🔴 ${label}`); } };

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const clean = async (sql, params) => { try { await c.query(sql, params); } catch (e) { console.error(`   [clean] ${sql.slice(0, 70)}… ERR: ${e.message}`); } };
const cleanOrg = async () => {
  await clean(`delete from public.projects where org_id = $1`, [ORG]);
  await clean(`delete from public.project_members where project_id in (select id from public.projects where org_id = $1) or profile_id = $1`, [ORG]);
  await clean(`delete from public.org_members where org_id = $1 or profile_id = any($2) or profile_id in ($3,$4,$5)`, [ORG, RACERS, ADMIN, MEMBER1, MEMBER2]);
  await clean(`delete from public.organizations where id = $1 or slug like 'qt-fixture-%'`, [ORG]);
  await clean(`delete from public.profiles where id = any($1) or id in ($2,$3,$4) or name in ('Quota Admin','Quota M1','Quota M2') or name like 'Quota R%'`, [RACERS, ADMIN, MEMBER1, MEMBER2]);
  const em = [...RACERS.map((_, i) => `qt-race-${i}@sitetrack.test`), 'qt-admin@sitetrack.test', 'qt-m1@sitetrack.test', 'qt-m2@sitetrack.test'];
  await clean(`delete from auth.identities where user_id = any($1) or user_id in (select id from auth.users where email = any($2))`, [RACERS, em]);
  await clean(`delete from auth.users where id = any($1) or email = any($2)`, [RACERS, em]);
};

try {
  await cleanOrg();

  // ── Seed the fixture org with a TINY cap (basic: projects_max=5) ────────
await c.query("set session_replication_role = 'replica'"); // bypass triggers (session-level: autocommit here)
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qt-admin@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qt-m1@sitetrack.test', now(), now()),
           ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qt-m2@sitetrack.test', now(), now())`,
    [ADMIN, MEMBER1, MEMBER2]);
  await c.query(`insert into public.profiles (id, name, role, is_staff) values
    ($1,'Quota Admin','orgadmin', false),
    ($2,'Quota M1','pm', false),
    ($3,'Quota M2','architect', false)`, [ADMIN, MEMBER1, MEMBER2]);
  for (let i = 0; i < RACERS.length; i++) {
    await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2, now(), now())`, [RACERS[i], `qt-race-${i}@sitetrack.test`]);
    await c.query(`insert into public.profiles (id, name, role, is_staff) values ($1,$2,'pm', false)`, [RACERS[i], `Quota R${i}`]);
  }
  await c.query(`insert into public.organizations (id, slug, name, plan) values
    ($1,$2,$3,'basic')`, [ORG, SLUG, 'QT Fixture Org']); // basic = projects_max 5, users_max 5
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$2,'admin','active'),
    ($1,$3,'pm','active'),
    ($1,$4,'architect','active')`, [ORG, ADMIN, MEMBER1, MEMBER2]);
  await c.query("set session_replication_role = 'origin'");

  // ── QT-006: structures live ──────────────────────────────────────────────
  const projFn = (await c.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='check_project_limit'`)).rows[0];
  const userFn = (await c.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='check_user_limit'`)).rows[0];
  const keyFn = (await c.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='quota_lock_key'`)).rows[0];
  const trgProj = (await c.query(`select 1 from pg_trigger where tgrelid='public.projects'::regclass and tgname='trg_check_project_limit'`)).rows.length;
  const trgUser = (await c.query(`select 1 from pg_trigger where tgrelid='public.org_members'::regclass and tgname='trg_check_user_limit'`)).rows.length;
  ok(!!projFn && projFn.d.includes("pg_advisory_xact_lock") && projFn.d.includes("quota_lock_key"),
     "QT-006 check_project_limit serialized via quota_lock_key");
  ok(!!userFn && userFn.d.includes("pg_advisory_xact_lock") && userFn.d.includes("quota_lock_key"),
     "QT-006 check_user_limit serialized via quota_lock_key");
  ok(!!keyFn && keyFn.d.includes("hashtextextended"), "QT-006 quota_lock_key helper live");
  ok(trgProj === 1 && trgUser === 1, "QT-006 trg_check_project_limit + trg_check_user_limit attached");

  // ── QT-004: deterministic lock proof — trigger blocks on quota_lock_key ──
  // Runs on the EMPTY org: a free slot exists, so a concurrent insert can only
  // be stalled by the advisory lock itself, never by the quota check.
  const blocker = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  const probe = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await blocker.connect();
  await probe.connect();
  try {
    // Hold the exact quota_lock_key advisory lock in a transaction.
    await blocker.query("begin");
    await blocker.query(`select pg_advisory_xact_lock(public.quota_lock_key($1,'projects'))`, [ORG]);
    // A concurrent insert for the SAME org must BLOCK on that lock. Prove it by
    // giving the probe a short statement_timeout: it can neither pass (it must
    // serialize) nor fail on quota (a free slot exists) — only a lock wait can
    // trip the timeout.
    let timedOut = false;
    await probe.query(`set statement_timeout = '600ms'`);
    try {
      await probe.query(`insert into public.projects (id, org_id, name, status) values ($1,$2,$3,'active')`, [randomUUID(), ORG, "qt-block-probe"]);
    } catch (e) {
      timedOut = /canceling statement due to statement timeout/.test(String(e.message));
    }
    ok(timedOut, "QT-004 insert BLOCKS while quota_lock_key held (statement_timeout fired)");
    // Release the lock: the same insert now succeeds (the probe did not consume
    // the quota slot — it was aborted by the timeout).
    await blocker.query("rollback");
    await probe.query(`set statement_timeout = 0`);
    const retryOk = await probe.query(`insert into public.projects (id, org_id, name, status) values ($1,$2,$3,'active')`, [randomUUID(), ORG, "qt-block-probe"])
      .then(() => true).catch(() => false);
    ok(retryOk, "QT-004 same insert succeeds after lock release (serialized, not over-blocked)");
  } finally {
    await blocker.query("rollback").catch(() => {});
    await blocker.end();
    await probe.end();
  }
  await clean(`delete from public.projects where org_id=$1 and name='qt-block-probe'`, [ORG]);

  // ── QT-001: single-threaded cap still enforced (no over-block) ───────────
  const singleInsert = async (i) => {
    try {
      await c.query(`insert into public.projects (id, org_id, name, status) values ($1,$2,$3,'active')`, [randomUUID(), ORG, `qt-proj-${i}`]);
      return true;
    } catch { return false; }
  };
  let inserted = 0;
  for (let i = 0; i < PROJECT_CAP; i++) if (await singleInsert(i)) inserted++;
  ok(inserted === PROJECT_CAP, `QT-001 ${PROJECT_CAP} sequential inserts fit exactly (cap=${PROJECT_CAP})`);
  ok(!(await singleInsert(PROJECT_CAP + 1)), "QT-001 cap+1 sequential insert rejected (plan-limit-exceeded)");

  // ── QT-002: concurrent project inserts never exceed the cap ──────────────
  // Basic cap = 5, currently full. Free one slot (remove qt-proj-0) → 4 present,
  // exactly 1 slot left. Fire 6 concurrent inserts — exactly 1 may win; the
  // final count must be EXACTLY 5 (never over cap, never under-filled from a
  // lost race).
  await clean(`delete from public.projects where org_id=$1 and name='qt-proj-0'`, [ORG]);
  const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 6 });
  const tryInsert = (name) => pool.query(`insert into public.projects (id, org_id, name, status) values ($1,$2,$3,'active')`, [randomUUID(), ORG, name])
    .then(() => true).catch(() => false);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => tryInsert(`qt-race-${i}`)));
  const okCount = results.filter(Boolean).length;
  const countAfter = Number((await c.query(`select count(*) n from public.projects where org_id=$1 and archived_at is null`, [ORG])).rows[0].n);
  ok(countAfter === 5, `QT-002 ${6} concurrent inserts → final count ${countAfter} === cap 5 (never over)`);
  ok(okCount === 1, `QT-002 exactly 1 of 6 concurrent inserts won (${okCount} won) — serialized`);

  // ── QT-003: concurrent member inserts never exceed the cap ───────────────
  // org_members holds 3 fixture members; basic users_max = 5 → exactly 2 free
  // slots. 6 concurrent member inserts (one per real racer profile) → exactly
  // 2 win; final = 5.
  const memberRaces = await Promise.all(RACERS.map((rid) =>
    pool.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'architect','active')`, [ORG, rid])
      .then(() => true).catch(() => false)));
  const membersNow = Number((await c.query(`select count(*) n from public.org_members where org_id=$1`, [ORG])).rows[0].n);
  const memberWins = memberRaces.filter(Boolean).length;
  ok(membersNow === 5, `QT-003 6 concurrent member inserts → final count ${membersNow} === users cap 5 (never over)`);
  ok(memberWins === 2, `QT-003 exactly 2 of 6 concurrent member inserts won (${memberWins} won) — serialized`);

  // ── QT-005: unlimited plans are not locked/blocked ───────────────────────
  await c.query(`update public.organizations set plan='enterprise' where id=$1`, [ORG]);
  const freeInsert = await pool.query(`insert into public.projects (id, org_id, name, status) values ($1,$2,$3,'active')`, [randomUUID(), ORG, "qt-unlimited"])
    .then(() => true).catch(() => false);
  ok(freeInsert, "QT-005 unlimited plan (enterprise) insert succeeds — no lock/block");

  await pool.end();
  console.log(`\nQuota TOCTOU matrix: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error("Quota matrix failed:", e.message);
  process.exit(1);
} finally {
  await cleanOrg();
  await c.end();
}
