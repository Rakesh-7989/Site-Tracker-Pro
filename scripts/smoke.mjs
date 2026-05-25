import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const checks = [];

const add = (name, pass, detail = "") => checks.push({ name, pass, detail });

// App markers now search BOTH App.jsx and the extracted feature modules
// (Batch 4 + Batch 5 moved a lot of code out of App.jsx). The smoke contract
// is "this string lives somewhere in the user-facing app code", not "this
// string lives in App.jsx specifically".
const app = [
  read("src/App.jsx"),
  read("src/features/roadmap/index.jsx"),
  read("src/features/admin/index.jsx"),
  read("src/features/views/index.jsx"),
  read("src/features/detail/index.jsx"),
  read("src/features/shell/index.jsx"),
  read("src/features/org/index.jsx"),
  read("src/lib/exports.js"),
].join("\n");
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
  // Tech Lead Review fixes
  "notifsForUser",
  "resolveAttachmentUrl",
  "safePhotoSrc",
  "csvRow",
  // Roadmap Batch 2 views wired into App.jsx
  "HierarchyView",
  "MaterialPricesView",
  "ComplianceView",
  "ForecastView",
  "DelegationsView",
  "BrandingSettingsView",
  "AuditLogV2View",
  "PlanGate",
  "INIT_BLOCKS",
  "INIT_FLOORS",
  "INIT_UNITS",
  "INIT_BRANDING",
  "INIT_AUDIT_LOG",
  "INIT_DELEGATIONS",
  "INIT_DAILY_SNAPSHOTS",
  "INIT_MATERIAL_PRICES",
  "INIT_COMPLIANCE",
  "INIT_FORECAST",
  "case\"hierarchy\"",
  "case\"material-prices\"",
  "case\"compliance\"",
  "case\"forecast\"",
  "case\"delegations\"",
  "case\"admin-branding\"",
  "case\"admin-audit-log\"",
  // Roadmap Batch 3 — kiosks + AR + snapshot panel + audit wiring
  "LabourAttendanceKioskView",
  "SiteWallKioskView",
  "ARDrawingOverlayView",
  "DailySnapshotPanelView",
  "case\"kiosk-labour\"",
  "case\"kiosk-site\"",
  "case\"ar-overlay\"",
  "case\"snapshot\"",
  "recordAudit(p,{actor:user,action:\"IMPERSONATE\"",
  "recordAudit(p,{actor:user,action:\"CREATE\",resource:\"project\"",
  // ── Production Phase 1 — Org Admin tier markers ──────────────────────────
  "OrgAdminDashboard",
  "OrgMembersView",
  "OrgBillingView",
  "OrgIntegrationsView",
  "OrgActivityView",
  "OrgTemplatesView",
  "OrgApprovalChainsView",
  "OrgNotificationRulesView",
  "orgadmin",
  "case\"org-dashboard\"",
  "case\"org-members\"",
  "case\"org-billing\"",
  "case\"org-integrations\"",
  "case\"org-activity\"",
  "case\"org-templates\"",
  "case\"org-approvals\"",
  "case\"org-notifications\"",
  "INIT_APPROVAL_CHAINS",
  "INIT_ORG_INTEGRATIONS",
  "INIT_TEMPLATES",
  "INIT_NOTIFICATION_RULES",
  "INIT_OPS_TOGGLES",
  // Q5a: additional audit wirings
  "action:\"RELEASE\",resource:\"drawing\"",
  "action:\"APPROVE\",resource:\"rfi\"",
  "action:\"APPROVE\",resource:\"po\"",
  "action:\"PAYMENT\",resource:\"ra_bill\"",
  "resource:\"change_order\"",
  "resource:\"milestone\"",
  "resource:\"expense\"",
  "resource:\"support_ticket\"",
  "resource:\"subscription\"",
  // Q5d: lazy chunk for detail + org
  "lazy(() => import(\"./features/detail/index.jsx\")",
  "lazy(() => import(\"./features/org/index.jsx\")",
  // Q6 / Q7 / Q8 toggles
  "demoLoaderEnabled",
  "kioskLabourEnabled",
  "kioskSiteEnabled",
  "kioskArEnabled",
  "tenantOnboardingMode",
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
  // System design doc
  "docs/SYSTEM_DESIGN.md",
  // Tech Lead Review fixes (HIGH-1, HIGH-2, MED-3, MED-4, LOW-5)
  "src/lib/escape.js",
  "src/lib/notifications.js",
  "src/lib/format.js",
  "tests/escape.test.js",
  "tests/notifications.test.js",
  "tests/format.test.js",
  // Deep review pack
  "src/data/seed.js",
  "src/data/lookups.js",
  "playwright.config.js",
  "tests/e2e/roles.spec.js",
  // Roadmap Batch 1 — foundation libs + tests
  "src/lib/hierarchy.js",
  "src/lib/audit.js",
  "src/lib/delegations.js",
  "src/lib/branding.js",
  "src/lib/materialPrices.js",
  "src/lib/compliance.js",
  "src/lib/planGating.js",
  "src/lib/dailySnapshot.js",
  "src/lib/aiForecast.js",
  "tests/hierarchy.test.js",
  "tests/audit.test.js",
  "tests/delegations.test.js",
  "tests/branding.test.js",
  "tests/planGating.test.js",
  "tests/compliance.test.js",
  // Roadmap Batch 3 — new lib + docs
  "src/lib/whatsapp.js",
  // Roadmap Batch 4 — App.jsx split (ui atoms + features/)
  "src/components/ui.jsx",
  "src/features/roadmap/index.jsx",
  // Roadmap Batch 5 — admin cluster extracted
  "src/features/admin/index.jsx",
  // Roadmap Batch 6 — mid-size views extracted + i18n helper module
  "src/features/views/index.jsx",
  "src/lib/i18n.js",
  "tests/whatsapp.test.js",
  // Roadmap Batch 7 — attachment atoms + detail satellites extracted
  "src/components/attachments.jsx",
  "src/features/detail/index.jsx",
  // Roadmap Batch 8 — export helpers extracted
  "src/lib/exports.js",
  // Roadmap Batch 10 — shell cluster extracted
  "src/features/shell/index.jsx",
  // Production Phase 1 — Org Admin tier
  "src/features/org/index.jsx",
  "src/lib/approvalChains.js",
  "src/lib/orgIntegrations.js",
  "src/lib/templates.js",
  "tests/approvalChains.test.js",
  "tests/orgIntegrations.test.js",
  "tests/templates.test.js",
  ".brain/decisions/0001-empty-default-with-opt-in-demo.md",
  ".brain/decisions/0002-foundation-libs-pure-functions.md",
  ".brain/decisions/0003-hierarchical-project-model.md",
  ".brain/decisions/0004-immutable-audit-log.md",
  ".brain/decisions/0005-kiosks-as-killer-wedge.md",
  "PRODUCTION_CHECKLIST.md",
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
