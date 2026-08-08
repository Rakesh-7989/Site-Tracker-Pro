import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";

const root = process.cwd();
const envPath = join(root, ".env.local");

if (!existsSync(envPath)) {
  console.error("❌ .env.local not found");
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
  console.error("❌ SUPABASE_DB_URL not set in .env.local");
  process.exit(1);
}

const f = "173_multi_org_invitations.sql";
const sql = readFileSync(join("scripts/supabase", f), "utf8");

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`\n📦 Applying 173_multi_org_invitations.sql...`);
  await client.query(sql);
  console.log(`✅ 173_multi_org_invitations.sql applied successfully!`);
} catch (e) {
  console.error(`❌ Failed to apply 173_multi_org_invitations.sql:`);
  console.error(e.message);
  if (e.detail) console.error(`   ${e.detail}`);
  if (e.hint) console.error(`   Hint: ${e.hint}`);
  process.exit(1);
} finally {
  await client.end();
}
console.log("\n🎉 Migration 173 applied successfully!");