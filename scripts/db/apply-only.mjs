#!/usr/bin/env node
// Apply specific migration files only (for incremental rollouts).
// Usage:  node scripts/apply-only.mjs 34_signup_self_serve.sql 35_plan_quotas.sql

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

const files = process.argv.slice(2);
if (files.length === 0) { console.error("usage: node scripts/apply-only.mjs <file1.sql> [...]"); process.exit(1); }

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

let passed = 0, failed = 0;
for (const f of files) {
  const path = join(root, "scripts/supabase", f);
  if (!existsSync(path)) { console.log(`❌ ${f}: not found`); failed++; continue; }
  const notices = [];
  const handler = (m) => notices.push(m.message);
  client.on("notice", handler);
  try {
    await client.query(readFileSync(path, "utf8"));
    console.log(`✅ ${f.padEnd(40)} ${(notices.at(-1) || "").slice(0, 80)}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${f.padEnd(40)} ${e.message.slice(0, 100)}`);
    failed++;
  } finally {
    client.off("notice", handler);
  }
}

await client.end();
console.log(`\n📊 ${passed} passed · ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
