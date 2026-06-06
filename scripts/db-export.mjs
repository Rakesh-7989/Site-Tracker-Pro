#!/usr/bin/env node
// SiteTrack Pro — logical data export (backup drill).
//
// Dumps every public table's rows to a timestamped JSON file under backups/
// (gitignored). This is an off-Supabase safety copy + proof that all data is
// extractable/restorable. Supabase also keeps daily backups; this is a manual
// belt-and-braces drill. READ-ONLY.
//
// Usage: node scripts/db-export.mjs

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);
const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl) { console.error("❌ SUPABASE_DB_URL missing in .env.local"); process.exit(1); }

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: tables } = await client.query(
  `select tablename from pg_tables where schemaname = 'public' order by tablename`);

const dump = { exportedAt: new Date().toISOString(), database: "supabase", tables: {} };
let total = 0;
console.log(`Exporting ${tables.length} public tables…\n`);
for (const { tablename } of tables) {
  try {
    const { rows } = await client.query(`select * from public.${tablename}`);
    dump.tables[tablename] = rows;
    total += rows.length;
    if (rows.length) console.log(`  ${tablename.padEnd(26)} ${rows.length}`);
  } catch (e) {
    console.log(`  ${tablename.padEnd(26)} (skip: ${e.message.slice(0, 40)})`);
  }
}
await client.end();

const dir = join(root, "backups");
if (!existsSync(dir)) mkdirSync(dir);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = join(dir, `export-${stamp}.json`);
writeFileSync(file, JSON.stringify(dump, null, 2), "utf8");

console.log(`\n✅ Exported ${total} rows across ${tables.length} tables → backups/export-${stamp}.json`);
console.log("   (gitignored — store a copy somewhere safe.)");
