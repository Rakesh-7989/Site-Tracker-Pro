#!/usr/bin/env node
// SiteTrack Pro — Production env-config readiness check.
//
// Probes .env.local for every secret each Edge Function needs, reports
// per-EF readiness. Founder runs this BEFORE invoking deploy-edge-
// functions.mjs so a missing key surfaces here, not as a runtime 500.
//
// Usage:
//   node scripts/check-env-config.mjs
//   node scripts/check-env-config.mjs --strict   # exit 1 on any missing
//
// Returns per-EF rows:
//   ✅ ef_name        — all required env vars present
//   ⏳ ef_name (3/5) — partial; lists missing
//   ❌ ef_name        — totally unconfigured

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const envPath = join(root, ".env.local");

// ── Load .env.local without shell expansion (it's not sourced) ──────────────
let env = {};
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");
  env = Object.fromEntries(
    raw.split(/\r?\n/)
      .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
  );
}

// Browser-shipped Vite envs (these end up in the JS bundle, not in Supabase
// function secrets, but we still check they exist).
const BROWSER_VARS = [
  "VITE_BACKEND",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_APP_URL",
];

// Edge-function-side secrets, grouped by which EF needs which.
const EF_REQUIREMENTS = [
  {
    ef: "whatsapp_dpr_send",
    purpose: "Send daily progress reports to promoter WhatsApp",
    required: ["WHATSAPP_PERMANENT_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
    optional: ["SITETRACK_DRY_RUN"],
  },
  {
    ef: "voice_transcribe",
    purpose: "Telugu/Hindi voice → text via Bhashini (primary) + AWS (fallback)",
    required: ["BHASHINI_API_KEY"],
    optional: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  },
  {
    ef: "buildnow_anchor",
    purpose: "Mirror BuildNow Telangana approval status into our DB",
    required: [],
    optional: ["BUILDNOW_API_TOKEN", "BUILDNOW_SCRAPE_ENABLED"],
  },
  {
    ef: "promoter_digest_cron",
    purpose: "Hourly tick that sends the 7am daily digest to subscribed promoters",
    required: ["WHATSAPP_PERMANENT_TOKEN"],
    optional: ["SITETRACK_DIGEST_LIVE"],
  },
  {
    ef: "cashfree-webhook",
    purpose: "Validate + record Cashfree subscription webhooks",
    required: ["CASHFREE_APP_ID", "CASHFREE_SECRET", "CASHFREE_WEBHOOK_SECRET"],
    optional: [],
  },
  {
    ef: "whatsapp-send (legacy)",
    purpose: "Generic WhatsApp Cloud API send (pre-DPR; superseded by whatsapp_dpr_send)",
    required: ["WHATSAPP_PERMANENT_TOKEN"],
    optional: [],
  },
  {
    ef: "anchor-digest",
    purpose: "Polygon blockchain anchor for audit rows",
    required: ["POLYGON_RPC_URL", "POLYGON_CONTRACT_ADDRESS"],
    optional: ["POLYGON_SIGNER_PRIVATE_KEY", "POLYGON_SIGNER_URL"],
  },
];

// Supabase Auth SMTP (set in Supabase dashboard, not here — listed so the
// founder remembers).
const SUPABASE_AUTH_SMTP_NOTE = [
  "RESEND_API_KEY (set in Supabase Dashboard → Auth → SMTP Settings, NOT .env.local)",
];

const args = process.argv.slice(2);
const strict = args.includes("--strict");

const isSet = (k) => env[k] && String(env[k]).trim().length > 0 && !/^<.*>$/.test(env[k]);

// ── Print browser vars ─────────────────────────────────────────────────────
console.log("📦 Browser-shipped Vite envs:");
let browserMissing = 0;
for (const v of BROWSER_VARS) {
  const ok = isSet(v);
  if (!ok) browserMissing++;
  console.log(`  ${ok ? "✅" : "❌"} ${v}${ok ? "" : "  ← MISSING in .env.local"}`);
}

console.log("");
console.log("🔧 Edge Function requirements (set as Supabase function secrets):");
console.log("");

let totalMissing = 0;
let efTotalOk = 0;

for (const e of EF_REQUIREMENTS) {
  const missing = e.required.filter(v => !isSet(v));
  const optionalSet = e.optional.filter(v => isSet(v));
  const status =
    missing.length === 0 ? "✅"
    : missing.length === e.required.length ? "❌"
    : "⏳";
  const ratio = e.required.length === 0
    ? "no required"
    : `${e.required.length - missing.length}/${e.required.length}`;
  console.log(`  ${status} ${e.ef.padEnd(25)} ${ratio.padStart(12)}   ${e.purpose}`);
  if (missing.length) {
    for (const v of missing) console.log(`        ↳ missing required: ${v}`);
  }
  if (optionalSet.length) {
    for (const v of optionalSet) console.log(`        ↳ optional set:    ${v}`);
  }
  totalMissing += missing.length;
  if (missing.length === 0) efTotalOk++;
}

console.log("");
console.log("📨 Supabase Auth SMTP (configured in dashboard, NOT .env.local):");
for (const line of SUPABASE_AUTH_SMTP_NOTE) console.log(`  ℹ️  ${line}`);

console.log("");
const summary =
  totalMissing === 0
    ? `✅ All ${EF_REQUIREMENTS.length} Edge Functions have their required env vars set.`
    : `⏳ ${efTotalOk}/${EF_REQUIREMENTS.length} Edge Functions ready. ${totalMissing} required env vars missing.`;
console.log(`📊 ${summary}`);

if (totalMissing || browserMissing) {
  console.log("");
  console.log("📖 Next steps:");
  console.log("  1. Add the missing keys to .env.local (do NOT commit — it's git-ignored).");
  console.log("  2. Run `node scripts/sync-function-secrets.mjs` to push them to Supabase.");
  console.log("  3. Run `node scripts/deploy-edge-functions.mjs` to redeploy the affected EFs.");
}

if (strict && (totalMissing || browserMissing)) process.exit(1);
process.exit(0);
