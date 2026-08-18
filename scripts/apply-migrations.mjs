#!/usr/bin/env node
// SiteTrack Pro — apply all SQL migrations against a real Supabase project.
//
// Reads SUPABASE_DB_URL from .env.local, then runs every .sql file in
// scripts/supabase/ in numeric order. Pure Node + pg — no psql install needed.
//
// Phase 0 hardening (DB-01/02/03):
//   DB-01 Ledger — a `public.site_track_migrations` table records every applied
//         file (name, sha256 checksum, applied_at, success). Self-bootstrapped
//         here so it exists regardless of which migrations have run. Named to
//         avoid clashing with Supabase's own `schema_migrations` tracking.
//   DB-02 Checksum — a file already recorded as success is SKIPPED when its
//         checksum still matches (idempotent fast path). If an applied file's
//         checksum has drifted the run FAILS hard — applied migrations are
//         immutable; changes must land as a NEW numbered file.
//   DB-03 Reset guard — `--reset` refuses to drop a public schema that holds
//         real data (organizations or auth users). Pass `--force-reset` to
//         override on a known-disposable database.
//
// Every migration in this repo uses `if not exists` / `do $$` so a file's
// first-ever apply is safe to re-run; the ledger makes repeat runs skip
// instead of re-executing. Reports pass/fail/skip per file with the NOTICEs
// each one emits (migrations print a one-line sanity notice).
//
// Run:  npm run db:apply             (apply pending migrations)
//       npm run db:apply -- --reset  (drop + recreate public schema, guarded)

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
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
  .sort((a, b) => Number(a.split("_", 1)[0]) - Number(b.split("_", 1)[0]) || a.localeCompare(b));

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

// Hash on normalized line endings so an LF/CRLF working copy (git autocrlf)
// hashes identically — a checkout round-trip must NOT look like drift.
const sha256 = (s) => createHash("sha256").update(s.replace(/\r\n/g, "\n"), "utf8").digest("hex");

let ledger = new Map();

try {
  await client.connect();
  // DB-03 — `--reset` drops + recreates the public schema before applying
  // migrations. Production-safe guard: refuse when real data is present
  // unless `--force-reset` is also given. Useful when a previous partial run
  // left policies/constraints behind that aren't `if not exists`-aware.
  if (process.argv.includes("--reset")) {
    const force = process.argv.includes("--force-reset");
    if (!force) {
      const orgCount = await client
        .query(`select count(*)::int n from pg_catalog.pg_tables where schemaname='public' and tablename='organizations'`)
        .then((r) => r.rows[0].n);
      const users = await client
        .query(`select count(*)::int n from pg_catalog.pg_tables where schemaname='auth' and tablename='users'`)
        .then((r) => r.rows[0].n);
      let data = 0;
      if (orgCount > 0) {
        const o = await client.query(`select count(*)::int n from public.organizations`).catch(() => ({ rows: [{ n: 0 }] }));
        data += o.rows[0].n;
      }
      if (users > 0) {
        const u = await client.query(`select count(*)::int n from auth.users`).catch(() => ({ rows: [{ n: 0 }] }));
        data += u.rows[0].n;
      }
      if (data > 0) {
        console.error("\n❌ --reset blocked: this database holds real data (organizations/auth users).");
        console.error("   This looks like a production database — refusing to drop its public schema.");
        console.error("   If this is a disposable database, re-run with: npm run db:apply --reset --force-reset\n");
        await client.end();
        process.exit(1);
      }
    }
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

  // DB-01 — self-bootstrap the migration ledger (survives a schema reset).
  // NOTE: not `schema_migrations` — Supabase's CLI already owns that table.
  await client.query(`
    create table if not exists public.site_track_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      success boolean not null default true
    );
  `);
  ledger = new Map(
    (await client.query(`select name, checksum from public.site_track_migrations where success`)).rows
      .map((r) => [r.name, r.checksum])
  );
  console.log(`   ledger: ${ledger.size} applied migration(s) recorded\n`);
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
let skipped = 0;

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  const checksum = sha256(sql);
  const noticesForFile = [];

  // DB-02 — recorded files are immutable: matching checksum = skip, drift = fail.
  if (ledger.has(f)) {
    if (ledger.get(f) === checksum) {
      process.stdout.write(`   ${f.padEnd(38)} `);
      skipped++;
      console.log(`⏭️   already applied (ledger)`);
      results.push({ file: f, ok: true, skipped: true, checksum });
      continue;
    }
    results.push({ file: f, ok: false, error: `checksum drift: migration ${f} was already applied but its file content changed` });
    console.log(`❌  checksum drift: ${f} was already applied; file content changed.`);
    console.log(`\n   Full error in ${f}:`);
    console.log("   Applied migrations are immutable — DO NOT edit them in place.");
    console.log("   Write a new numbered migration file instead.\n");
    continue;
  }

  // Capture NOTICEs (the sanity prints at end of each migration)
  const noticeHandler = (msg) => {
    noticesForFile.push(msg.message);
    totalNotices++;
  };
  client.on("notice", noticeHandler);

  process.stdout.write(`   ${f.padEnd(38)} `);
  try {
    await client.query(sql);
    results.push({ file: f, ok: true, checksum });
    await client.query(
      `insert into public.site_track_migrations (name, checksum, success) values ($1,$2,true)
       on conflict (name) do update set checksum=excluded.checksum, applied_at=now(), success=true`,
      [f, checksum]
    );
    const finalNotice = noticesForFile[noticesForFile.length - 1] || "";
    console.log(`✅  ${finalNotice.slice(0, 80)}`);
  } catch (e) {
    results.push({ file: f, ok: false, error: e.message, checksum });
    await client
      .query(
        `insert into public.site_track_migrations (name, checksum, success) values ($1,$2,false)
         on conflict (name) do update set applied_at=now(), success=false`,
        [f, checksum]
      )
      .catch(() => {});
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
console.log(`📊 Summary: ${passed} passed · ${failed} failed · ${skipped} skipped (ledger) · ${totalNotices} notices`);
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
