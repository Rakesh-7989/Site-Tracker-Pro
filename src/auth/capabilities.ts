// SiteTrack Pro — canonical capability set.
//
// A capability is a single, gated action the app can perform. Roles are
// composed of capability sets via permissions-matrix.ts. The RoleResolver
// reads identity + org + project tiers and produces the UNION of all
// allowed capabilities for the (user, context) pair.
//
// Naming: domain:action (lowercase, colon-separated). Group by domain so
// new capabilities fit naturally.
//
// When adding a new capability:
//   1. Add it to CAPABILITIES below
//   2. Update permissions-matrix.ts for every role that should hold it
//   3. Add a test asserting at least one role has it + at least one doesn't
//   4. If RLS gates the same action, ensure 66_rls_role_catalog_sync.sql
//      lists the same capability identifier as a comment

export const CAPABILITIES = [
  // ── Project lifecycle ────────────────────────────────────────────────────
  "project:create",
  "project:archive",
  "project:restore",
  "project:settings:edit",

  // ── Progress + milestones ────────────────────────────────────────────────
  "progress:edit",
  "milestone:add",
  "milestone:edit",
  "milestone:delete",

  // ── Daily Progress Report ────────────────────────────────────────────────
  "dpr:submit",          // submit a DPR (typically site_engineer)
  "dpr:approve",         // approve / publish a DPR
  "dpr:view",            // read DPRs

  // ── Voice + photo ────────────────────────────────────────────────────────
  "voice:record",
  "photo:upload",
  "photo:geotag:override",

  // ── Updates + issues + safety ────────────────────────────────────────────
  "update:add",
  "update:edit",
  "update:delete",
  "issue:add",
  "issue:resolve",
  "safety:report",
  "safety:close",
  "inspection:create",
  "inspection:close",
  "punchlist:add",
  "punchlist:close",

  // ── Team + attendance ────────────────────────────────────────────────────
  "team:manage",
  "attendance:mark",
  "attendance:view",
  "labour:manage",

  // ── Materials + procurement ──────────────────────────────────────────────
  "material:add",
  "material:edit",
  "material:delete",
  "material:price:view",
  "vendor:manage",       // Curate the vendor directory (add / edit / rate / delete).
  "vendor:select",       // Pick a vendor from the directory inside a PO / material / invoice form.
  "po:create",
  "po:approve",

  // ── Drawings ─────────────────────────────────────────────────────────────
  "drawings:upload",
  "drawings:edit",
  "drawings:release",
  "drawings:markup",

  // ── BOQ + estimate ───────────────────────────────────────────────────────
  "boq:edit",
  "boq:import",
  "estimate:edit",

  // ── RFI + change orders ──────────────────────────────────────────────────
  "rfi:create",
  "rfi:respond",
  "rfi:close",
  "changeorder:create",
  "changeorder:approve",

  // ── Finance + billing ────────────────────────────────────────────────────
  "expense:add",
  "expense:approve",
  "expense:delete",
  "rabill:create",
  "rabill:approve",
  "invoice:create",
  "invoice:approve",
  "budget:view",
  "budget:edit",
  "ledger:view",

  // ── Compliance + filings ─────────────────────────────────────────────────
  "compliance:view",
  "rera:file",
  "gstn:file",
  "epfo:file",

  // ── Communications ───────────────────────────────────────────────────────
  "message:send",
  "notification:configure",
  "whatsapp:send",
  "digest:subscribe",
  "digest:receive",

  // ── Activity + audit ─────────────────────────────────────────────────────
  "activity:view",
  "audit:read",

  // ── Export + share ───────────────────────────────────────────────────────
  "export:pdf",
  "export:csv",
  "share:project:public",
  "share:client:portal",

  // ── Handover packet (Sprint 4) ───────────────────────────────────────────
  "handover:generate",
  "handover:view",
  "handover:sign",

  // ── Org-admin tier ───────────────────────────────────────────────────────
  "org:members:manage",
  "org:billing:manage",
  "org:integrations:manage",
  "org:templates:manage",
  "org:approvals:manage",
  "org:notifications:manage",
  "org:branding:manage",
  "org:features:configure",

  // ── Platform-admin (superadmin only) ─────────────────────────────────────
  "platform:users:manage",
  "platform:orgs:manage",
  "platform:billing:manage",
  "platform:settings:manage",
  "platform:impersonate",
  "platform:audit:read:cross-org",
  "platform:roles:configure",   // assign/revoke capabilities to roles (superadmin)
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Type guard. */
export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);
}

/** Group capabilities by domain (first segment of the colon-separated id). */
export function capabilityDomain(cap: Capability): string {
  return cap.split(":")[0] ?? "unknown";
}

/** Sets used by the RoleResolver. Mutable Set is faster than readonly. */
export type CapabilitySet = Set<Capability>;
