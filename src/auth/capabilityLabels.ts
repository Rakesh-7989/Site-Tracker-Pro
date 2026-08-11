// SiteTrack Pro — plain-English labels + grouping for capabilities.
//
// Single source of truth for turning capability ids into founder-readable
// feature names + grouping them by area. Used by the RoleManager admin UI
// and the docs/ROLE_FEATURES.md generator so the two never disagree.

import { CAPABILITIES, capabilityDomain, type Capability } from "./capabilities";

export const FEATURE_LABEL: Record<string, string> = {
  "project:create": "Create new projects", "project:archive": "Archive projects",
  "project:restore": "Restore archived projects", "project:delete": "Delete projects",
  "project:settings:edit": "Edit project settings",
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
  "material:price:view": "View material price master", "vendor:manage": "Manage vendor directory",
  "vendor:select": "Select a vendor in PO / material / invoice forms",
  "po:create": "Create / submit purchase orders", "po:approve": "Approve purchase orders",
  "drawings:upload": "Upload drawings", "drawings:edit": "Edit drawings",
  "drawings:release": "Release drawing revisions", "drawings:markup": "Mark up drawings",
  "boq:edit": "Edit BOQ", "estimate:edit": "Edit estimates",
  "rfi:create": "Raise RFIs", "rfi:respond": "Respond to RFIs", "rfi:close": "Close RFIs",
  "changeorder:create": "Create change orders", "changeorder:approve": "Approve change orders",
  "expense:add": "Add expenses", "expense:approve": "Approve expenses",
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
  "platform:roles:configure": "Assign / revoke capabilities to roles",
  "phase:manage": "Manage fee phases & amounts", "time:log": "Log billable time",
  "time:manage": "Manage all time entries", "deliverable:manage": "Create / edit deliverables",
  "deliverable:approve": "Approve / issue deliverables", "review:comment": "Comment on review rounds",
  "review:manage": "Open / close review rounds", "utilization:view": "View utilization reports",
  "rate:manage": "Manage rate cards", "time:approve": "Approve / reject time entries",
  "retainer:manage": "Manage monthly retainers", "billing:generate": "Generate hourly / retainer invoices",
  "revenue:view": "View revenue & billing rollups",
  "ffe:manage": "Manage FF&E schedules & moodboards", "statutory:manage": "Manage statutory approvals / NOC register",
  "procurement:view": "View & compare vendor quotes",
  "crm:view": "View the sales pipeline (leads, meetings, quotations)",
  "crm:manage": "Create / update leads, meetings, quotations & agreements",
  "audit:manage": "Manage consultancy inspections, checklists & audit reports",
  "research:view": "View the research library (documents, collections)",
  "research:manage": "Create / edit research documents & collections",
};

/** Founder-readable label for a capability (falls back to a humanized id). */
export function capabilityLabel(cap: Capability): string {
  return FEATURE_LABEL[cap] ?? cap.replace(/[:_]/g, " ");
}

// ── Grouping by feature area ────────────────────────────────────────────────
const GROUP_BY_DOMAIN: Record<string, string> = {
  project: "projects", progress: "progress", milestone: "progress",
  dpr: "dpr", voice: "capture", photo: "capture",
  update: "siteops", issue: "siteops", safety: "siteops", inspection: "siteops", punchlist: "siteops",
  team: "team", attendance: "team", labour: "team",
  material: "materials", vendor: "materials", po: "materials",
  drawings: "drawings", boq: "boq", estimate: "boq",
  rfi: "rfi", changeorder: "rfi",
  expense: "finance", rabill: "finance", invoice: "finance", budget: "finance", ledger: "finance",
  phase: "consultancy", time: "consultancy", deliverable: "consultancy",
  review: "consultancy", utilization: "consultancy",
  rate: "consultancy", retainer: "consultancy",
  billing: "finance", revenue: "finance",
  ffe: "architecture", statutory: "architecture", procurement: "architecture",
  research: "research",
  compliance: "compliance", rera: "compliance", gstn: "compliance", epfo: "compliance",
  message: "comms", notification: "comms", whatsapp: "comms", digest: "comms",
  activity: "activity", audit: "activity",
  export: "export", share: "export",
  handover: "handover", org: "orgadmin", platform: "platform",
};

export const GROUP_ORDER = ["projects","progress","dpr","capture","siteops","team","materials","drawings","boq","rfi","finance","consultancy","architecture","research","compliance","comms","activity","export","handover","orgadmin","platform"] as const;

export const GROUP_LABEL: Record<string, string> = {
  projects: "Projects", progress: "Progress & Milestones", dpr: "Daily Reports (DPR)",
  capture: "Voice & Photos", siteops: "Site Operations", team: "Team & Attendance",
  materials: "Materials & Procurement", drawings: "Drawings", boq: "BOQ & Estimates",
  rfi: "RFIs & Change Orders", finance: "Finance & Billing", consultancy: "Consultancy Engagements",
  architecture: "Architecture & Design",
  research: "Research Library",
  compliance: "Compliance & Filings", comms: "Communications", activity: "Activity & Audit", export: "Export & Sharing",
  handover: "Handover", orgadmin: "Org Administration", platform: "Platform Administration",
};

/** Group key for a capability. */
export function groupOf(cap: Capability): string {
  return GROUP_BY_DOMAIN[capabilityDomain(cap)] ?? "other";
}

/** Ordered groups, each with its capabilities (in canonical CAPABILITIES order). */
export function capabilityGroups(): Array<{ key: string; label: string; capabilities: Capability[] }> {
  const byGroup = new Map<string, Capability[]>();
  for (const cap of CAPABILITIES) {
    const g = groupOf(cap);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(cap);
  }
  return GROUP_ORDER
    .filter(g => byGroup.has(g))
    .map(g => ({ key: g, label: GROUP_LABEL[g] ?? g, capabilities: byGroup.get(g)! }));
}
