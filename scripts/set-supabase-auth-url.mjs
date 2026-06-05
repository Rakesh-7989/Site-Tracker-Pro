#!/usr/bin/env node
// SiteTrack Pro — fix Supabase Auth Site URL + redirect allow-list.
//
// Symptom: magic-link / reset emails redirect to http://localhost:5173 (white
// screen) instead of the production app. Cause: the project's Auth "Site URL"
// is still localhost, and the production URL isn't in the redirect allow-list,
// so Supabase ignores our emailRedirectTo and falls back to Site URL.
//
// This reads SUPABASE_ACCESS_TOKEN + VITE_APP_URL from .env.local and PATCHes
// the project's auth config via the Management API.
//
// Usage:
//   node scripts/set-supabase-auth-url.mjs          # show current config
//   node scripts/set-supabase-auth-url.mjs --apply  # write the fix

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) { console.error("❌ .env.local missing"); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error("❌ SUPABASE_ACCESS_TOKEN missing in .env.local"); process.exit(1); }
const url = env.VITE_SUPABASE_URL || "";
const ref = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
if (!ref) { console.error(`❌ could not derive project ref from VITE_SUPABASE_URL (${url})`); process.exit(1); }
const APP = (env.VITE_APP_URL || "https://sitetrack-rakesh.vercel.app").replace(/\/+$/, "");

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

// Production URL + its sub-paths, PLUS localhost for local dev. Supabase
// matches redirect targets against this allow-list (supports trailing /**).
const allowList = [
  APP,
  `${APP}/**`,
  "http://localhost:5173",
  "http://localhost:5173/**",
].join(",");

(async () => {
  const cur = await fetch(api, { headers });
  if (!cur.ok) { console.error(`❌ GET config failed: ${cur.status} ${await cur.text()}`); process.exit(1); }
  const c = await cur.json();
  console.log("Current:");
  console.log(`  site_url       = ${c.site_url}`);
  console.log(`  uri_allow_list = ${c.uri_allow_list}`);

  if (!process.argv.includes("--apply")) {
    console.log(`\nWould set:`);
    console.log(`  site_url       = ${APP}`);
    console.log(`  uri_allow_list = ${allowList}`);
    console.log(`\nRe-run with --apply to write.`);
    return;
  }

  const r = await fetch(api, { method: "PATCH", headers, body: JSON.stringify({ site_url: APP, uri_allow_list: allowList }) });
  if (!r.ok) { console.error(`❌ PATCH failed: ${r.status} ${await r.text()}`); process.exit(1); }
  const after = await r.json();
  console.log("\n✅ Updated:");
  console.log(`  site_url       = ${after.site_url}`);
  console.log(`  uri_allow_list = ${after.uri_allow_list}`);
})().catch(e => { console.error(`\n❌ ${e.message}`); process.exit(1); });
