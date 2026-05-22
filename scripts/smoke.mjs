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
  // New: BOQ + Inventory ledger + Estimate
  "BOQTab",
  "LedgerTab",
  "EstimateTab",
  "INIT_BOQ",
  "INIT_LEDGER",
  "INIT_ESTIMATE",
  "Bill of Quantities",
  "Stock Ledger",
  "Project Estimate",
  // New: photo metadata capture
  "captured_at",
  "navigator.geolocation",
  // Weakness pack
  "buildDPR",
  "exportDPR",
  "Daily Site Report",
  "MarkupModal",
  "saveDrawingMarkup",
  "Measurement Book",
  "recomputeFromMB",
  "signature",
  "Electronic signature",
  "computeRiskScore",
  "fetchLLMInsight",
  "buildUpiDeepLink",
  "queueOpAdd",
  // Super Admin role
  "superadmin",
  "SuperAdminDashboard",
  "OrgsAdminView",
  "UsersAdminView",
  "BillingAdminView",
  "SettingsAdminView",
  "INIT_ORGS",
  "INIT_ADMIN_USERS",
  "PLAN_META",
  "Admin Console",
  "Customer Organizations",
  "Billing & MRR",
  "System Settings",
  // Live activation
  "isSupabaseEnabled",
  "signInWithMagicLink",
  "migrateLocalToBackend",
  "subscribeTable",
  "Magic link",
  // More admin features
  "AuditAdminView",
  "UsageAdminView",
  "SupportAdminView",
  "INIT_SUPPORT",
  "Impersonating",
  "startImpersonate",
  "Audit Log",
  "Usage Analytics",
].forEach(marker => add(`App marker: ${marker}`, app.includes(marker)));

[
  "AgentsView",
  "INIT_AGENT_RUNS",
  "agentRuns",
  "AI Agents",
].forEach(marker => add(`No in-app agent marker: ${marker}`, !app.includes(marker)));

// PERMS source-of-truth check: App.jsx must NOT redefine PERMS (drift risk)
add("App.jsx imports PERMS from lib", app.includes('from "./lib/permissions.js"'));
add("App.jsx has no local PERMS definition", !/^const PERMS = \{/m.test(app));

[
  "docs/AGENTS.md",
  "docs/WORKFLOW.md",
  "docs/BACKLOG.md",
  "docs/QUALITY.md",
  "docs/MARKET_ANALYSIS.md",
  "docs/BUSINESS_MODEL.md",
  "docs/PRICING.md",
  "docs/DEPLOYMENT.md",
  "docs/BACKEND_PLAN.md",
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
  "docs/CI_WORKFLOW.yml",
  // Tech Lead review additions (2026-05-22 evening)
  "src/lib/permissions.js",
  "tests/permissions.test.js",
  "vitest.config.js",
  "scripts/supabase/01_schema.sql",
  "scripts/supabase/02_rls.sql",
  "scripts/supabase/04_rls_tests.sql",
  "scripts/supabase/README.md",
  "CHANGELOG.md",
  // Tech Lead gate #4: ESLint + Prettier
  "eslint.config.js",
  ".prettierrc.json",
  ".prettierignore",
  // Weakness pack
  "src/lib/offline.js",
  "src/lib/ai.js",
  "src/lib/razorpay.js",
  "src/lib/supabase.js",
  "capacitor.config.json",
  "docs/MOBILE_BUILD.md",
  ".env.example",
  // Live activation
  "src/lib/usePersistent.js",
  "docs/GOLIVE.md",
  "scripts/provision.sh",
].forEach(path => add(`Required file: ${path}`, existsSync(join(root, path))));

// CI workflow must run real lint, not the placeholder
const ci = read("docs/CI_WORKFLOW.yml");
add("CI workflow runs real ESLint (no placeholder)", ci.includes("npm run lint") && !ci.includes("placeholder"));

// Dead-code cleanup: these paths must NOT exist
[
  "_incoming_sitetrack_pro",
  "sitetrack (1).jsx",
].forEach(path => add(`Cleaned up: ${path}`, !existsSync(join(root, path))));

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
