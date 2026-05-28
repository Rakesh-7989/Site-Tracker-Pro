#!/usr/bin/env node
// SiteTrack Pro — MCP setup checker.
//
// Run:  npm run check:mcp
//
// Validates that .mcp.json is well-formed and that the env vars it references
// are actually set in the current shell. Prints PASS/FAIL per server so you
// know what's ready before launching Claude Code.
//
// Does NOT print token values — only whether they're present.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const results = [];
const add = (name, pass, detail = "") => results.push({ name, pass, detail });

console.log("\nSiteTrack MCP setup check\n==========================\n");

// 1. .mcp.json exists + parses
const mcpPath = join(root, ".mcp.json");
if (!existsSync(mcpPath)) {
  console.error("FAIL  .mcp.json not found at project root.");
  process.exit(1);
}
let config;
try {
  config = JSON.parse(readFileSync(mcpPath, "utf8"));
  add(".mcp.json parses as valid JSON", true);
} catch (e) {
  add(".mcp.json parses as valid JSON", false, e.message);
  printAndExit();
}

const servers = config.mcpServers || {};
const serverNames = Object.keys(servers);
add(`.mcp.json declares ${serverNames.length} server(s)`, serverNames.length > 0, serverNames.join(", "));

// 2. Collect every ${VAR} referenced across args + env
const VAR_RE = /\$\{([A-Z0-9_]+)\}/g;
const referenced = new Map(); // varName -> [serverNames]
for (const [name, def] of Object.entries(servers)) {
  const blob = JSON.stringify(def);
  let m;
  while ((m = VAR_RE.exec(blob)) !== null) {
    const v = m[1];
    if (!referenced.has(v)) referenced.set(v, []);
    if (!referenced.get(v).includes(name)) referenced.get(v).push(name);
  }
}

// 3. Check each referenced var is set in the environment
console.log("");
for (const [varName, usedBy] of referenced) {
  const present = !!process.env[varName] && process.env[varName].trim().length > 0;
  add(`env ${varName} set (used by: ${usedBy.join(", ")})`, present,
      present ? "present" : `MISSING — set it in .env.mcp and: set -a; source .env.mcp; set +a`);
}

// 4. Per-server readiness summary
console.log("");
for (const [name, def] of Object.entries(servers)) {
  const blob = JSON.stringify(def);
  const vars = [...blob.matchAll(VAR_RE)].map(m => m[1]);
  const allSet = vars.every(v => process.env[v] && process.env[v].trim().length > 0);
  add(`server "${name}" ready`, allSet || vars.length === 0,
      vars.length === 0 ? "no env vars needed" : allSet ? "all vars set" : `waiting on: ${vars.filter(v => !process.env[v]).join(", ")}`);
}

printAndExit();

function printAndExit() {
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  const failed = results.filter(r => !r.pass).length;
  if (failed) {
    console.error(`\n${failed} check(s) not ready. Fill .env.mcp + source it, then re-run.`);
    console.error("See docs/MCP_TOOLKIT.md for the full setup walkthrough.\n");
    process.exit(1);
  }
  console.log("\nAll MCP servers are configured + their tokens are present.");
  console.log("Restart Claude Code to load them. Verify with: /mcp\n");
}
