#!/usr/bin/env node
// SiteTrack Pro — B4: wire real email notification delivery end-to-end.
//
// Generates a shared internal token, pushes it to the notify-deliver Edge
// Function as NOTIFY_INTERNAL_TOKEN, and stores the same value in the
// notify_config table so the trg_notify_deliver trigger can authenticate its
// net.http_post call. Also records it in .env.local (gitignored) for backup.
//
// Usage:
//   node scripts/configure-notify-delivery.mjs          # wire everything
//   node scripts/configure-notify-delivery.mjs --dry-run  # print, don't touch
//   node scripts/configure-notify-delivery.mjs --rotate  # force a new token
//
// Prerequisites: supabase CLI + `supabase login`, .env.local with
// SUPABASE_DB_URL.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";

const PROJECT_REF = "nntkxojdeyziemdhyjvg";
const root = process.cwd();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const rotate = args.includes("--rotate");

const envPath = join(root, ".env.local");
if (!existsSync(envPath)) { console.error("❌ .env.local missing"); process.exit(1); }

const parseEnv = (txt) =>
  Object.fromEntries(
    txt.split(/\r?\n/).map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
      .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
  );

const env = parseEnv(readFileSync(envPath, "utf8"));

const existingToken = env.NOTIFY_INTERNAL_TOKEN && !/^<.*>$/.test(env.NOTIFY_INTERNAL_TOKEN)
  ? env.NOTIFY_INTERNAL_TOKEN
  : null;

let token;
if (existingToken && !rotate) {
  token = existingToken;
  console.log(`ℹ️  Reusing existing NOTIFY_INTERNAL_TOKEN from .env.local (${token.length} chars). Use --rotate to regenerate.`);
} else {
  token = `st_${randomBytes(24).toString("base64url")}`;
  console.log(`🔑 Generated new NOTIFY_INTERNAL_TOKEN (${token.length} chars).`);
}

// 1. Set the EF secret
const setCmd = `npx supabase secrets set --project-ref ${PROJECT_REF} NOTIFY_INTERNAL_TOKEN=${JSON.stringify(token)}`;
if (dryRun) {
  console.log("Would run:");
  console.log(`  ${setCmd}`);
  console.log(`  UPDATE notify_config SET value = '${token}' WHERE key='deliver_token';`);
  console.log(`  .env.local NOTIFY_INTERNAL_TOKEN=...`);
  process.exit(0);
}
console.log(`\n🔄 Setting NOTIFY_INTERNAL_TOKEN secret on ${PROJECT_REF}…`);
try {
  execSync(setCmd, { stdio: "inherit" });
} catch (e) {
  console.error(`\n❌ supabase secrets set failed: ${e.message}`);
  process.exit(1);
}

// 2. Store the token in the DB config table
console.log("\n🔄 Storing deliver_token in notify_config…");
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(
  `INSERT INTO public.notify_config (key, value, updated_at)
   VALUES ('deliver_token', $1, now())
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
  [token],
);
const row = await client.query("select value from public.notify_config where key='deliver_token'");
console.log(`✅ deliver_token stored in notify_config (length ${row.rows[0].value.length}).`);
await client.end();

// 3. Persist to .env.local for backup
const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
const idx = lines.findIndex(l => l.startsWith("NOTIFY_INTERNAL_TOKEN="));
if (idx !== -1) {
  lines[idx] = `NOTIFY_INTERNAL_TOKEN=${token}`;
} else {
  lines.push(`NOTIFY_INTERNAL_TOKEN=${token}`);
}
writeFileSync(envPath, lines.join("\n"), "utf8");
console.log("✅ Recorded in .env.local.");

console.log("\n📖 Next step: redeploy notify-deliver so the secret applies, then re-verify:");
console.log("   npx supabase functions deploy notify-deliver --project-ref " + PROJECT_REF + " --no-verify-jwt");
