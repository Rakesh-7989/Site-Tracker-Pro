#!/usr/bin/env node
// SiteTrack Pro — apply all SQL migrations against a real Supabase project.
//
// Reads SUPABASE_DB_URL from .env.local, then runs every .sql file in
// scripts/supabase/ in numeric order. Pure Node + pg — no psql install needed.
//
// Idempotent: every migration in this repo uses `if not exists` / `do $$` so
// re-running is safe. Reports pass/fail per file with the NOTICEs each one
// emits at the end (the migrations are designed to print a one-line sanity
// notice).
//
// Run:  npm run db:apply

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();

// ── Load .env.local ─────────────────────────────────────────────────────
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("❌ .env.local not found. Copy .env.example to .env.local first.");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);

const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl || dbUrl.includes("YOUR_") || dbUrl.length < 20) {
  console.error("❌ SUPABASE_DB_URL not set in .env.local.");
  console.error("   Set it to your Supabase Connection string (transaction mode).");
  console.error("   Find it at: Project Settings → Database → Connection string");
  process.exit(1);
}

// ── List migration files ────────────────────────────────────────────────
const dir = join(root, "scripts/supabase");

// Files 04 + 05 are legacy RLS assertion harnesses written when the project
// assumed service_role context (they INSERT into auth.users + call a custom
// assert_eq function not defined here). They're meaningful only in a freshly
// seeded test database — skip them in the regular runner. Apply manually via
// Supabase SQL Editor when running RLS regression sweeps.
const SKIP_FILES = new Set(["04_rls_tests.sql", "05_rls_phase1_tests.sql"]);

const files = readdirSync(dir)
  .filter(f => /^\d+_.*\.sql$/.test(f))
  .filter(f => !SKIP_FILES.has(f))
  .sort();   // numeric prefix ensures order

if (files.length === 0) {
  console.error("❌ No migration files found in scripts/supabase/");
  process.exit(1);
}

console.log(`\n📦 Applying ${files.length} migration(s) to:`);
console.log(`   ${dbUrl.replace(/:[^:@]+@/, ":****@")}\n`);

// ── Connect + apply ─────────────────────────────────────────────────────
const client = new pg.Client({
  connectionString: dbUrl,
  // Supabase pooled connections require this on some Node versions
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  // Session 28.1: allow `--reset` flag to drop + recreate the public schema
  // before applying migrations. Useful when a previous partial run left
  // policies/constraints behind that aren't `if not exists`-aware. Safe on
  // a fresh project (no data yet); destructive on an existing one — guard
  // by requiring an explicit flag.
  if (process.argv.includes("--reset")) {
    console.log("\n⚠️  --reset flag: dropping + recreating public schema...");
    await client.query(`
      drop schema if exists public cascade;
      create schema public;
      grant usage on schema public to postgres, anon, authenticated, service_role;
      grant all on schema public to postgres, service_role;
      alter default privileges in schema public grant all on tables to postgres, service_role;
      alter default privileges in schema public grant all on functions to postgres, service_role;
      alter default privileges in schema public grant all on sequences to postgres, service_role;
    `);
    console.log("   ✅ public schema reset.\n");
  }
} catch (e) {
  console.error("❌ Could not connect to Postgres:");
  console.error(`   ${e.message}`);
  console.error("\n   Common causes:");
  console.error("   - Wrong password in connection string");
  console.error("   - Project still provisioning (wait 1-2 min, retry)");
  console.error("   - Network/firewall blocking port 6543");
  process.exit(1);
}

const results = [];
let totalNotices = 0;

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  const noticesForFile = [];
  // Capture NOTICEs (the sanity prints at end of each migration)
  const noticeHandler = (msg) => {
    noticesForFile.push(msg.message);
    totalNotices++;
  };
  client.on("notice", noticeHandler);

  process.stdout.write(`   ${f.padEnd(38)} `);
  try {
    await client.query(sql);
    results.push({ file: f, ok: true, notices: noticesForFile });
    const finalNotice = noticesForFile[noticesForFile.length - 1] || "";
    console.log(`✅  ${finalNotice.slice(0, 80)}`);
  } catch (e) {
    results.push({ file: f, ok: false, error: e.message });
    console.log(`❌  ${e.message.slice(0, 80)}`);
    console.log(`\n   Full error in ${f}:`);
    console.log(`   ${e.message}`);
    if (e.detail) console.log(`   ${e.detail}`);
    if (e.hint) console.log(`   Hint: ${e.hint}`);
  } finally {
    client.off("notice", noticeHandler);
  }
}

await client.end();

// ── Summary ─────────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;

console.log(`\n${"─".repeat(60)}`);
console.log(`📊 Summary: ${passed} passed · ${failed} failed · ${totalNotices} notices`);
console.log(`${"─".repeat(60)}\n`);

if (failed > 0) {
  console.log("❌ Failures:");
  results.filter(r => !r.ok).forEach(r => {
    console.log(`   - ${r.file}: ${r.error.slice(0, 100)}`);
  });
  console.log("\n   Each migration is idempotent (if not exists / do $$).");
  console.log("   Fix the cause then re-run: npm run db:apply\n");
  process.exit(1);
}

console.log("🎉 All migrations applied successfully!");
console.log("\nNext steps:");
console.log("  1. Set VITE_BACKEND=supabase in .env.local");
console.log("  2. Restart dev server (npm run dev) — magic-link login will work");
console.log("  3. Run npm run check:supabase to verify end-to-end\n");
