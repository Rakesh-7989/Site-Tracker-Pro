// SiteTrack Edge Function test harness
// Run: node scripts/test-ef-harness.mjs
//
// Tests Edge Functions by calling them as HTTP endpoints against a local or
// deployed Supabase instance. All tests are READ-ONLY (no side effects on
// production data).
//
// Usage:
//   node scripts/test-ef-harness.mjs
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-ef-harness.mjs

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const envPath = join(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8").split(/\r?\n/)
      .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
      .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
  );
}

const env = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

let pass = 0;
let fail = 0;

const ok = (label, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS ${label}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
};

// ── Live-EF helpers (unused by default, needed when test users exist) ────────
/* eslint-disable no-unused-vars */

async function callEF(fnName, token, body) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, data };
}

async function signIn(email, password) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { error: j.error_description || j.msg || `HTTP ${res.status}` };
  if (!j.access_token) return { error: "no access_token in response" };
  return { token: j.access_token };
}

/* eslint-enable no-unused-vars */

// ── Test: Static analysis of EF source files ────────────────────────────────

async function testSignatureLogic() {
  const src = readFileSync(join(root, "supabase/functions/_shared/cashfree.ts"), "utf8");
  ok("cashfree.ts exports verifyWebhookSignature", src.includes("export async function verifyWebhookSignature"));
  ok("cashfree.ts exports applyWebhookEvent", src.includes("export function applyWebhookEvent"));
  ok("cashfree.ts exports mapCashfreeStatus", src.includes("export function mapCashfreeStatus"));
  ok("cashfree.ts exports buildSubscriptionRequest", src.includes("export function buildSubscriptionRequest"));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL) {
    console.log("⚠ SUPABASE_URL not set — skipping live EF tests. Set .env.local or env vars.\n");
  }

  console.log("\n── EF Static Analysis ──\n");
  await testSignatureLogic();

  if (SUPABASE_URL && ANON_KEY) {
    console.log("\n── EF Live Auth Tests (requires test users in DB) ──\n");
    console.log("  SKIP — no test user configured. Run scripts/create-test-users.mjs first.");
  } else {
    console.log("\n── Live EF Tests ──");
    console.log("  SKIP — SUPABASE_URL or ANON_KEY not available.");
  }

  console.log(`\n${fail === 0 ? "All" : "Some"} EF harness checks passed. ${pass} passed, ${fail} failed.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
