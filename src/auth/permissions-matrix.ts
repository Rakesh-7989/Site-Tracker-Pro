// SiteTrack Pro — capability matrix for all 22 identity roles + 6 org tiers
// + 18 project tiers.
//
// This is the AUTHORITATIVE matrix. RoleResolver.ts composes a user's
// capability set from 1-3 entries in this file (one per tier the user
// holds in the context).
//
// Editing rules:
//   1. Adding a new role → add an entry in IDENTITY_CAPS / ORG_TIER_CAPS /
//      PROJECT_TIER_CAPS that explicitly lists their capabilities.
//   2. Adding a new capability → add it to capabilities.ts, then update
//      every role's array here.
//   3. Removing a capability from a role → re-run tests; the diff is
//      asserted in tests/auth/permissionsMatrix.test.ts to catch
//      accidental loss.
//
// Convention: roles default to LEAST-PRIVILEGE. A role gets a capability
// only when their job-to-be-done requires it. Explicit > permissive.
//
// Note on overlap: many roles appear in multiple tiers (e.g., 'architect'
// is identity + org + project). The CAPABILITY SET DIFFERS per tier:
//   - identity: what an architect IDENTITY can do globally (not much)
//   - org-tier: what an org-level architect can do across all org projects
//   - project-tier: what an assigned project architect can do
// The composition rule (in RoleResolver) is UNION across the 3 tiers.

import { CAPABILITIES, type Capability } from "./capabilities";
import type { IdentityRole, ProjectTierRole } from "./roles";

const ALL = new Set(CAPABILITIES);
const arr = (...c: Capability[]): Capability[] => c;

// ── Identity tier (profiles.role) ──────────────────────────────────────────
// Capabilities granted SOLELY by holding an identity role, before any org
// or project context is layered in.

const SUPERADMIN_CAPS: Capability[] = Array.from(ALL);

const IDENTITY_CAPS: Record<IdentityRole, Capability[]> = {
  superadmin: SUPERADMIN_CAPS,

  // Org leadership identities. Most caps come from their org-tier membership
  // (admin tier); identity-only caps cover dashboard + audit reads.
  orgadmin: arr(
    "activity:view", "audit:read",
    "org:members:manage", "org:billing:manage", "org:integrations:manage",
    "org:templates:manage", "org:approvals:manage", "org:notifications:manage",
    "org:branding:manage", "org:features:configure", "notification:configure",
    "vendor:manage", "vendor:select",
    "project:create", "project:archive", "project:restore", "project:settings:edit",
    "team:manage",
    "compliance:view", "ledger:view", "budget:view", "budget:edit",
    "changeorder:approve", "po:approve", "invoice:approve", "rabill:approve", "expense:approve",
    "material:price:view", "material:delete",
    "update:delete",
    "export:pdf", "export:csv",
    "share:project:public",
    "handover:generate",
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "ffe:manage", "statutory:manage", "procurement:view",
  ),
  promoter: arr(
    // Paying firm owner — sees finances + DPR digests + handover packets.
    "activity:view", "audit:read",
    "dpr:view", "digest:subscribe", "digest:receive",
    "budget:view", "ledger:view", "compliance:view",
    "handover:view", "handover:sign",
    "export:pdf", "export:csv",
  ),
  // Separation of Duties: Project Admin creates invoices/RA bills but
  // does NOT approve them — orgadmin or higher approves. PO: approve only
  // (PM creates, Project Admin approves). Budget + ledger + material price
  // views provide financial context for invoice/RA bill creation.
  project_admin: arr(
    "activity:view", "audit:read",
    "compliance:view", "rera:file", "gstn:file", "epfo:file",
    "invoice:create",
    "rabill:create",
    "po:approve",
    "milestone:add", "milestone:edit",
    "vendor:select",   // Pick vendors when creating invoices / RA bills.
    "budget:view", "ledger:view", "material:price:view",  // Financial context for invoice/RA bill creation.
    "handover:generate",
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "ffe:manage", "statutory:manage", "procurement:view",
    "export:pdf", "export:csv",
  ),
  prospector: arr(
    // Sales / BD — reads only the prospects they own.
    // Gains export for sharing prospect proposals with clients.
    "activity:view",
    "project:create",                 // Can create draft projects for prospects
    "vendor:manage", "vendor:select", // Curates + picks vendor leads during prospecting.
    "message:send", "whatsapp:send",  // Communicate with vendor leads / stakeholders.
    "export:pdf", "export:csv",
  ),
  // pm absorbs the former project_head role (founder consolidation
  // 2026-06-04): gains export:csv on top of its own set.
  // Separation of Duties: PM can CREATE financial docs but must NOT approve
  // their own requests — approval requires a different role (orgadmin or
  // project_admin). This prevents fraud (same person creating + approving POs,
  // change orders, RA bills, or expenses).
  pm: arr(
    "activity:view",
    "project:create", "project:settings:edit",
    "progress:edit",
    "milestone:add", "milestone:edit", "milestone:delete",
    "update:add", "update:edit", "update:delete",
    "issue:add", "issue:resolve",
    "safety:close",
    "team:manage", "attendance:view", "attendance:mark",
    "compliance:view",
    "digest:subscribe", "digest:receive",
    "material:add", "material:edit", "material:delete",
    "material:price:view",
    "po:create", "vendor:select",   // PMs raise POs and pick vendors in the form.
    "rfi:respond", "rfi:close",
    "changeorder:create",
    "expense:add",
    "rabill:create",
    "budget:view", "ledger:view",
    "dpr:view", "dpr:approve",
    "drawings:upload",
    "handover:generate",
    "message:send", "whatsapp:send",
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "procurement:view",
    "export:pdf", "export:csv",
  ),

  // Design / architecture identities.
  architect: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "material:price:view",  // Cost context for change order creation.
    "issue:add",
    "boq:edit", "estimate:edit",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
    "export:pdf", "export:csv",
  ),
  senior_architect: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond", "rfi:close",
    "changeorder:create", "changeorder:approve",
    "issue:add", "issue:resolve",
    "boq:edit", "estimate:edit",
    "team:manage",
    "update:add", "update:edit", "update:delete",
    "material:price:view",  // Material cost context for change orders.
    "time:log", "deliverable:manage", "review:comment",
    "export:pdf", "export:csv",
  ),
  junior_architect: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:markup",
    "rfi:create", "rfi:respond",
    "issue:add",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  // design_architect_interior absorbs the former interior_designer role
  // (founder consolidation 2026-06-04).
  design_architect_interior: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "material:add", "material:edit", "material:price:view",
    "vendor:select",   // Interior designers raise material requests; pick vendor.
    "rfi:create", "rfi:respond",
    "boq:edit",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  design_head: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "team:manage",
    "rfi:respond", "rfi:close",
    "changeorder:approve",
    "boq:edit", "estimate:edit",
    "material:price:view",  // Material cost context for approving change orders.
    "update:add", "update:edit",
    "export:pdf",
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "ffe:manage", "statutory:manage", "procurement:view",
  ),
  consultant_head: arr(
    "activity:view",
    "drawings:edit", "drawings:markup",
    "rfi:respond", "rfi:close",
    "changeorder:approve",
    "material:price:view",  // Cost context for approving change orders.
    "update:add",
    "export:pdf",
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "ffe:manage", "statutory:manage", "procurement:view",
  ),
  designer: arr(
    "activity:view",
    "drawings:upload", "drawings:markup",
    "rfi:create",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),

  // Engineering disciplines.
  mep_consultant: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "material:price:view",  // Cost context for change order creation.
    "inspection:create", "inspection:close",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  structural_consultant: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "material:price:view",  // Cost context for change order creation.
    "inspection:create", "inspection:close",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  consultant: arr(
    "activity:view",
    "drawings:markup",
    "rfi:create", "rfi:respond",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  // site_engineer is now the single field role — it absorbs the former
  // site_supervisor (voice DPR origin) and civil_engineer (founder
  // consolidation 2026-06-04). voice:record was site_supervisor's only
  // unique cap; everything else site_engineer already had.
  site_engineer: arr(
    "activity:view",
    "progress:edit",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "punchlist:add", "punchlist:close",
    "safety:report", "safety:close",
    "attendance:mark", "attendance:view", "labour:manage",
    "material:add", "material:edit", "material:price:view", "vendor:select",   // Logs material receipts; pick vendor.
    "rfi:create",
    "inspection:create", "inspection:close",
    "voice:record", "photo:upload",
    "dpr:submit", "dpr:approve", "dpr:view",
    "drawings:markup",
  ),

  // Supply chain.
  contractor: arr(
    "activity:view",
    "update:add",
    "attendance:mark", "attendance:view",
    "material:add", "vendor:select",   // Receives material from approved vendors.
    "material:price:view",             // Cost context for RA bill creation.
    "rfi:create",
    "rabill:create",
    "photo:upload",
  ),
  sub_contractor: arr(
    "activity:view",
    "update:add",
    "attendance:mark", "attendance:view",
    "rfi:create",
    "photo:upload",
  ),
  vendor: arr(
    // Vendor portal only — quote response + invoice management.
    "activity:view",
    "po:create",   // submit quote
    "invoice:create",
    "material:price:view",
  ),

  // External + clients.
  client: arr(
    // Read-only: unit progress + payments + handover docs.
    "activity:view",
    "dpr:view", "compliance:view",
    "handover:view", "handover:sign",
    "share:client:portal",
    "review:comment",
    "export:pdf",
  ),
  site_inspector: arr(
    // External RERA / govt audit — read-only + immutable assignment.
    "activity:view",
    "compliance:view", "audit:read",
    "drawings:markup",
    "rera:file",   // external inspector files compliance docs on behalf of project
    "export:pdf",
  ),
};

// ── Org tier removed (2026-07-28) ─────────────────────────────────────────
// org_members.role has been deleted. Org-level capabilities are now granted
// directly through identity roles (profiles.role). The `orgadmin` identity
// role includes all admin-level org caps. For non-orgadmin users who need
// org admin access, org_members.is_admin is checked in RoleResolver.ts.

// ── Project tier (project_members.role — 18 values) ───────────────────────
// What the user can do on a SPECIFIC project based on project_members.role.
// Reuses many capabilities from the identity-tier set but scoped to one
// project (RLS enforces project scope at the DB layer).
//
// For roles that appear in both identity AND project tiers, the project
// tier typically adds project-specific writes (e.g. dpr:submit) that the
// identity tier doesn't grant on its own.

const PROJECT_TIER_CAPS: Record<ProjectTierRole, Capability[]> = {
  architect: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "boq:edit", "estimate:edit",
    "update:add",
    "issue:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  senior_architect: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond", "rfi:close",
    "changeorder:create", "changeorder:approve",
    "boq:edit", "estimate:edit",
    "team:manage",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "material:price:view",  // Material cost context for change orders.
    "time:log", "deliverable:manage", "review:comment",
  ),
  junior_architect: arr(
    "drawings:upload", "drawings:edit", "drawings:markup",
    "rfi:create", "rfi:respond",
    "issue:add",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  design_architect_interior: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "material:add", "material:edit",
    "rfi:create", "rfi:respond",
    "boq:edit",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  design_head: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "team:manage",
    "rfi:respond", "rfi:close",
    "changeorder:approve",
    "boq:edit", "estimate:edit",
    "material:price:view",  // Material cost context for approving change orders.
    "update:add", "update:edit",
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "ffe:manage", "statutory:manage", "procurement:view",
  ),
  consultant_head: arr(
    "drawings:edit", "drawings:markup",
    "rfi:respond", "rfi:close",
    "changeorder:approve",
    "material:price:view",  // Cost context for approving change orders.
    "update:add",
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "ffe:manage", "statutory:manage", "procurement:view",
  ),
  designer: arr(
    "drawings:upload", "drawings:markup",
    "rfi:create",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  consultant: arr(
    "drawings:markup",
    "rfi:create", "rfi:respond",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  mep_consultant: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "material:price:view",  // Cost context for change order creation.
    "inspection:create", "inspection:close",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  structural_consultant: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "material:price:view",  // Cost context for change order creation.
    "inspection:create", "inspection:close",
    "update:add",
    "time:log", "deliverable:manage", "review:comment",
  ),
  // Single field role on a project — absorbs site_supervisor (voice DPR)
  // and civil_engineer (founder consolidation 2026-06-04).
  site_engineer: arr(
    "progress:edit",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "punchlist:add", "punchlist:close",
    "safety:report", "safety:close",
    "attendance:mark", "attendance:view", "labour:manage",
    "material:add", "material:edit", "material:price:view", "vendor:select",   // Logs material receipts; pick vendor.
    "rfi:create",
    "inspection:create", "inspection:close",
    "voice:record", "photo:upload",
    "dpr:submit", "dpr:approve", "dpr:view",
    "drawings:markup",
  ),
  site_inspector: arr(
    // External read-only audit. Write-once assignment (trigger-enforced).
    "compliance:view", "audit:read",
    "drawings:markup",
    "rera:file",
  ),
  // pm absorbs the former project_head role (founder consolidation
  // 2026-06-04): gains project:settings:edit, budget:view,
  // ledger:view, export:csv on top of its own project-tier set.
  // Separation of Duties: PM creates but does NOT approve financial docs.
  pm: arr(
    "project:settings:edit",
    "progress:edit",
    "milestone:add", "milestone:edit", "milestone:delete",
    "update:add", "update:edit", "update:delete",
    "issue:add", "issue:resolve",
    "safety:close",
    "team:manage", "attendance:view", "attendance:mark",
    "compliance:view",
    "material:add", "material:edit",
    "po:create", "vendor:select",   // PMs raise POs and pick vendors in the form.
    "rfi:respond", "rfi:close",
    "changeorder:create",
    "expense:add",
    "rabill:create",
    "budget:view", "ledger:view",
    "dpr:view", "dpr:approve",
    "drawings:upload",
    "message:send", "whatsapp:send",
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "procurement:view",
    "export:pdf", "export:csv",
  ),
  project_admin: arr(
    "compliance:view", "rera:file", "gstn:file", "epfo:file",
    "invoice:create",
    "rabill:create",
    "po:approve",
    "milestone:add", "milestone:edit",
    "vendor:select",   // Picks vendors when creating invoices / RA bills.
    "budget:view", "ledger:view", "material:price:view",  // Financial context for invoice/RA bill creation.
    "time:log", "time:manage", "phase:manage",
    "deliverable:manage", "deliverable:approve",
    "review:comment", "review:manage",
    "utilization:view",
    "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
    "ffe:manage", "statutory:manage", "procurement:view",
    "export:pdf", "export:csv",
  ),
  contractor: arr(
    "update:add",
    "attendance:mark", "attendance:view",
    "material:add", "vendor:select",   // Receives material from approved vendors.
    "material:price:view",             // Cost context for RA bill creation.
    "rfi:create",
    "rabill:create",
    "photo:upload",
  ),
  sub_contractor: arr(
    "update:add",
    "attendance:mark", "attendance:view",
    "rfi:create",
    "photo:upload",
  ),
  client: arr(
    "dpr:view", "compliance:view",
    "handover:view", "handover:sign",
    "share:client:portal",
    "review:comment",
    "export:pdf",
  ),
  promoter: arr(
    // Promoter scoped to one project (e.g. a multi-firm partnership project).
    "dpr:view", "digest:subscribe", "digest:receive",
    "budget:view", "ledger:view", "compliance:view",
    "handover:view", "handover:sign",
    "export:pdf",
  ),
};

// ── Public API ─────────────────────────────────────────────────────────────
export function identityCapabilities(role: IdentityRole): Capability[] {
  return IDENTITY_CAPS[role] ?? [];
}
export function projectTierCapabilities(role: ProjectTierRole): Capability[] {
  return PROJECT_TIER_CAPS[role] ?? [];
}
