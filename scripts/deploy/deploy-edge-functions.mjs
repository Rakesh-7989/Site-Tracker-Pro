#!/usr/bin/env node
// SiteTrack Pro — Deploy all SiteTrack Edge Functions to Supabase.
//
// Wraps `supabase functions deploy` so the founder runs ONE command to
// push every EF in supabase/functions/ to the project.
//
// Usage:
//   node scripts/deploy-edge-functions.mjs              # deploy all
//   node scripts/deploy-edge-functions.mjs whatsapp_dpr_send  # deploy one
//   node scripts/deploy-edge-functions.mjs --dry-run    # print would-deploy
//
// Prerequisites: supabase CLI installed + `supabase login` completed.

import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const PROJECT_REF = "nntkxojdeyziemdhyjvg";

const root = process.cwd();
const funcsDir = join(root, "supabase", "functions");

if (!existsSync(funcsDir)) {
  console.error("❌ supabase/functions/ directory missing");
  process.exit(1);
}

// Discover all EFs — directories with index.ts, excluding _shared
const allFunctions = readdirSync(funcsDir)
  .filter(f => !f.startsWith("_") && !f.startsWith("."))
  .filter(f => statSync(join(funcsDir, f)).isDirectory())
  .filter(f => existsSync(join(funcsDir, f, "index.ts")));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targets = args.filter(a => !a.startsWith("--"));

const toDeploy = targets.length > 0
  ? targets.filter(t => allFunctions.includes(t))
  : allFunctions;

if (targets.length > 0) {
  const unknown = targets.filter(t => !allFunctions.includes(t));
  if (unknown.length) {
    console.error(`⚠️  Unknown functions: ${unknown.join(", ")}`);
    console.error(`Available: ${allFunctions.join(", ")}`);
    process.exit(1);
  }
}

if (toDeploy.length === 0) {
  console.log("ℹ️  Nothing to deploy.");
  process.exit(0);
}

console.log(`🚀 ${dryRun ? "[DRY RUN] " : ""}Deploying ${toDeploy.length} of ${allFunctions.length} Edge Functions to ${PROJECT_REF}…`);
console.log("");

let success = 0, failed = 0;
const failures = [];

for (const fn of toDeploy) {
  const cmd = `npx supabase functions deploy ${fn} --project-ref ${PROJECT_REF}`;
  if (dryRun) {
    console.log(`  Would deploy: ${fn}`);
    console.log(`    cmd: ${cmd}`);
    continue;
  }
  try {
    console.log(`  📤 Deploying ${fn}…`);
    execSync(cmd, { stdio: ["inherit", "pipe", "pipe"] });
    success++;
    console.log(`     ✅ ${fn}`);
  } catch (e) {
    failed++;
    failures.push({ fn, err: e.message.slice(0, 200) });
    console.log(`     ❌ ${fn}: ${e.message.slice(0, 100)}`);
  }
}

console.log("");
if (dryRun) {
  console.log(`📊 Dry run: ${toDeploy.length} functions ready to deploy.`);
  process.exit(0);
}
console.log(`📊 ${success} succeeded · ${failed} failed (of ${toDeploy.length})`);

if (failures.length) {
  console.log("");
  console.log("📖 Failure detail:");
  for (const f of failures) {
    console.log(`  • ${f.fn}: ${f.err}`);
  }
  console.log("");
  console.log("Common fixes:");
  console.log("  · Run `node scripts/check-env-config.mjs` to surface missing env vars");
  console.log("  · Run `node scripts/sync-function-secrets.mjs` to push secrets first");
  console.log("  · Make sure `supabase login` was completed");
  process.exit(1);
}

console.log("");
console.log("Once deployed, verify with:");
console.log("  curl -X POST https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/<function_name>");
process.exit(0);
