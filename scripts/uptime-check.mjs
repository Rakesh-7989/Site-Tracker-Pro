#!/usr/bin/env node
// SiteTrack Pro — uptime target verifier.
//
// Pings the same two endpoints an external uptime monitor (UptimeRobot free
// tier) should watch, and reports whether each is healthy. Run this BEFORE you
// configure the monitor (to confirm the targets respond) and any time you
// suspect an outage. READ-ONLY — no secrets needed (uses the public anon key).
//
// Targets:
//   1. Frontend  — the live Vercel site must return HTTP 200 + the app shell.
//   2. Backend   — Supabase GoTrue /auth/v1/health (needs the public apikey
//                  header) proves auth + the Supabase project are up.
//
// Usage: node scripts/uptime-check.mjs [frontendUrl]

import { readFileSync } from "node:fs";
import { join } from "node:path";

const FRONTEND = process.argv[2] || "https://sitetrack-rakesh.vercel.app";

// Pull the public Supabase URL + anon key from the committed public config
// (RLS-safe — same values every browser already downloads).
const cfg = readFileSync(join(process.cwd(), "src/lib/supabasePublicConfig.js"), "utf8");
const SUPABASE_URL = (cfg.match(/PUBLIC_SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
const ANON = (cfg.match(/PUBLIC_SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/) || [])[1];

const TIMEOUT_MS = 15000;

async function timed(label, fn) {
  const start = process.hrtime.bigint();
  try {
    const r = await fn();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return { label, ok: r.ok, detail: r.detail, ms: Math.round(ms) };
  } catch (e) {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return { label, ok: false, detail: e.message || String(e), ms: Math.round(ms) };
  }
}

async function fetchT(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

const checks = [
  () => timed(`Frontend  ${FRONTEND}`, async () => {
    const r = await fetchT(FRONTEND);
    const body = await r.text();
    // A real app shell, not a Vercel error page. index.html ships <div id="root">.
    const looksReal = body.includes('id="root"') || body.toLowerCase().includes("sitetrack");
    return { ok: r.status === 200 && looksReal, detail: `HTTP ${r.status}${looksReal ? "" : " (no app shell!)"}` };
  }),
  () => timed(`Backend   ${SUPABASE_URL}/auth/v1/health`, async () => {
    if (!SUPABASE_URL || !ANON) return { ok: false, detail: "public config missing" };
    const r = await fetchT(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON } });
    let name = "";
    try { name = (await r.json()).name || ""; } catch { /* ignore */ }
    return { ok: r.status === 200 && name === "GoTrue", detail: `HTTP ${r.status}${name ? ` · ${name}` : ""}` };
  }),
];

console.log("Uptime target check\n");
const results = await Promise.all(checks.map(c => c()));
let allOk = true;
for (const r of results) {
  if (!r.ok) allOk = false;
  console.log(`  ${r.ok ? "🟢" : "🔴"} ${r.label.padEnd(60)} ${r.detail}  (${r.ms}ms)`);
}
console.log(`\n${allOk ? "✅ All targets healthy." : "❌ One or more targets DOWN — investigate before relying on the app."}`);
process.exit(allOk ? 0 : 1);
