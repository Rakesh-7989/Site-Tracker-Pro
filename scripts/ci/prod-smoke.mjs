#!/usr/bin/env node
// SiteTrack Pro — production smoke test (run right after every deploy).
//
// Hits the LIVE surfaces with no auth + no side effects and asserts they're up:
//   1. Landing page returns 200 HTML.
//   2. Supabase REST endpoint is reachable with the anon key.
//   3. The public signup Edge Function is healthy — we ping it with the honeypot
//      field filled, so it returns {ok:true} WITHOUT inserting a row.
//
// Usage: node scripts/prod-smoke.mjs [https://your-app-url]

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const env = existsSync(join(root, ".env.local"))
  ? Object.fromEntries(readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
      .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
      .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]))
  : {};

const APP = (process.argv[2] || env.VITE_APP_URL || "https://sitetrackpro.in").replace(/\/+$/, "");
// In CI there is no .env.local, so read the committed public config (RLS-safe —
// same values every browser downloads). Prefer the explicit env var when set.
let SUPA = env.VITE_SUPABASE_URL || "";
let ANON = env.VITE_SUPABASE_ANON_KEY || "";
try {
  const cfg = readFileSync(join(root, "src/lib/supabasePublicConfig.ts"), "utf8");
  SUPA = SUPA || (cfg.match(/PUBLIC_SUPABASE_URL[^\n=]*=\s*"([^"]+)"/) || [])[1] || "";
  ANON = ANON || (cfg.match(/PUBLIC_SUPABASE_ANON_KEY[^\n=]*=\s*"([^"]+)"/) || [])[1] || "";
} catch { /* fall through — env vars are authoritative when set */ }

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✅ ${m}`); pass++; };
const bad = (m) => { console.log(`  ❌ ${m}`); fail++; };

console.log(`Smoke-testing ${APP}\n`);

// 1. Landing page
try {
  const r = await fetch(APP, { redirect: "follow" });
  const html = await r.text();
  if (r.ok && /<div id="root"|SiteTrack/i.test(html)) ok(`landing page ${r.status} OK`);
  else bad(`landing page returned ${r.status} (no app shell?)`);
} catch (e) { bad(`landing page unreachable: ${e.message}`); }

// 2. Supabase REST reachable + anon key valid (plans has an anon read grant)
try {
  const r = await fetch(`${SUPA}/rest/v1/plans?select=id&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (r.ok) ok(`Supabase REST + anon key OK (${r.status})`);
  else bad(`Supabase REST unhealthy (${r.status}) — check anon key / plans grant`);
} catch (e) { bad(`Supabase unreachable: ${e.message}`); }

// 3. Signup EF healthy (honeypot ping — no row inserted)
try {
  const r = await fetch(`${SUPA}/functions/v1/submit_signup_request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ firmName: "Smoke Test", contactName: "Bot", email: "smoke@example.com", plan: "basic", website: "bot-honeypot" }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.ok) ok("signup Edge Function healthy (honeypot ping, no insert)");
  else bad(`signup EF returned ${r.status} ${JSON.stringify(j).slice(0, 80)}`);
} catch (e) { bad(`signup EF unreachable: ${e.message}`); }

console.log(`\n📊 Smoke: ${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
