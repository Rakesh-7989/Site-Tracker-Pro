import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const checks = [];

const add = (name, pass, detail = "") => checks.push({ name, pass, detail });

const app = read("src/App.jsx");
const pkg = JSON.parse(read("package.json"));
const vite = read("vite.config.js");

[
  "contractor",
  "FieldOpsTab",
  "ApprovalsTab",
  "MapTab",
  "AIInsightsTab",
  "MessagesView",
  "QuickCaptureDrawer",
  "Today's Entry",
  "canAccessProject",
  "visibleProjectsForUser",
  "drawingKey",
  "isReleasedCurrentDrawing",
  "superseded_by",
  "Contractor Current",
].forEach(marker => add(`App marker: ${marker}`, app.includes(marker)));

[
  "AgentsView",
  "INIT_AGENT_RUNS",
  "agentRuns",
  "AI Agents",
].forEach(marker => add(`No in-app agent marker: ${marker}`, !app.includes(marker)));

[
  "docs/AGENTS.md",
  "docs/WORKFLOW.md",
  "docs/BACKLOG.md",
  "docs/QUALITY.md",
  "docs/MARKET_ANALYSIS.md",
  "docs/BUSINESS_MODEL.md",
  "docs/PRICING.md",
  "docs/DEPLOYMENT.md",
  ".agents/sitetrack-pro/README.md",
  ".agents/sitetrack-pro/team-lead.md",
  ".agents/sitetrack-pro/product-manager.md",
  ".agents/sitetrack-pro/construction-domain-analyst.md",
  ".agents/sitetrack-pro/ux-ui-designer.md",
  ".agents/sitetrack-pro/frontend-engineer.md",
  ".agents/sitetrack-pro/backend-engineer.md",
  ".agents/sitetrack-pro/qa-test.md",
  ".agents/sitetrack-pro/security-permissions.md",
  ".agents/sitetrack-pro/devops-release.md",
  ".agents/sitetrack-pro/documentation.md",
  ".agents/sitetrack-pro/data-ai-insights.md",
  ".agents/sitetrack-pro/work-board.md",
  ".agents/sitetrack-pro/handoff-template.md",
  "vercel.json",
  "netlify.toml",
].forEach(path => add(`Required file: ${path}`, existsSync(join(root, path))));

add("Build script exists", pkg.scripts?.build === "vite build");
add("Smoke script exists", pkg.scripts?.smoke === "node scripts/smoke.mjs");
add("Vite manual chunks configured", vite.includes("manualChunks") && vite.includes("charts"));

const failures = checks.filter(c => !c.pass);
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` - ${c.detail}` : ""}`);
}

if (failures.length) {
  console.error(`\nSmoke failed: ${failures.length} check(s) did not pass.`);
  process.exit(1);
}

console.log(`\nSmoke passed: ${checks.length} checks.`);
