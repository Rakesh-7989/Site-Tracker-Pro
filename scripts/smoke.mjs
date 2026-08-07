import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const checks = [];

const add = (name, pass, detail = "") => checks.push({ name, pass, detail });

// App markers now search v3 app + feature modules + key views.
const app = [
  read("src/app/AppV3.tsx"),
  read("src/app/router.tsx"),
  read("src/plugins/catalog.ts"),
  read("src/features/shell/ShellLayout.tsx"),
  read("src/features/shell/TopBar.tsx"),
  read("src/features/shell/Sidebar.tsx"),
  read("src/features/shell/GlobalSearch.tsx"),
  read("src/features/admin/ImpersonationBanner.tsx"),
  read("src/features/admin/ImpersonationContext.tsx"),
  read("src/lib/useConnectionStatus.ts"),
  read("src/features/project/DetailView.tsx"),
  read("src/lib/supabase.ts"),
  read("src/lib/notifications.ts"),
  read("src/lib/ai.ts"),
  read("src/lib/offline.ts"),
  read("src/lib/cashfree.ts"),
  read("src/lib/razorpay.ts"),
  read("src/lib/orgFeatureFlags.ts"),
  read("src/lib/audit.ts"),
  read("src/lib/escape.ts"),
  read("src/lib/genericCsv.ts"),
  read("src/lib/contractors.ts"),
  read("src/data/seed.ts"),
  read("src/auth/PlanGate.tsx"),
  read("src/features/auth/LoginScreenV3.tsx"),
  read("src/features/admin/PlatformBillingView.tsx"),
  read("src/features/admin/PlatformSettingsView.tsx"),
  read("src/features/admin/PlatformUsageView.tsx"),
  read("src/features/org/OrgFeaturesView.tsx"),
  read("src/features/project/tabs/EstimateTab.tsx"),
  read("src/features/admin/PlatformAuditView.tsx"),
  read("src/features/dpr/DPRComposer.tsx"),
  read("src/features/dpr/PhotoGeotagCapture.tsx"),
  read("src/features/org/FfeRollupView.tsx"),
  read("src/features/org/DownloadAuditView.tsx"),
  read("src/features/org/MonthlyStatementView.tsx"),
  read("src/app/downloadAuditQueries.ts"),
  read("src/features/org/CrossRaBillsView.tsx"),
  read("src/app/crossRaQueries.ts"),
  read("src/features/org/CrmView.tsx"),
  read("src/app/crmQueries.ts"),
  read("src/features/project/RiskSignalsCard.tsx"),
  read("src/app/riskQueries.ts"),
  read("src/app/designWorkflow.ts"),
  read("src/app/designWorkflowQueries.ts"),
  read("src/app/materialRequestQueries.ts"),
  read("src/app/qualityQueries.ts"),
  read("src/app/shiftQueries.ts"),
  read("src/app/dprPdf.ts"),
  read("src/features/project/tabs/AttendanceTab.tsx"),
  read("src/features/project/tabs/LabourTab.tsx"),
  read("src/features/pwa/PwaChrome.tsx"),
  read("src/lib/pwa.ts"),
  read("src/features/shell/BrandingEffect.tsx"),
  read("src/features/shell/useOrgBranding.ts"),
  read("src/features/shell/brandingCss.ts"),
].join("\n");
const pkg = JSON.parse(read("package.json"));
const vite = read("vite.config.js");

[
  "contractor",
  "FieldOpsTab",
  "ApprovalsTab",
  "MapTab",
  "MessagesView",
  "BoqTab",
  "LedgerTab",
  "EstimateTab",
  "Bill of Quantities",
  "Stock ledger tab",
  "navigator.geolocation",
  "Daily Site Report",
  "Measurement Book",
  "signature",
  "Electronic signature",
  "computeRiskScore",
  "computeRiskSignals",
  "RiskSignalsCard",
  "computeDesignStage",
  "advanceDesignWorkflow",
  "fetchLLMInsight",
  "buildUpiDeepLink",
  "queueOpAdd",
  "superadmin",
  "PlatformDashboardView",
  "PlatformOrgsView",
  "PlatformUsersView",
  "PlatformBillingView",
  "PlatformSettingsView",
  "PLAN_META",
  "Billing & MRR",
  "System Settings",
  "isSupabaseEnabled",
  "signInWithMagicLink",
  "migrateLocalToBackend",
  "PlatformAuditView",
  "PlatformUsageView",
  "PlatformSupportView",
  "Impersonating",
  "Audit Log",
  "Usage Analytics",
  "notifsForUser",
  "csvRow",
  // Roadmap Batch 2 views
  "HierarchyView",
  "MaterialPricesView",
  "ComplianceView",
  "ForecastView",
  "DelegationsView",
  "PlatformBrandingView",
  "PlatformAuditLogV2View",
  "PlanGate",
  // Roadmap Batch 3 — kiosks + AR + snapshot
  "LabourKioskView",
  "SiteWallKioskView",
  "ARDrawingOverlayView",
  "DailySnapshotView",
  "recordAudit",
  // Production Phase 1 — Org Admin tier
  "OrgDashboardView",
  "OrgMembersView",
  "OrgBillingView",
  "OrgIntegrationsView",
  "OrgActivityView",
  "OrgTemplatesView",
  "OrgApprovalsView",
  "OrgNotificationsView",
  "orgadmin",
  // Q6 / Q7 / Q8 toggles
  "demoLoaderEnabled",
  "kioskLabourEnabled",
  "kioskSiteEnabled",
  "kioskArEnabled",
  "tenantOnboardingMode",
  // Cashfree integration
  "isCashfreeConfigured",
  "buildSubscriptionRequest",
  // Feature-flag catalog system
  "OrgFeaturesView",
  "FEATURE_CATALOG",
  "isFeatureEnabled",
  "Feature Toggles",
  "FfeRollupView",
  "ffeOrgRollup",
  "DownloadAuditView",
  "logDownloadEvent",
  "MonthlyStatementView",
  "monthlyStatementTotals",
  "monthlyStatementPdf",
  "downloadMonthlyStatementPdf",
  "CrossRaBillsView",
  "crossRaQueries",
  "crossRaRollup",
  "CrmView",
  "crmQueries",
  "crmRollup",
  "listMaterialRequests",
  "requestTotals",
  "REQUEST_NEXT",
  "listCorrectiveActions",
  "correctiveRollup",
  "CORRECTIVE_NEXT",
  "listShiftRoster",
  "wageSlip",
  "attendanceTally",
  "downloadDprPdf",
  "dprWhatsAppShareEnabled",
  "buildCsv",
  "downloadCsv",
  "PwaChrome",
  "BrandingEffect",
  "resolveShellBranding",
  "registerServiceWorker",
].forEach(marker => add(`App marker: ${marker}`, app.includes(marker)));

[
  "AgentsView",
  "INIT_AGENT_RUNS",
  "agentRuns",
  "AI Agents",
].forEach(marker => add(`No in-app agent marker: ${marker}`, !app.includes(marker)));

// PERMS is now fully replaced by the @/auth capabilities system (deleted).
add("No legacy PERMS reference remains", !app.includes("const PERMS =") && !app.includes("from \"./lib/permissions.ts\""));

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
  "src/auth/capabilities.ts",
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
  "src/lib/offline.ts",
  "src/lib/ai.ts",
  "src/lib/razorpay.ts",
  "src/lib/supabase.ts",
  "capacitor.config.json",
  "docs/MOBILE_BUILD.md",
  ".env.example",
  // Live activation
  "docs/GOLIVE.md",
  "scripts/provision.sh",
  // System design doc
  "docs/SYSTEM_DESIGN.md",
  // Tech Lead Review fixes (HIGH-1, HIGH-2, MED-3, MED-4, LOW-5)
  "src/lib/escape.ts",
  "src/lib/notifications.ts",
  "src/lib/format.ts",
  "tests/escape.test.js",
  "tests/notifications.test.js",
  "tests/format.test.js",
  // Deep review pack
  "src/data/seed.ts",
  "src/data/lookups.ts",
  "playwright.config.js",
  "tests/e2e/roles.spec.js",
  // Roadmap Batch 1 — foundation libs + tests
  "src/lib/hierarchy.ts",
  "src/lib/audit.ts",
  "src/lib/delegations.ts",
  "src/lib/branding.ts",
  "src/lib/materialPrices.ts",
  "src/lib/compliance.ts",
  "src/lib/aiForecast.ts",
  "tests/hierarchy.test.js",
  "tests/audit.test.js",
  "tests/delegations.test.js",
  "tests/branding.test.js",
  "tests/compliance.test.js",
  // Roadmap Batch 3 — new lib + docs
  "src/lib/whatsapp.ts",
  // Roadmap Batch 4 — App.jsx split (ui atoms + features/)
  "src/components/ui/atoms.tsx",
  // Roadmap Batch 5 — admin cluster extracted
  // Roadmap Batch 6 — mid-size views extracted + i18n helper module
  "src/lib/i18n.ts",
  "tests/whatsapp.test.js",
  // Roadmap Batch 7 — attachment atoms + detail satellites extracted
  // Roadmap Batch 8 — export helpers extracted
  // Roadmap Batch 10 — shell cluster extracted
  // Production Phase 1 — Org Admin tier
  "src/lib/approvalChains.ts",
  "src/lib/orgIntegrations.ts",
  "src/lib/templates.ts",
  "tests/approvalChains.test.js",
  "tests/orgIntegrations.test.js",
  "tests/templates.test.js",
  // Session 15 — Production gate (RLS + Cashfree)
  "src/lib/cashfree.ts",
  "tests/cashfree.test.js",
  "scripts/supabase/03_rls_phase1.sql",
  "scripts/supabase/05_rls_phase1_tests.sql",
  "scripts/supabase/167_material_requests_grn.sql",
  "scripts/supabase/168_construction_quality.sql",
  "scripts/supabase/169_shift_roster.sql",
  "docs/PRODUCTION_RLS.md",
  "docs/CASHFREE_ONBOARDING.md",
  // Session 16 — Feature-flag catalog system
  "src/lib/orgFeatureFlags.ts",
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
  "src/components/errorBoundary.tsx",
  // Session 22 — major changes pack
  "supabase/functions/_shared/cashfree.ts",
  "supabase/functions/cashfree-subscription/index.ts",
  "supabase/functions/cashfree-webhook/index.ts",
  "supabase/functions/README.md",
  "src/lib/blockchainAnchor.ts",
  "tests/blockchainAnchor.test.js",
  "src/lib/reraTelangana.ts",
  "tests/reraTelangana.test.js",
  "docs/PLAY_STORE_PREP.md",
  // Session 23 — v2 role model implementation (Phases A-E)
  "docs/ROLE_MODEL_V2.md",
  "scripts/supabase/06_project_types.sql",
  "scripts/supabase/07_role_expansion.sql",
  "src/lib/projectTypes.ts",
  "tests/projectTypes.test.js",
  "src/lib/contractors.ts",
  "tests/contractors.test.js",
  // Session 24 — comparison + adversarial fixes
  "docs/COMPETITOR_COMPARISON_V2.md",
  // Session 25 — sales-blocking miss fixes (BOQ import + bulk member + PDF audit + archive)
  "src/lib/boqImport.ts",
  "tests/boqImport.test.js",
  "src/lib/projectArchive.ts",
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
  const flagsJs = read("src/lib/featureFlags.ts");
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
