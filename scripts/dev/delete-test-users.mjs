#!/usr/bin/env node
// SiteTrack Pro — wipe all test users created by create-test-users.mjs.
//
// Matches any auth.users row with email ending in @sitetrack.test (an
// RFC 2606 reserved TLD we use for test accounts only). Cascades to:
//   - public.profiles (FK to auth.users.id)
//   - public.org_members (FK to profiles.id)
//   - auth.identities (FK to auth.users.id)
//
// Also deletes the TEST_USERS_CREDENTIALS.md file.
//
// Usage:
//   node scripts/delete-test-users.mjs           # confirms count + deletes
//   node scripts/delete-test-users.mjs --dry-run # just lists who would be deleted

import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
);

const dryRun = process.argv.includes("--dry-run");

const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const list = await c.query(
  `select id, email from auth.users where email like '%@sitetrack.test' order by email`,
);

if (!list.rowCount) {
  console.log("ℹ️  No test users present.");
  if (existsSync(join(root, "TEST_USERS_CREDENTIALS.md"))) {
    unlinkSync(join(root, "TEST_USERS_CREDENTIALS.md"));
    console.log("🗑️  Removed stale TEST_USERS_CREDENTIALS.md");
  }
  await c.end();
  process.exit(0);
}

console.log(`${dryRun ? "[DRY RUN] Would delete" : "🗑️  Deleting"} ${list.rowCount} test user(s):`);
for (const r of list.rows) console.log(`   ${r.email}`);

if (dryRun) {
  await c.end();
  process.exit(0);
}

await c.query("set session_replication_role = 'replica'");
try {
  // Order matters when FKs aren't ON DELETE CASCADE.
  for (const r of list.rows) {
    await c.query("delete from public.org_members where profile_id = $1", [r.id]);
    await c.query("delete from public.profiles where id = $1", [r.id]);
    await c.query("delete from auth.identities where user_id = $1", [r.id]);
    await c.query("delete from auth.users where id = $1", [r.id]);
  }
} finally {
  await c.query("set session_replication_role = 'origin'");
  await c.end();
}

if (existsSync(join(root, "TEST_USERS_CREDENTIALS.md"))) {
  unlinkSync(join(root, "TEST_USERS_CREDENTIALS.md"));
  console.log("🗑️  Removed TEST_USERS_CREDENTIALS.md");
}

console.log("");
console.log(`✅ Removed ${list.rowCount} test user(s).`);
