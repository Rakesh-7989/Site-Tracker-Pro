#!/usr/bin/env node
// SiteTrack Pro — interactive setup bootstrap.
//
// Adapted from the HRMS `backend/scripts/setup.js` pattern (see
// docs/HRMS_DEPLOYMENT_STUDY.md), but targeted at SiteTrack's Supabase
// stack instead of a self-hosted Express + AWS RDS server.
//
// Run:  npm run setup
//
// What it does (all idempotent, all skippable):
//   1. Check prerequisites (node, npm versions)
//   2. npm install if node_modules is missing
//   3. Copy .env.example → .env.local if it doesn't exist, then pause so
//      you can paste your Supabase URL + anon key
//   4. Offer to run the Supabase connection check
//   5. Print the next-step deploy commands

import { execSync } from "node:child_process";
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const root = process.cwd();
const C = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", amber: "\x1b[33m", red: "\x1b[31m", dim: "\x1b[2m", cyan: "\x1b[36m" };
const ok = (m) => console.log(`${C.green}✓${C.reset} ${m}`);
const warn = (m) => console.log(`${C.amber}!${C.reset} ${m}`);
const err = (m) => console.log(`${C.red}✗${C.reset} ${m}`);
const head = (m) => console.log(`\n${C.bold}${C.cyan}${m}${C.reset}`);

function run(cmd, silent = true) {
  try { execSync(cmd, { stdio: silent ? "pipe" : "inherit" }); return true; }
  catch { return false; }
}
function out(cmd) {
  try { return execSync(cmd, { stdio: "pipe" }).toString().trim(); }
  catch { return ""; }
}
function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); resolve(a.trim()); }));
}

console.log(`\n${C.bold}SiteTrack Pro — setup${C.reset}`);
console.log(`${C.dim}Adapted from the HRMS setup pattern, targeted at Supabase.${C.reset}`);

// ── 1. Prerequisites ────────────────────────────────────────────────────────
head("[1/5] Checking prerequisites");
const nodeV = out("node --version");
if (!nodeV) { err("Node.js not found. Install from https://nodejs.org/ (v18+)."); process.exit(1); }
const major = parseInt(nodeV.replace(/^v/, "").split(".")[0], 10);
if (major < 18) { err(`Node ${nodeV} is too old — SiteTrack needs v18+ (fetch API).`); process.exit(1); }
ok(`Node.js ${nodeV}`);
if (!out("npm --version")) { err("npm not found."); process.exit(1); }
ok(`npm ${out("npm --version")}`);

// ── 2. Dependencies ──────────────────────────────────────────────────────────
head("[2/5] Dependencies");
if (existsSync(`${root}/node_modules/vite`)) {
  ok("node_modules present (vite found)");
} else {
  warn("node_modules missing — running npm install…");
  if (!run("npm install", false)) { err("npm install failed."); process.exit(1); }
  ok("Dependencies installed");
}

// ── 3. Environment ────────────────────────────────────────────────────────────
head("[3/5] Environment");
const envLocal = `${root}/.env.local`;
const envExample = `${root}/.env.example`;
if (existsSync(envLocal)) {
  ok(".env.local present");
  const raw = readFileSync(envLocal, "utf8");
  const backend = /VITE_BACKEND\s*=\s*supabase/.test(raw);
  if (backend) ok("VITE_BACKEND=supabase configured");
  else warn("VITE_BACKEND is not 'supabase' — app will run in localStorage demo mode");
} else if (existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
  ok(".env.local created from .env.example");
  console.log(`\n  ${C.bold}Now edit .env.local${C.reset} and set:`);
  console.log(`    ${C.cyan}VITE_BACKEND=supabase${C.reset}`);
  console.log(`    ${C.cyan}VITE_SUPABASE_URL=https://<your-project>.supabase.co${C.reset}`);
  console.log(`    ${C.cyan}VITE_SUPABASE_ANON_KEY=<your anon public key>${C.reset}`);
  console.log(`\n  ${C.dim}See docs/CONNECT_SUPABASE.md for where to find each value.${C.reset}`);
  console.log(`  ${C.dim}Leave it as VITE_BACKEND=local to keep the localStorage demo.${C.reset}\n`);
  await ask(`  Press ENTER when you've finished editing .env.local (or to skip)… `);
} else {
  warn(".env.example not found — skipping env setup. App will run in demo mode.");
}

// ── 4. Connection check ───────────────────────────────────────────────────────
head("[4/5] Backend connection");
const raw = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : "";
if (/VITE_BACKEND\s*=\s*supabase/.test(raw)) {
  const doCheck = (await ask(`  Run the Supabase connection check now? [Y/n] `)).toLowerCase();
  if (doCheck === "" || doCheck === "y" || doCheck === "yes") {
    run("node scripts/check-supabase-connection.mjs", false);
  } else {
    warn("Skipped. Run it anytime with: npm run check:supabase");
  }
} else {
  ok("Running in localStorage demo mode — no backend connection needed.");
  console.log(`  ${C.dim}To connect a real database later, follow docs/CONNECT_SUPABASE.md.${C.reset}`);
}

// ── 5. Next steps ─────────────────────────────────────────────────────────────
head("[5/5] You're set up. Next steps:");
console.log(`
  ${C.bold}Local development${C.reset}
    npm run dev              ${C.dim}# app at http://localhost:5173${C.reset}

  ${C.bold}Verify everything${C.reset}
    npm test                 ${C.dim}# lint + build + smoke + unit tests${C.reset}
    npm run check:supabase   ${C.dim}# verify the database connection${C.reset}

  ${C.bold}Deploy (see docs/DEPLOY_NOW.md)${C.reset}
    Marketing site → sitetrack.in       ${C.dim}# cd marketing && vercel --prod${C.reset}
    App            → app.sitetrack.in   ${C.dim}# vercel --prod (from repo root)${C.reset}

  ${C.green}${C.bold}Done.${C.reset} Open the app with: ${C.cyan}npm run dev${C.reset}
`);
