#!/usr/bin/env node
// SiteTrack Pro — Sync .env.local secrets into Supabase Edge Function env.
//
// Reads .env.local, filters to the whitelist of vars each EF needs, then
// pushes them via the Supabase CLI:
//   supabase secrets set KEY=value --project-ref nntkxojdeyziemdhyjvg
//
// Why this exists: founder edits one file (.env.local) and runs one
// command; doesn't have to remember which key goes into which Supabase
// project setting OR open the dashboard 8 times.
//
// Usage:
//   node scripts/sync-function-secrets.mjs            # syncs all
//   node scripts/sync-function-secrets.mjs --dry-run  # print but don't push
//   node scripts/sync-function-secrets.mjs --only WHATSAPP_PERMANENT_TOKEN,BHASHINI_API_KEY
//
// Prerequisites:
//   - supabase CLI installed (https://supabase.com/docs/guides/cli)
//   - `supabase login` completed once
//   - PROJECT_REF (see below) matches your Supabase project

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const PROJECT_REF = "nntkxojdeyziemdhyjvg";

const root = process.cwd();
const envPath = join(root, ".env.local");

if (!existsSync(envPath)) {
  console.error("❌ .env.local missing — nothing to sync");
  process.exit(1);
}

// Whitelist: only EF-side secrets ever cross the boundary. VITE_* belongs
// in the browser bundle, not in Supabase function env.
const SYNC_WHITELIST = [
  "WHATSAPP_PERMANENT_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "BHASHINI_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "BUILDNOW_API_TOKEN",
  "BUILDNOW_SCRAPE_ENABLED",
  "CASHFREE_APP_ID",
  "CASHFREE_SECRET",
  "CASHFREE_WEBHOOK_SECRET",
  "CASHFREE_ENV",
  "CASHFREE_RETURN_URL",
  "CASHFREE_NOTIFY_URL",
  "CASHFREE_ALLOWED_ORIGINS",
  "CORS_ALLOWED_ORIGINS",
  "TG_RERA_SCRAPER_ENABLED",
  "TG_RERA_PORTAL_URL",
  "TG_RERA_USER",
  "TG_RERA_PASS",
  "POLYGON_RPC_URL",
  "POLYGON_CONTRACT_ADDRESS",
  "POLYGON_SIGNER_PRIVATE_KEY",
  "POLYGON_SIGNER_URL",
  "POLYGON_GAS_PRICE_GWEI",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "SITETRACK_DRY_RUN",
  "SITETRACK_DIGEST_LIVE",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const onlyList = onlyIdx !== -1 && args[onlyIdx + 1]
  ? args[onlyIdx + 1].split(",").map(s => s.trim()).filter(Boolean)
  : null;

const raw = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  raw.split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
);

const toSync = SYNC_WHITELIST
  .filter(k => env[k] && env[k].length > 0 && !/^<.*>$/.test(env[k]))
  .filter(k => !onlyList || onlyList.includes(k));

if (toSync.length === 0) {
  console.log(`ℹ️  Nothing to sync — ${onlyList ? "no --only match" : "no whitelisted vars set"}`);
  process.exit(0);
}

console.log(`🔄 ${dryRun ? "[DRY RUN] " : ""}Pushing ${toSync.length} secrets to project ${PROJECT_REF}…`);
console.log("");

// Build a single `supabase secrets set` command with all the KEY=value pairs
// — faster than calling once per secret AND atomic (either all land or none).
const args2 = toSync.map(k => `${k}=${JSON.stringify(env[k])}`);
const cmd = `npx supabase secrets set --project-ref ${PROJECT_REF} ${args2.join(" ")}`;

if (dryRun) {
  console.log("Would run:");
  console.log(`  ${cmd.slice(0, 200)}${cmd.length > 200 ? "…" : ""}`);
  for (const k of toSync) console.log(`  · ${k} (${env[k].length} chars)`);
  process.exit(0);
}

try {
  execSync(cmd, { stdio: "inherit" });
  console.log("");
  console.log(`✅ Synced ${toSync.length} secrets.`);
  console.log("");
  console.log("📖 Next step: re-deploy affected EFs with:");
  console.log("   node scripts/deploy-edge-functions.mjs");
} catch (e) {
  console.error(`\n❌ supabase secrets set failed: ${e.message}`);
  console.error(`   Make sure supabase CLI is installed + 'supabase login' done.`);
  process.exit(1);
}
