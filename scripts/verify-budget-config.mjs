#!/usr/bin/env node
// SiteTrack Pro — Zero-spend config verifier.
//
// Sanity-checks .env.local against the zero-spend policy:
//   1. BUDGET_MODE is set (warns if missing — defaults are silent).
//   2. POLYGON_NETWORK is amoy / mumbai (free) unless BUDGET_MODE=paid.
//   3. AWS keys NOT set when BUDGET_MODE=zero-spend (false signal).
//   4. WHATSAPP_OVERRIDE_PAID is empty unless explicitly approved.
//   5. OPENAI_API_KEY / ANTHROPIC_API_KEY empty in zero-spend mode.
//
// Exit code 0 if compliant; 1 if a policy violation is found.
//
// Usage:
//   node scripts/verify-budget-config.mjs
//   node scripts/verify-budget-config.mjs --strict   # exit 1 even on warnings

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { getBudgetMode, isProviderAllowed, classifyProvider } from "../src/lib/budgetMode.js";

const root = process.cwd();
const envPath = join(root, ".env.local");

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

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const isSet = (k) => env[k] && String(env[k]).trim().length > 0 && !/^<.*>$/.test(env[k]);

const issues = [];
const warnings = [];
const oks = [];

// ── 1. BUDGET_MODE explicit? ──
const mode = getBudgetMode(env);
if (!env.BUDGET_MODE) {
  warnings.push("BUDGET_MODE not set in .env.local — defaulting to zero-spend (safe). Set explicitly to silence this warning.");
} else {
  oks.push(`BUDGET_MODE=${mode}`);
}

// ── 2. Polygon network ──
const polygonNet = env.POLYGON_NETWORK || "polygon-amoy";
const polygonClass = classifyProvider(polygonNet);
const polygonAllowed = isProviderAllowed(polygonNet, env).allowed;
if (!polygonAllowed) {
  issues.push(`POLYGON_NETWORK=${polygonNet} is ${polygonClass} but BUDGET_MODE=${mode}. Either set POLYGON_NETWORK=polygon-amoy or flip BUDGET_MODE=paid.`);
} else {
  oks.push(`POLYGON_NETWORK=${polygonNet} (${polygonClass}) — allowed`);
}

// ── 3. AWS keys ──
if (isSet("AWS_ACCESS_KEY_ID") || isSet("AWS_SECRET_ACCESS_KEY")) {
  if (mode === "zero-spend") {
    warnings.push("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY set, but BUDGET_MODE=zero-spend will refuse them. Either remove or flip mode (founder approval needed).");
  } else {
    oks.push("AWS keys set + BUDGET_MODE=paid");
  }
} else {
  oks.push("AWS keys not set (zero-spend compliant)");
}

// ── 4. WhatsApp paid override ──
if (env.WHATSAPP_OVERRIDE_PAID === "1") {
  if (mode === "zero-spend") {
    warnings.push("WHATSAPP_OVERRIDE_PAID=1 active in zero-spend mode — Meta will bill ₹0.40/msg past 1k/mo. Confirm this is approved.");
  } else {
    oks.push("WHATSAPP_OVERRIDE_PAID=1 + BUDGET_MODE=paid");
  }
} else {
  oks.push("WHATSAPP_OVERRIDE_PAID empty (cap enforced at 1k/mo)");
}

// ── 5. AI provider keys ──
for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
  if (isSet(key)) {
    if (mode === "zero-spend") {
      warnings.push(`${key} set, but BUDGET_MODE=zero-spend blocks the provider. Remove or flip mode.`);
    } else {
      oks.push(`${key} set + BUDGET_MODE=paid`);
    }
  }
}

// ── 6. Soft check: capped-free near-cap ──
// (Not enforceable from env alone — would need to query Supabase. Just
//  remind the founder where to look.)
oks.push("Capped-free meters (whatsapp_quota_counter / Sentry / Resend) — check provider dashboards monthly");

// ── Report ──
const icon = (s) => s === "ok" ? "✅" : s === "warn" ? "⚠️ " : "🚨";
console.log("");
console.log(`${icon(mode === "zero-spend" ? "ok" : "warn")} Budget mode: ${mode}`);
console.log("");

if (oks.length) {
  console.log("✅ Compliant:");
  for (const m of oks) console.log(`   · ${m}`);
  console.log("");
}
if (warnings.length) {
  console.log("⚠️  Warnings:");
  for (const m of warnings) console.log(`   · ${m}`);
  console.log("");
}
if (issues.length) {
  console.log("🚨 Policy violations:");
  for (const m of issues) console.log(`   · ${m}`);
  console.log("");
}

const summary =
  issues.length === 0 && warnings.length === 0
    ? "✅ Fully zero-spend compliant."
    : issues.length === 0
    ? `⚠️  ${warnings.length} warning(s), no violations.`
    : `🚨 ${issues.length} policy violation(s) + ${warnings.length} warning(s).`;
console.log(`📊 ${summary}`);
console.log("");
console.log("📖 Policy: docs/ZERO_SPEND_POLICY.md");

if (issues.length || (strict && warnings.length)) process.exit(1);
process.exit(0);
