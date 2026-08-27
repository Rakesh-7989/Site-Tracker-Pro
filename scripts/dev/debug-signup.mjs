#!/usr/bin/env node
// One-shot diagnostic for the "Database error saving new user" signup failure
// the user hit on 2026-06-02 (garchitects99@gmail.com).
//
// Checks:
//   1. plans table contents — what does fetchPublicPlans actually see?
//   2. Does the auth.users row already exist?
//   3. Does the trigger function trg_handle_signup exist?
//   4. Recent Postgres errors that the trigger may have produced.
//   5. organizations / profiles / org_members for any partial signup state.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) { console.error("❌ .env.local missing"); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);
const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl) { console.error("❌ SUPABASE_DB_URL missing"); process.exit(1); }

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const TEST_EMAIL = "garchitects99@gmail.com";

async function q(label, sql, params = []) {
  console.log(`\n── ${label} ──`);
  try {
    const r = await client.query(sql, params);
    console.log(`rows: ${r.rowCount}`);
    for (const row of r.rows) console.log("  ", row);
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }
}

try {
  // 1. plans table — what fetchPublicPlans sees
  await q(
    "1. plans table (filter: status='active' AND requires_superadmin=false)",
    `select id, name, tagline, monthly_inr, status, requires_superadmin, display_order
     from plans
     where status = 'active' and requires_superadmin = false
     order by display_order asc nulls last, id asc`,
  );

  // 2. ALL plans rows — see what's really there
  await q(
    "2. ALL plans rows (no filter)",
    `select id, name, tagline, monthly_inr, status, requires_superadmin, display_order
     from plans
     order by id`,
  );

  // 3. Does the auth user exist?
  await q(
    "3. auth.users for test email",
    `select id, email, email_confirmed_at, created_at, raw_user_meta_data
     from auth.users
     where lower(email) = lower($1)`,
    [TEST_EMAIL],
  );

  // 4. Does the trigger function exist?
  await q(
    "4. trigger function trg_handle_signup",
    `select proname, prosrc is not null as has_src, length(prosrc) as src_len
     from pg_proc
     where proname like '%signup%' or proname like 'handle_new_user'`,
  );

  // 5. Is the trigger attached?
  await q(
    "5. trigger attached to auth.users?",
    `select tgname, tgrelid::regclass as on_table, tgenabled
     from pg_trigger
     where tgrelid in ('auth.users'::regclass)
       and tgname not like 'RI_%'`,
  );

  // 6. organizations — any orphan from a partial signup?
  await q(
    "6. organizations (latest 5)",
    `select id, slug, name, plan, created_at
     from organizations
     order by created_at desc
     limit 5`,
  );

  // 7. profiles — any orphan?
  await q(
    "7. profiles for test email",
    `select id, role, name, org_id
     from profiles
     where id in (select id from auth.users where lower(email) = lower($1))`,
    [TEST_EMAIL],
  );

  // 8. Look at the recent migration history to understand which version
  //    of the signup trigger is in place.
  await q(
    "8. plan id list expected by signup trigger (from 36_custom_plan_lock)",
    `select column_name, data_type
     from information_schema.columns
     where table_name = 'plans' and table_schema = 'public'
     order by ordinal_position`,
  );

} finally {
  await client.end();
}
