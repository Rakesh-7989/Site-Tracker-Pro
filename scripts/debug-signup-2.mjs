#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

async function q(label, sql, params = []) {
  console.log(`\n── ${label} ──`);
  try {
    const r = await client.query(sql, params);
    for (const row of r.rows) console.log("  ", row);
    if (r.rowCount === 0) console.log("  (0 rows)");
  } catch (e) { console.log(`❌ ${e.message}`); }
}

try {
  // Profiles schema — confirm the org_id absence
  await q(
    "profiles columns",
    `select column_name, data_type from information_schema.columns
     where table_name = 'profiles' and table_schema = 'public'
     order by ordinal_position`,
  );

  // RLS policies on plans — see what anon can do
  await q(
    "plans RLS policies",
    `select polname, polcmd, polpermissive, polroles::regrole[], pg_get_expr(polqual, polrelid) as using_clause
     from pg_policy
     where polrelid = 'public.plans'::regclass`,
  );

  // Is RLS enabled on plans?
  await q(
    "plans RLS enabled?",
    `select relname, relrowsecurity from pg_class where relname = 'plans'`,
  );

  // The trigger function body — show first 500 chars
  await q(
    "handle_new_signup body (first 1000 chars)",
    `select substr(prosrc, 1, 1000) as body from pg_proc where proname = 'handle_new_signup'`,
  );

  // org_members schema — likely the org_id linkage lives there
  await q(
    "org_members columns",
    `select column_name, data_type from information_schema.columns
     where table_name = 'org_members' and table_schema = 'public'
     order by ordinal_position`,
  );

  // Check signed-up users — auth.users with metadata
  await q(
    "auth.users recent 5 (any test signups)",
    `select email, email_confirmed_at, created_at, raw_user_meta_data
     from auth.users
     order by created_at desc
     limit 5`,
  );

} finally {
  await client.end();
}
