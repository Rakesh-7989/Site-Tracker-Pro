// SiteTrack Pro — Supabase connection checker.
//
// Run via:   npm run check:supabase
//        or: node scripts/check-supabase-connection.mjs
//
// Reads .env.local (NOT committed) and runs a sequence of verifications to
// confirm the backend is reachable + the schema is in place + RLS is on.
//
// Every step prints PASS / FAIL. Exits 0 only when every step passes.
//
// IMPORTANT: This script ONLY uses the public anon key (which is safe to ship
// in the browser). It never reads or uses the service_role key — that key
// stays in Edge Function env vars exclusively.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ENV_PATH = join(root, ".env.local");

const results = [];
const add = (name, pass, detail = "") => results.push({ name, pass, detail });

console.log("\nSiteTrack Supabase connection check\n=========================================\n");

// ── Step 1: .env.local exists ───────────────────────────────────────────────
if (!existsSync(ENV_PATH)) {
  console.error("FAIL  .env.local not found.");
  console.error("");
  console.error("  Copy the template and fill in your project URL + anon key:");
  console.error("    cp .env.example .env.local");
  console.error("");
  console.error("  Then edit .env.local — see docs/setup/CONNECT_SUPABASE.md for");
  console.error("  exactly where to find each value in the Supabase dashboard.");
  process.exit(1);
}
add(".env.local file present", true);

// ── Step 2: Parse env file into a plain object ──────────────────────────────
const env = {};
const raw = readFileSync(ENV_PATH, "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (!m) continue;
  let value = m[2];
  // Strip wrapping quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[m[1]] = value;
}

// ── Step 3: Mode must be 'supabase' ────────────────────────────────────────
const mode = env.VITE_BACKEND || "local";
add(`VITE_BACKEND=supabase`, mode === "supabase", mode === "supabase" ? "" : `currently "${mode}"`);

// ── Step 4: URL looks right ────────────────────────────────────────────────
const url = env.VITE_SUPABASE_URL || "";
const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url);
add("VITE_SUPABASE_URL looks valid", urlOk, urlOk ? "" : `got "${url || "<empty>"}" — should be https://<project>.supabase.co`);

// ── Step 5: Anon key shape — should be a long JWT (3 dot-segments) ─────────
const anon = env.VITE_SUPABASE_ANON_KEY || "";
const looksLikeJwt = anon.split(".").length === 3 && anon.length > 80;
const isPublishable = anon.startsWith("sb_publishable_");
const anonOk = looksLikeJwt || isPublishable;
add("VITE_SUPABASE_ANON_KEY shape looks valid",
    anonOk,
    anonOk
      ? (isPublishable ? "sb_publishable_… format (new style)" : "JWT format")
      : `got "${anon ? anon.slice(0, 12) + "…" : "<empty>"}" — should be a JWT or sb_publishable_…`);

// ── Step 6: Anon key MUST NOT be a service_role / secret / PAT ─────────────
const looksSecret = anon.startsWith("sb_secret_") || anon.startsWith("sbp_");
let serviceRoleLeak = false;
try {
  if (looksLikeJwt) {
    const payload = JSON.parse(Buffer.from(anon.split(".")[1], "base64").toString("utf8"));
    if (payload.role === "service_role") serviceRoleLeak = true;
  }
} catch { /* shape was already rejected above */ }
add("VITE_SUPABASE_ANON_KEY is NOT the service_role / secret key",
    !looksSecret && !serviceRoleLeak,
    looksSecret ? "BOMB: this looks like a secret key — never put it in a browser bundle!" :
    serviceRoleLeak ? "BOMB: this JWT has role=service_role — would bypass RLS!" : "");

const earlyFailures = results.filter(r => !r.pass);
if (earlyFailures.length) {
  printResults();
  console.error("\nFix the above before going further.\n");
  process.exit(1);
}

// ── Step 7: Network reachability — ping /rest/v1/ ──────────────────────────
console.log("Attempting connection…\n");
try {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/?apikey=${anon}`, {
    headers: { "apikey": anon, "Authorization": `Bearer ${anon}` },
  });
  add("Reachable: GET /rest/v1/ returned", res.ok || res.status === 401 || res.status === 404,
      `HTTP ${res.status} ${res.statusText}`);
} catch (err) {
  add("Reachable: GET /rest/v1/", false, err.message);
}

// ── Step 8: Schema check — does the `projects` table exist? ────────────────
try {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/projects?select=id&limit=1`, {
    headers: { "apikey": anon, "Authorization": `Bearer ${anon}` },
  });
  if (res.status === 200) {
    const rows = await res.json();
    add("projects table is reachable", true, `${rows.length} row(s) visible to anon (RLS will hide most)`);
  } else if (res.status === 401) {
    add("projects table requires auth (expected on RLS)", true, "401 — RLS is enforcing");
  } else if (res.status === 404 || res.status === 406) {
    const body = await res.text();
    add("projects table exists", false, `${res.status} — did you run scripts/supabase/01_schema.sql?  body: ${body.slice(0, 200)}`);
  } else {
    add("projects table query returned an OK status", false, `HTTP ${res.status}`);
  }
} catch (err) {
  add("projects table reachable", false, err.message);
}

// ── Step 9: Phase 1 schema — does `org_integrations` exist? ────────────────
try {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/org_integrations?select=org_id&limit=1`, {
    headers: { "apikey": anon, "Authorization": `Bearer ${anon}` },
  });
  if (res.status === 200 || res.status === 401) {
    add("Phase 1 schema applied (org_integrations table)", true, `HTTP ${res.status}`);
  } else if (res.status === 404 || res.status === 406) {
    add("Phase 1 schema applied", false, `Run scripts/supabase/03_rls_phase1.sql`);
  } else {
    add("Phase 1 schema check", false, `HTTP ${res.status}`);
  }
} catch (err) {
  add("Phase 1 schema check", false, err.message);
}

// ── Step 10: RLS enforcement spot-check ────────────────────────────────────
// Without an auth token, anon should see ZERO projects when RLS is on.
// (A FAIL here means RLS isn't enabled or policies are too permissive.)
try {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/projects?select=id`, {
    headers: { "apikey": anon, "Authorization": `Bearer ${anon}` },
  });
  if (res.status === 200) {
    const rows = await res.json();
    const ok = rows.length === 0;
    add("RLS is enforced (anon sees 0 projects)", ok,
        ok ? "" : `BOMB: anon saw ${rows.length} project(s) — RLS may be disabled!`);
  } else if (res.status === 401) {
    add("RLS rejects unauthenticated reads", true, "401 — strictest mode, even better");
  } else {
    add("RLS spot-check", false, `unexpected HTTP ${res.status}`);
  }
} catch (err) {
  add("RLS spot-check", false, err.message);
}

printResults();

const failed = results.filter(r => !r.pass).length;
if (failed) {
  console.error(`\n${failed} check(s) failed. See docs/setup/CONNECT_SUPABASE.md for the fix.\n`);
  process.exit(1);
}
console.log("\nAll checks passed. Backend is wired up. Start the dev server with: npm run dev\n");

function printResults() {
  console.log("");
  for (const r of results) {
    const tag = r.pass ? "PASS" : "FAIL";
    console.log(`${tag}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
}
