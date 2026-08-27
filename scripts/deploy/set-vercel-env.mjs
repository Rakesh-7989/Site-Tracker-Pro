#!/usr/bin/env node
// SiteTrack Pro — push the front-end VITE_* env vars to Vercel (Production +
// Preview + Development) via the Vercel REST API, then print next steps.
//
// Why: the live build showed "backend-disabled" because the Vercel build had
// no VITE_BACKEND / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Those live only
// in .env.local (read by node scripts), never in the browser build.
//
// Usage:  node scripts/set-vercel-env.mjs
// Needs in .env.local:  VERCEL_TOKEN=...   (create at Vercel → Settings → Tokens)
// Reads project/org id from .vercel/project.json (already linked).

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

const TOKEN = env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error("❌ VERCEL_TOKEN missing in .env.local.\n" +
    "   Create one: Vercel → Settings → Tokens → Create (scope: Full Account, no expiry or 1 day).\n" +
    "   Then add a line to .env.local:  VERCEL_TOKEN=xxxxxxxx\n" +
    "   (gitignored — never paste it in chat.)");
  process.exit(1);
}

const linkPath = join(root, ".vercel", "project.json");
if (!existsSync(linkPath)) { console.error("❌ .vercel/project.json missing (project not linked)"); process.exit(1); }
const { projectId, orgId } = JSON.parse(readFileSync(linkPath, "utf8"));

// The 4 vars the browser build needs. Values come straight from .env.local.
const KEYS = ["VITE_BACKEND", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_APP_URL"];
const missing = KEYS.filter(k => !env[k]);
if (missing.length) { console.error(`❌ Missing in .env.local: ${missing.join(", ")}`); process.exit(1); }

const team = orgId ? `?teamId=${orgId}` : "";
const base = `https://api.vercel.com/v10/projects/${projectId}/env${team}`;
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function listExisting() {
  const r = await fetch(base, { headers });
  if (!r.ok) throw new Error(`list env failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.envs || j.environmentVariables || [];
}

async function deleteEnv(id) {
  const r = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env/${id}${team}`, { method: "DELETE", headers });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${id} failed: ${r.status} ${await r.text()}`);
}

async function createEnv(key, value) {
  const body = JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview", "development"] });
  const r = await fetch(base, { method: "POST", headers, body });
  if (!r.ok) throw new Error(`create ${key} failed: ${r.status} ${await r.text()}`);
}

(async () => {
  console.log(`🔧 Project ${projectId} (team ${orgId || "personal"})`);
  const existing = await listExisting();
  for (const key of KEYS) {
    // Remove any prior copies of this key (across targets) so we set fresh.
    for (const e of existing.filter(e => e.key === key)) {
      await deleteEnv(e.id);
      console.log(`   – removed old ${key}`);
    }
    await createEnv(key, env[key]);
    const shown = key.includes("ANON") || key.includes("TOKEN") ? `${env[key].slice(0, 12)}… (len ${env[key].length})` : env[key];
    console.log(`   ✅ set ${key} = ${shown}  [production, preview, development]`);
  }
  console.log("\n✅ Env vars set on Vercel. They apply to the NEXT build only.");
  console.log("   → Trigger a redeploy (this script's caller pushes an empty commit, or use the dashboard).");
})().catch(e => { console.error(`\n❌ ${e.message}`); process.exit(1); });
