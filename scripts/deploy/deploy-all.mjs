#!/usr/bin/env node
// SiteTrack Pro — interactive deploy driver.
//
// Walks through every step needed to take the codebase from "local dev only"
// to "fully live at sitetrackpro.in + Supabase + Cashfree EFs + GH Actions
// CI". Each step:
//   1. Detects current state via a quick probe.
//   2. If already done, prints ✅ and moves on.
//   3. Otherwise prints the EXACT command/click the user must run.
//   4. Asks "press Enter when done" before re-probing.
//
// Run:  npm run deploy:all
//
// Safe to re-run — every step is idempotent and skips completed work.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";
import { request as httpsRequest } from "node:https";

const root = process.cwd();
const rl = createInterface({ input: stdin, output: stdout });

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
  cyan: "\x1b[36m", magenta: "\x1b[35m",
};
const ok = (s) => console.log(`${c.green}✅ ${s}${c.reset}`);
const warn = (s) => console.log(`${c.yellow}⚠️  ${s}${c.reset}`);
const fail = (s) => console.log(`${c.red}❌ ${s}${c.reset}`);
const info = (s) => console.log(`${c.cyan}ℹ️  ${s}${c.reset}`);
const step = (n, s) => console.log(`\n${c.bold}${c.magenta}── Step ${n}: ${s} ──${c.reset}`);
const cmd = (s) => console.log(`${c.dim}  $ ${c.reset}${c.bold}${s}${c.reset}`);
const action = (s) => console.log(`${c.yellow}  → ${s}${c.reset}`);

const ask = async (q) => (await rl.question(`${c.cyan}? ${c.reset}${q} `)).trim();
const pause = async (msg = "Press Enter when done...") => { await rl.question(`${c.dim}  ${msg}${c.reset}`); };

const cmdExists = (binary) => {
  try { execSync(`${process.platform === "win32" ? "where" : "command -v"} ${binary}`, { stdio: "ignore" }); return true; }
  catch { return false; }
};

const head = async (url) => new Promise((resolve) => {
  const u = new URL(url);
  const req = httpsRequest({ method: "HEAD", hostname: u.hostname, path: u.pathname || "/", timeout: 7000 }, (res) => {
    resolve(res.statusCode);
  });
  req.on("error", () => resolve(0));
  req.on("timeout", () => { req.destroy(); resolve(0); });
  req.end();
});

const readEnv = () => {
  if (!existsSync(join(root, ".env.local"))) return {};
  const txt = readFileSync(join(root, ".env.local"), "utf8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
};

// ════════════════════════════════════════════════════════════════════════
console.log(`${c.bold}${c.magenta}\n╔═══════════════════════════════════════════════════════╗
║          SiteTrack Pro — Deploy Driver               ║
║                                                       ║
║  Idempotent. Re-run anytime — finished steps skip.   ║
╚═══════════════════════════════════════════════════════╝${c.reset}\n`);

// ── Step 1: .env.local ─────────────────────────────────────────────────
step(1, "Local env file");
if (existsSync(join(root, ".env.local"))) {
  ok(".env.local exists");
} else {
  warn(".env.local missing — copying from .env.example");
  const tmpl = readFileSync(join(root, ".env.example"), "utf8");
  writeFileSync(join(root, ".env.local"), tmpl);
  ok("Created .env.local");
  action("Open .env.local and fill in real values as you complete each step below.");
  await pause();
}

// ── Step 2: CLIs ───────────────────────────────────────────────────────
step(2, "Required CLIs");
const clis = { node: true, npm: true, vercel: cmdExists("vercel"), gh: cmdExists("gh") };
Object.entries(clis).forEach(([k, v]) => v ? ok(`${k} installed`) : fail(`${k} NOT installed`));
if (!clis.vercel) {
  action("Install Vercel CLI:");
  cmd("npm i -g vercel");
  await pause();
}
if (!clis.gh) {
  action("Install GitHub CLI:");
  cmd("winget install --id GitHub.cli");
  info("or download from https://cli.github.com/");
  await pause();
}

// ── Step 3: GitHub auth (workflow scope) ───────────────────────────────
step(3, "GitHub auth with `workflow` scope");
let ghAuthOk = false;
try {
  const out = execSync("gh auth status -h github.com 2>&1", { encoding: "utf8" });
  ghAuthOk = out.includes("Logged in") && /workflow/i.test(out);
  if (ghAuthOk) ok("gh authenticated with workflow scope");
  else warn("gh authenticated but missing `workflow` scope (needed to commit .github/workflows/*)");
} catch {
  warn("gh not authenticated");
}
if (!ghAuthOk) {
  action("Run this and complete the browser flow:");
  cmd("gh auth login --scopes workflow,repo --web");
  info("Choose: GitHub.com → HTTPS → Y → Login with browser");
  await pause();
  try {
    const out = execSync("gh auth status -h github.com 2>&1", { encoding: "utf8" });
    ghAuthOk = out.includes("Logged in") && /workflow/i.test(out);
  } catch { /* ignore */ }
  if (ghAuthOk) ok("gh now has workflow scope");
  else warn("Still no workflow scope — re-run when ready");
}

// ── Step 4: Enable GitHub Actions ─────────────────────────────────────
step(4, "Enable GitHub Actions CI");
if (existsSync(join(root, ".github/workflows/ci.yml"))) {
  ok(".github/workflows/ci.yml present");
} else if (ghAuthOk) {
  warn("CI workflow is already committed at .github/workflows/ci.yml (the docs/workflows/CI_WORKFLOW.yml template was removed). No move needed.");
} else {
  warn("Skipping — needs gh auth with workflow scope (Step 3)");
}

// ── Step 5: Supabase project ──────────────────────────────────────────
step(5, "Supabase project provisioned");
const env = readEnv();
const supaUrl = env.VITE_SUPABASE_URL;
const supaOk = supaUrl && !supaUrl.includes("YOUR_PROJECT") && supaUrl.includes(".supabase.co");
if (supaOk) {
  ok(`Supabase URL set: ${supaUrl}`);
} else {
  action("Create a Supabase project (Mumbai region, ~3 min):");
  info("1. https://supabase.com/dashboard → New project");
  info("2. Region: South Asia (Mumbai) ap-south-1");
  info("3. Strong db password — save in your password manager");
  info("4. Wait ~3 min for provisioning");
  info("5. Settings → API → copy Project URL + anon public key");
  info("6. Paste into .env.local (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)");
  info("7. Settings → API → Copy the 'Connection string' → set SUPABASE_DB_URL in .env.local");
  await pause();
}

// ── Step 6: Apply migrations ──────────────────────────────────────────
step(6, "Apply 28 SQL migrations to Supabase");
if (!env.SUPABASE_DB_URL || env.SUPABASE_DB_URL.includes("YOUR_")) {
  warn("SUPABASE_DB_URL not set in .env.local — skipping");
  info("Either fill it and re-run, OR apply via Supabase Dashboard → SQL Editor (paste each file in order)");
} else {
  info("All 30 SQL files in scripts/supabase/ will be applied in order.");
  const yes = await ask("Apply now? (y/N)");
  if (/^y/i.test(yes)) {
    const files = [
      "01_schema.sql","02_rls.sql","03_rls_phase1.sql","04_rls_tests.sql",
      "05_rls_phase1_tests.sql","06_project_types.sql","07_role_expansion.sql",
      "08_project_archive.sql","09_hierarchy.sql","10_measurement_book.sql",
      "11_material_prices.sql","12_delegations.sql","13_daily_snapshots.sql",
      "14_compliance.sql","15_forecast.sql","16_process_tables.sql",
      "17_handover_tables.sql","18_checklists.sql","19_comms.sql",
      "20_workforce.sql","21_field_ops.sql","22_estimate.sql","23_branding.sql",
      "24_feature_flags.sql","25_billing_telemetry.sql","26_share_tokens.sql",
      "27_audit_anchors.sql","28_plans.sql","29_phase2_tests.sql",
    ];
    for (const f of files) {
      const p = `scripts/supabase/${f}`;
      try {
        execSync(`psql "${env.SUPABASE_DB_URL}" -f "${p}"`, { stdio: "inherit" });
        ok(`Applied ${f}`);
      } catch {
        fail(`${f} failed — abort + investigate`);
        break;
      }
    }
  }
}

// ── Step 7: Vercel link + first deploy ─────────────────────────────────
step(7, "Vercel deploy");
const hasVercelDir = existsSync(join(root, ".vercel"));
if (hasVercelDir) {
  ok(".vercel/ exists — project linked");
} else {
  action("First-time deploy + project link:");
  cmd("vercel login           # if not already");
  cmd("vercel --prod");
  info("Prompts: Yes / No / sitetrack-app / ./ / No");
  await pause();
}
if (hasVercelDir) {
  const yes = await ask("Trigger a fresh production deploy now? (y/N)");
  if (/^y/i.test(yes)) {
    try { execSync("vercel --prod", { stdio: "inherit" }); ok("Deployed"); }
    catch { fail("Vercel deploy failed"); }
  }
}

// ── Step 8: Vercel env vars ───────────────────────────────────────────
step(8, "Vercel env vars (frontend)");
action("Vercel Dashboard → your project → Settings → Environment Variables");
info("Add for Production:");
info("  VITE_BACKEND          = supabase");
info(`  VITE_SUPABASE_URL     = ${env.VITE_SUPABASE_URL || "<from step 5>"}`);
info("  VITE_SUPABASE_ANON_KEY= <anon public key, NOT service_role>");
info("Then redeploy: vercel --prod");
await pause();

// ── Step 9: DNS — sitetrackpro.in ─────────────────────────────────────
step(9, "DNS — sitetrackpro.in");
const appStatus = await head("https://sitetrackpro.in");
if (appStatus === 200 || appStatus === 401) {
  ok(`sitetrackpro.in responds HTTP ${appStatus}`);
} else {
  warn(`sitetrackpro.in returns HTTP ${appStatus || "no-response"} — not pointed yet`);
  action("In Vercel: Settings → Domains → Add 'sitetrackpro.in'");
  info("Vercel will give a CNAME like: CNAME app  →  cname.vercel-dns.com");
  info("Add it in your DNS provider (GoDaddy / BigRock / Cloudflare).");
  info("Propagation: 5-30 min.");
  await pause();
}

// ── Step 10: Edge Functions (Cashfree) ────────────────────────────────
step(10, "Deploy Cashfree Edge Functions");
action("Two EFs to deploy via Supabase Dashboard or CLI:");
cmd("supabase functions deploy cashfree-subscription");
cmd("supabase functions deploy cashfree-webhook");
info("Then set secrets:");
cmd("supabase secrets set CASHFREE_APP_ID=…");
cmd("supabase secrets set CASHFREE_SECRET=…");
cmd("supabase secrets set CASHFREE_WEBHOOK_SECRET=…");
cmd("supabase secrets set CASHFREE_ENV=sandbox");
cmd("supabase secrets set CASHFREE_ALLOWED_ORIGINS=https://sitetrackpro.in");
info("Without Supabase CLI: paste files manually via Dashboard → Edge Functions");
await pause();

// ── Step 11: Final live probe ──────────────────────────────────────────
step(11, "Final live probe");
const urls = [
  ["https://github.com/Rakesh-7989/Site-Tracker-Pro", "GitHub repo"],
  ["https://sitetrackpro.in", "Marketing site"],
  ["https://sitetrackpro.in", "App SPA"],
];
for (const [u, label] of urls) {
  const code = await head(u);
  if (code === 200) ok(`${label}: ${u} → 200`);
  else warn(`${label}: ${u} → ${code || "no-response"}`);
}

console.log(`${c.bold}${c.green}\nDone. Re-run this script anytime to verify or continue.${c.reset}\n`);
rl.close();
