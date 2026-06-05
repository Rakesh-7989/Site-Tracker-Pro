// Throwaway codegen: emits docs/ROLE_FEATURES.md from the LIVE permissions
// matrix so the founder reference can never drift from the code. Run once:
//   npx vitest run tests/_gen/roleFeatures.gen.test.ts
// then delete this file. (Kept out of the normal suite by the _gen path.)

import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  IDENTITY_ROLES, ROLE_LABEL, ROLE_CATEGORY,
  defaultOrgTierFor, defaultProjectTierFor,
} from "@/auth/roles";
import { CAPABILITIES, capabilityDomain, type Capability } from "@/auth/capabilities";
import {
  identityCapabilities, orgTierCapabilities, projectTierCapabilities,
} from "@/auth/permissions-matrix";

// ── Plain-English feature labels (capability id → founder-readable) ─────────
const FEATURE_LABEL: Record<string, string> = {
  "project:create": "Create new projects", "project:archive": "Archive projects",
  "project:restore": "Restore archived projects", "project:settings:edit": "Edit project settings",
  "progress:edit": "Update overall progress %",
  "milestone:add": "Add milestones", "milestone:edit": "Edit milestones", "milestone:delete": "Delete milestones",
  "dpr:submit": "File daily progress reports (DPR)", "dpr:approve": "Approve / publish DPRs", "dpr:view": "View daily reports",
  "voice:record": "Record Telugu voice notes", "photo:upload": "Upload site photos", "photo:geotag:override": "Override photo geotag",
  "update:add": "Post site updates", "update:edit": "Edit site updates", "update:delete": "Delete site updates",
  "issue:add": "Raise issues", "issue:resolve": "Resolve issues",
  "safety:report": "Report safety incidents", "safety:close": "Close safety incidents",
  "inspection:create": "Create inspections", "inspection:close": "Close inspections",
  "punchlist:add": "Add punch-list items", "punchlist:close": "Close punch-list items",
  "team:manage": "Manage project team", "attendance:mark": "Mark labour attendance",
  "attendance:view": "View attendance", "labour:manage": "Manage labour records",
  "material:add": "Add materials", "material:edit": "Edit materials", "material:delete": "Delete materials",
  "material:price:view": "View material price master", "vendor:manage": "Manage vendors",
  "po:create": "Create / submit purchase orders", "po:approve": "Approve purchase orders",
  "drawings:upload": "Upload drawings", "drawings:edit": "Edit drawings",
  "drawings:release": "Release drawing revisions", "drawings:markup": "Mark up drawings",
  "boq:edit": "Edit BOQ", "boq:import": "Import BOQ", "estimate:edit": "Edit estimates",
  "rfi:create": "Raise RFIs", "rfi:respond": "Respond to RFIs", "rfi:close": "Close RFIs",
  "changeorder:create": "Create change orders", "changeorder:approve": "Approve change orders",
  "expense:add": "Add expenses", "expense:approve": "Approve expenses", "expense:delete": "Delete expenses",
  "rabill:create": "Create RA bills", "rabill:approve": "Approve RA bills",
  "invoice:create": "Create invoices", "invoice:approve": "Approve invoices",
  "budget:view": "View budget", "budget:edit": "Edit budget", "ledger:view": "View financial ledger",
  "compliance:view": "View compliance status", "rera:file": "File RERA returns",
  "gstn:file": "File GST returns", "epfo:file": "File EPFO returns",
  "message:send": "Send in-app messages", "notification:configure": "Configure notifications",
  "whatsapp:send": "Send WhatsApp messages", "digest:subscribe": "Subscribe to daily digest",
  "digest:receive": "Receive the 7am WhatsApp digest",
  "activity:view": "View activity feed", "audit:read": "Read audit log",
  "export:pdf": "Export PDF reports", "export:csv": "Export CSV data",
  "share:project:public": "Share project publicly", "share:client:portal": "Access the client portal",
  "handover:generate": "Generate handover packets", "handover:view": "View handover packets", "handover:sign": "Sign handover packets",
  "org:members:manage": "Manage org members", "org:billing:manage": "Manage billing / subscription",
  "org:integrations:manage": "Manage integrations", "org:templates:manage": "Manage templates",
  "org:approvals:manage": "Configure approval chains", "org:notifications:manage": "Manage org notifications",
  "org:branding:manage": "Manage org branding", "org:features:configure": "Configure feature flags",
  "platform:users:manage": "Manage all platform users", "platform:orgs:manage": "Manage all organizations",
  "platform:billing:manage": "Manage platform billing", "platform:settings:manage": "Manage platform settings",
  "platform:impersonate": "Impersonate any user", "platform:audit:read:cross-org": "Read cross-org audit log",
};

// ── Feature groups (domain → group) ─────────────────────────────────────────
const GROUP_BY_DOMAIN: Record<string, string> = {
  project: "projects", progress: "progress", milestone: "progress",
  dpr: "dpr", voice: "capture", photo: "capture",
  update: "siteops", issue: "siteops", safety: "siteops", inspection: "siteops", punchlist: "siteops",
  team: "team", attendance: "team", labour: "team",
  material: "materials", vendor: "materials", po: "materials",
  drawings: "drawings", boq: "boq", estimate: "boq",
  rfi: "rfi", changeorder: "rfi",
  expense: "finance", rabill: "finance", invoice: "finance", budget: "finance", ledger: "finance",
  compliance: "compliance", rera: "compliance", gstn: "compliance", epfo: "compliance",
  message: "comms", notification: "comms", whatsapp: "comms", digest: "comms",
  activity: "activity", audit: "activity",
  export: "export", share: "export",
  handover: "handover", org: "orgadmin", platform: "platform",
};
const GROUP_ORDER = ["projects","progress","dpr","capture","siteops","team","materials","drawings","boq","rfi","finance","compliance","comms","activity","export","handover","orgadmin","platform"];
const GROUP_LABEL: Record<string, string> = {
  projects: "Projects", progress: "Progress & Milestones", dpr: "Daily Reports (DPR)",
  capture: "Voice & Photos", siteops: "Site Operations", team: "Team & Attendance",
  materials: "Materials & Procurement", drawings: "Drawings", boq: "BOQ & Estimates",
  rfi: "RFIs & Change Orders", finance: "Finance & Billing", compliance: "Compliance & Filings",
  comms: "Communications", activity: "Activity & Audit", export: "Export & Sharing",
  handover: "Handover", orgadmin: "Org Administration", platform: "Platform Administration",
};

// ── One-line role descriptions ──────────────────────────────────────────────
const ROLE_DESC: Record<string, string> = {
  superadmin: "Platform owner (you). Full access to every org + every feature.",
  orgadmin: "Firm owner / workspace admin. Runs the org — members, billing, settings.",
  promoter: "Paying builder / firm owner. Gets the 7am WhatsApp digest; finance + handover view. Owns the org but rarely logs in.",
  project_admin: "Back-office paperwork — invoices, RA bills, RERA / GST / EPFO filings.",
  prospector: "Sales / BD. Creates draft projects for prospects; minimal access.",
  pm: "Project Manager. Runs project execution end-to-end (absorbed Project Head — full approval power).",
  architect: "Drawings + RFIs + BOQ + change orders.",
  senior_architect: "Senior architect — supervises juniors, approves RFIs + change orders.",
  junior_architect: "Junior architect — drafting + drawing revisions.",
  design_architect_interior: "Interior design lead (absorbed Interior Designer) — drawings + materials.",
  design_head: "Design Project lead — runs the design team.",
  consultant_head: "Consultant Project lead.",
  mep_consultant: "MEP (mechanical / electrical / plumbing) consultant.",
  structural_consultant: "Structural engineer / consultant.",
  consultant: "Generic consultant — markup + RFIs.",
  designer: "Designer (design projects) — drawings + updates.",
  site_engineer: "The field role. Files DPRs (voice + photo), runs site ops + attendance (absorbed Site Supervisor + Civil Engineer).",
  contractor: "Contractor — updates, attendance, RA bills, photos.",
  sub_contractor: "Sub-contractor — updates, attendance, RFIs, photos.",
  vendor: "Material supplier — vendor portal: quotes, invoices, price master.",
  client: "Unit buyer — read-only progress + payments + handover; client portal.",
  site_inspector: "External RERA / govt inspector — read-only audit + RERA filing.",
};

const CATEGORY_ORDER = ["platform","org-leadership","project-execution","design-discipline","engineering-discipline","field-supervision","supply-chain","external"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  platform: "Platform", "org-leadership": "Org Leadership",
  "project-execution": "Architecture & Project Execution", "design-discipline": "Design",
  "engineering-discipline": "Engineering & Field", "field-supervision": "Field Supervision",
  "supply-chain": "Supply Chain", external: "External / Clients",
};

// Effective feature set: identity always; org tier only when it's an
// elevated tier (admin/pm); project tier via the role's default mapping.
function effective(role: typeof IDENTITY_ROLES[number]): Set<Capability> {
  const caps = new Set<Capability>(identityCapabilities(role));
  const ot = defaultOrgTierFor(role);
  if (ot === "admin" || ot === "pm") for (const c of orgTierCapabilities(ot)) caps.add(c);
  const pt = defaultProjectTierFor(role);
  if (pt) for (const c of projectTierCapabilities(pt)) caps.add(c);
  return caps;
}

function featureLines(role: typeof IDENTITY_ROLES[number]): string[] {
  const caps = effective(role);
  // group → ordered feature labels (canonical CAPABILITIES order)
  const byGroup = new Map<string, string[]>();
  for (const cap of CAPABILITIES) {
    if (!caps.has(cap)) continue;
    const g = GROUP_BY_DOMAIN[capabilityDomain(cap)] ?? "other";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(FEATURE_LABEL[cap] ?? cap);
  }
  const lines: string[] = [];
  for (const g of GROUP_ORDER) {
    const items = byGroup.get(g);
    if (items && items.length) lines.push(`- **${GROUP_LABEL[g]}:** ${items.join(", ")}`);
  }
  return lines;
}

it("generates docs/ROLE_FEATURES.md from the live permissions matrix", () => {
  const out: string[] = [];
  out.push("# Role → Features Reference");
  out.push("");
  out.push("*Auto-generated from `src/auth/permissions-matrix.ts` — the single");
  out.push("source of truth. Do not hand-edit; regenerate after any role change.*");
  out.push("");
  out.push("## How to read this");
  out.push("");
  out.push("SiteTrack has a **3-axis** role model — a user can hold a role at the");
  out.push("identity, org, and project level, and their real access is the **union**");
  out.push("of all three. The features below show the **full set a role gets when");
  out.push("provisioned the normal way** (identity + their org tier if elevated +");
  out.push("their project assignment). A user added to fewer tiers gets a subset.");
  out.push("");
  out.push(`**22 roles · ${CAPABILITIES.length} total capabilities.** Consolidated 2026-06-04.`);
  out.push("");

  // Quick index
  out.push("## Quick index");
  out.push("");
  out.push("| Role | What they are | Features |");
  out.push("|---|---|---|");
  for (const role of IDENTITY_ROLES) {
    const n = effective(role).size;
    out.push(`| **${ROLE_LABEL[role]}** (\`${role}\`) | ${ROLE_DESC[role] ?? ""} | ${n} |`);
  }
  out.push("");

  // Per-category, per-role detail
  for (const cat of CATEGORY_ORDER) {
    const roles = IDENTITY_ROLES.filter(r => ROLE_CATEGORY[r] === cat);
    if (!roles.length) continue;
    out.push(`## ${CATEGORY_LABEL[cat]}`);
    out.push("");
    for (const role of roles) {
      out.push(`### ${ROLE_LABEL[role]} \`${role}\``);
      out.push("");
      out.push(`*${ROLE_DESC[role] ?? ""}*`);
      out.push("");
      if (role === "superadmin") {
        out.push("- **Everything.** Full platform + every org + every feature, including impersonation and cross-org audit.");
      } else {
        out.push(...featureLines(role));
      }
      out.push("");
    }
  }

  out.push("## Notes");
  out.push("");
  out.push("- **Promoter = firm owner.** Provisioned as org `admin`, so they *can*");
  out.push("  do everything in their org — the finance-first dashboard is a UI choice,");
  out.push("  not a hard limit.");
  out.push("- **site_engineer** is the single field role (absorbed site_supervisor +");
  out.push("  civil_engineer); it owns the voice-DPR wedge.");
  out.push("- **pm** absorbed project_head, so it now holds `rabill:approve` + full");
  out.push("  export. **design_architect_interior** absorbed interior_designer.");
  out.push("- Read-only roles (client, site_inspector, prospector) deliberately lack");
  out.push("  edit/approve features — least-privilege by design.");
  out.push("");
  out.push("*Regenerate after any role/capability change:");
  out.push("`npx vitest run tests/_gen/roleFeatures.gen.test.ts`*");
  out.push("");

  const target = join(process.cwd(), "docs", "ROLE_FEATURES.md");
  writeFileSync(target, out.join("\n"), "utf8");
  expect(out.length).toBeGreaterThan(50);
});
