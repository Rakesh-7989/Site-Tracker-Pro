import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const checks = [];

const add = (name, pass, detail = "") => checks.push({ name, pass, detail });

// App markers now search App.jsx + feature modules + v3 router + key v3 views.
// The smoke contract is "this string lives somewhere in the user-facing app
// code", not "this string lives in App.jsx specifically".
const app = [
  read("src/App.jsx"),
  read("src/features/roadmap/index.jsx"),
  read("src/features/admin/index.jsx"),
  read("src/features/views/index.jsx"),
  read("src/features/detail/index.jsx"),
  read("src/features/shell/index.jsx"),
  read("src/features/org/index.jsx"),
  read("src/lib/exports.js"),
  read("src/app/router.tsx"),
  read("src/components/attachments.jsx"),
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
  "Impersonating",
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
  "PlatformBrandingView",
  "PlatformAuditLogV2View",
  "PlanGate",
  // Roadmap Batch 3 — kiosks + AR + snapshot panel + audit wiring
  "LabourKioskView",
  "SiteWallKioskView",
  "ARDrawingOverlayView",
  "DailySnapshotView",
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
  // Q6 / Q7 / Q8 toggles
  "demoLoaderEnabled",
  "kioskLabourEnabled",
  "kioskSiteEnabled",
  "kioskArEnabled",
  "tenantOnboardingMode",
  // Session 15 — Cashfree integration markers
  "isCashfreeConfigured",
  "buildSubscriptionRequest",
  "cashfreeReady",
  "pending_cashfree",
  "Cashfree connected",
  // Session 16 — feature-flag catalog system
  "OrgFeatureSettingsView",
  "FEATURE_CATALOG",
  "isFeatureEnabled",
  "Feature toggles",
  "Platform-wide kill switches",
  "Feature \"",                    // recordAudit message prefix for toggle changes
  "features enabled for this role", // LoginScreen hint
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
  "docs/TESTING_STRATEGY.md",
  "docs/BUG_WORKFLOW.md",
  ".agents/sitetrack-pro/bugs.md",
  "tests/bugs/.gitkeep",
  "scripts/test-ef-harness.mjs",
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
  // Session 15 — Production gate (RLS + Cashfree)
  "src/lib/cashfree.js",
  "tests/cashfree.test.js",
  "scripts/supabase/03_rls_phase1.sql",
  "scripts/supabase/05_rls_phase1_tests.sql",
  "docs/PRODUCTION_RLS.md",
  "docs/CASHFREE_ONBOARDING.md",
  // Session 16 — Feature-flag catalog system
  "src/lib/orgFeatureFlags.js",
  "tests/orgFeatureFlags.test.js",
  // Session 17 — Live database connection runbook + check script
  "scripts/check-supabase-connection.mjs",
  "docs/CONNECT_SUPABASE.md",
  // Session 18 — Activation pack (onboarding + sales assets)
  "public/landing.html",
  "docs/DEMO_VIDEO_SCRIPT.md",
  "docs/CASE_STUDY_TEMPLATE.md",
  "docs/WHATSAPP_BUSINESS_API.md",
  "docs/pitch/build-deck.mjs",
  "docs/pitch/SiteTrack-Pitch-Deck.pptx",
  // Session 19 — HRMS deployment study + marketing/app deploy split
  "docs/HRMS_DEPLOYMENT_STUDY.md",
  "docs/DEPLOY_NOW.md",
  "marketing/index.html",
  "marketing/vercel.json",
  "marketing/README.md",
  "scripts/setup.mjs",
  // Session 21 — bug hunt: top-level ErrorBoundary so a single bad chunk
  // can no longer render the whole app as a white screen.
  "src/components/errorBoundary.jsx",
  // Session 22 — major changes pack
  "supabase/functions/_shared/cashfree.ts",
  "supabase/functions/cashfree-subscription/index.ts",
  "supabase/functions/cashfree-webhook/index.ts",
  "supabase/functions/README.md",
  "src/lib/blockchainAnchor.js",
  "tests/blockchainAnchor.test.js",
  "src/lib/reraTelangana.js",
  "tests/reraTelangana.test.js",
  "docs/PLAY_STORE_PREP.md",
  // Session 23 — v2 role model implementation (Phases A-E)
  "docs/ROLE_MODEL_V2.md",
  "scripts/supabase/06_project_types.sql",
  "scripts/supabase/07_role_expansion.sql",
  "src/lib/projectTypes.js",
  "tests/projectTypes.test.js",
  "src/lib/contractors.js",
  "tests/contractors.test.js",
  // Session 24 — comparison + adversarial fixes
  "docs/COMPETITOR_COMPARISON_V2.md",
  // Session 25 — sales-blocking miss fixes (BOQ import + bulk member + PDF audit + archive)
  "src/lib/boqImport.js",
  "tests/boqImport.test.js",
  "src/lib/projectArchive.js",
  "tests/projectArchive.test.js",
  "scripts/supabase/08_project_archive.sql",
  // Session 20 — MCP toolkit (Supabase + GitHub + Postgres + Playwright)
  ".mcp.json",
  ".env.mcp.example",
  "scripts/check-mcp.mjs",
  "docs/MCP_TOOLKIT.md",
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
add("test:ef script exists", pkg.scripts?.["test:ef"] === "node scripts/test-ef-harness.mjs");
add("test:rls script exists", pkg.scripts?.["test:rls"] === "node scripts/test-self-service-rls.mjs");
add("check:supabase script exists", pkg.scripts?.["check:supabase"] === "node scripts/check-supabase-connection.mjs");
add("setup script exists", pkg.scripts?.setup === "node scripts/setup.mjs");
add("check:mcp script exists", pkg.scripts?.["check:mcp"] === "node scripts/check-mcp.mjs");
// .mcp.json must stay secret-free — only ${VAR} references, never literal tokens.
const mcpRaw = read(".mcp.json");
add(".mcp.json contains no literal Supabase PAT", !/sbp_[A-Za-z0-9]/.test(mcpRaw));
add(".mcp.json contains no literal GitHub PAT", !/github_pat_[A-Za-z0-9]/.test(mcpRaw));
add(".mcp.json uses env-var references", mcpRaw.includes("${SUPABASE_ACCESS_TOKEN}") && mcpRaw.includes("${GITHUB_PERSONAL_ACCESS_TOKEN}"));
add("Vite manual chunks configured", vite.includes("manualChunks") && vite.includes("charts"));

// ── Sprint 1 freeze parity (Session 30.2) ──────────────────────────────────
// The JS source of truth (src/lib/featureFlags.js#STUB_VIEWS) and the SQL
// audit table (scripts/supabase/49_feature_flags_freeze.sql staff_only_features
// seed inserts) must list the same view ids. If they drift, ops would think
// a view is frozen when the runtime still serves it (or vice versa). Lint-
// level parity check below catches the drift before deploy.
{
  const flagsJs = read("src/lib/featureFlags.js");
  const freezeSql = read("scripts/supabase/49_feature_flags_freeze.sql");

  // Extract STUB_VIEWS literal entries: matches the strings inside the Set
  // constructor body. The literal block is delimited by `STUB_VIEWS = new Set([`
  // and the matching `]);`.
  const stubBlock = flagsJs.match(/STUB_VIEWS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/);
  const jsViews = stubBlock ? [...stubBlock[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]) : [];

  // Extract view_id values from the seed INSERT (each row starts with a
  // single-quoted view_id token at the start of the row).
  const sqlSection = freezeSql.split("insert into staff_only_features")[1] || "";
  const insertBlock = (sqlSection.split(" values")[1] || "").split("on conflict")[0] || "";
  const sqlViews = [...insertBlock.matchAll(/^\s*\(\s*'([a-z0-9-]+)'/gm)].map(m => m[1]);

  const jsSet = new Set(jsViews);
  const sqlSet = new Set(sqlViews);
  const jsMinusSql = jsViews.filter(v => !sqlSet.has(v));
  const sqlMinusJs = sqlViews.filter(v => !jsSet.has(v));

  add(
    "STUB_VIEWS parity — same count in JS and SQL",
    jsViews.length === sqlViews.length,
    `JS=${jsViews.length} SQL=${sqlViews.length}`,
  );
  add(
    "STUB_VIEWS parity — JS subset of SQL",
    jsMinusSql.length === 0,
    jsMinusSql.length ? `missing from SQL: ${jsMinusSql.join(",")}` : "",
  );
  add(
    "STUB_VIEWS parity — SQL subset of JS",
    sqlMinusJs.length === 0,
    sqlMinusJs.length ? `missing from JS: ${sqlMinusJs.join(",")}` : "",
  );
  add(
    "Sprint 1 freeze docs present",
    existsSync(join(root, "docs/FEATURE_FREEZE.md"))
      && existsSync(join(root, "docs/POSITIONING.md"))
      && existsSync(join(root, "docs/SITETRACK_V3_PLAN.md")),
  );
}

const failures = checks.filter(c => !c.pass);
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` - ${c.detail}` : ""}`);
}

if (failures.length) {
  console.error(`\nSmoke failed: ${failures.length} check(s) did not pass.`);
  process.exit(1);
}

console.log(`\nSmoke passed: ${checks.length} checks.`);
