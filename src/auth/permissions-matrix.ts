// SiteTrack Pro — capability matrix for all 26 identity roles + 5 org tiers
// + 22 project tiers.
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
import type { IdentityRole, OrgTierRole, ProjectTierRole } from "./roles";

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
    "org:branding:manage", "org:features:configure",
    "compliance:view", "ledger:view", "budget:view",
    "export:pdf", "export:csv",
  ),
  promoter: arr(
    // Paying firm owner — sees finances + DPR digests + handover packets.
    "activity:view", "audit:read",
    "dpr:view", "digest:subscribe", "digest:receive",
    "budget:view", "ledger:view", "compliance:view",
    "handover:view", "handover:sign",
    "export:pdf", "export:csv",
  ),
  project_admin: arr(
    "activity:view", "audit:read",
    "compliance:view", "rera:file", "gstn:file", "epfo:file",
    "invoice:create", "invoice:approve",
    "rabill:create", "rabill:approve",
    "milestone:add", "milestone:edit",
    "export:pdf", "export:csv",
  ),
  prospector: arr(
    // Sales / BD — reads only the prospects they own.
    "activity:view",
    "project:create",   // Can create draft projects for prospects
  ),
  pm: arr(
    "activity:view",
    "project:create", "project:settings:edit",
    "progress:edit",
    "milestone:add", "milestone:edit", "milestone:delete",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "team:manage", "attendance:view", "attendance:mark",
    "material:add", "material:edit",
    "po:create",
    "rfi:respond", "rfi:close",
    "changeorder:create", "changeorder:approve",
    "expense:add", "expense:approve",
    "rabill:create",
    "budget:view", "ledger:view",
    "dpr:view", "dpr:approve",
    "drawings:upload",
    "message:send", "whatsapp:send",
    "export:pdf",
  ),

  // Design / architecture identities.
  architect: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "issue:add",
    "boq:edit", "estimate:edit",
    "update:add",
    "export:pdf",
  ),
  senior_architect: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond", "rfi:close",
    "changeorder:create", "changeorder:approve",
    "issue:add", "issue:resolve",
    "boq:edit", "estimate:edit",
    "team:manage",
    "update:add", "update:edit",
    "export:pdf",
  ),
  junior_architect: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:markup",
    "rfi:create",
    "update:add",
  ),
  design_architect_interior: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "material:add", "material:edit", "material:price:view",
    "rfi:create", "rfi:respond",
    "boq:edit",
    "update:add",
  ),
  interior_designer: arr(
    "activity:view",
    "drawings:upload", "drawings:markup",
    "material:add", "material:edit",
    "update:add",
  ),
  design_head: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "team:manage",
    "rfi:respond", "rfi:close",
    "changeorder:approve",
    "boq:edit", "estimate:edit",
    "update:add", "update:edit",
    "export:pdf",
  ),
  consultant_head: arr(
    "activity:view",
    "drawings:edit", "drawings:markup",
    "rfi:respond", "rfi:close",
    "changeorder:approve",
    "update:add",
    "export:pdf",
  ),
  designer: arr(
    "activity:view",
    "drawings:upload", "drawings:markup",
    "update:add",
  ),

  // Engineering disciplines.
  mep_consultant: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "inspection:create", "inspection:close",
    "update:add",
  ),
  structural_consultant: arr(
    "activity:view",
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "inspection:create", "inspection:close",
    "update:add",
  ),
  consultant: arr(
    "activity:view",
    "drawings:markup",
    "rfi:create", "rfi:respond",
    "update:add",
  ),
  civil_engineer: arr(
    "activity:view",
    "drawings:markup",
    "rfi:create",
    "issue:add",
    "inspection:create",
    "update:add",
  ),
  site_engineer: arr(
    "activity:view",
    "progress:edit",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "punchlist:add", "punchlist:close",
    "safety:report",
    "attendance:mark", "attendance:view", "labour:manage",
    "material:add", "material:edit",
    "rfi:create",
    "inspection:create", "inspection:close",
    "photo:upload",
    "dpr:submit", "dpr:approve", "dpr:view",
    "drawings:markup",
  ),

  // Field supervision.
  site_supervisor: arr(
    // Sprint 2 origin role — voice DPR + photo + minimal nav.
    "activity:view",
    "dpr:submit", "dpr:view",
    "voice:record", "photo:upload",
    "update:add",
    "issue:add",
    "attendance:mark",
    "safety:report",
  ),

  project_head: arr(
    "activity:view",
    "project:settings:edit",
    "progress:edit",
    "milestone:add", "milestone:edit",
    "team:manage",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "rfi:close",
    "changeorder:approve",
    "expense:approve",
    "rabill:approve",
    "budget:view", "ledger:view",
    "dpr:view", "dpr:approve",
    "export:pdf", "export:csv",
  ),

  // Supply chain.
  contractor: arr(
    "activity:view",
    "update:add",
    "attendance:mark", "attendance:view",
    "material:add",
    "rfi:create",
    "rabill:create",
    "photo:upload",
  ),
  sub_contractor: arr(
    "activity:view",
    "update:add",
    "attendance:mark",
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

// ── Org tier (org_members.role — 5 values) ────────────────────────────────
// What the user can do at the ORG level (across all projects in that org)
// based on their org_members.role.

const ORG_TIER_CAPS: Record<OrgTierRole, Capability[]> = {
  admin: arr(
    // Full org control. Maps to orgadmin identity + a bit more.
    "org:members:manage", "org:billing:manage", "org:integrations:manage",
    "org:templates:manage", "org:approvals:manage", "org:notifications:manage",
    "org:branding:manage", "org:features:configure",
    "project:create", "project:archive", "project:restore", "project:settings:edit",
    "team:manage",
    "compliance:view",
    "budget:view", "budget:edit", "ledger:view",
    "audit:read",
    "export:pdf", "export:csv",
    "share:project:public",
    "handover:generate",
  ),
  pm: arr(
    // Org-level PM tier — can create projects + assign members across the org.
    "project:create", "project:settings:edit",
    "team:manage",
    "compliance:view",
    "budget:view", "ledger:view",
    "audit:read",
    "export:pdf",
  ),
  architect: arr(
    // Org-tier architect — sees all org projects' drawings.
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "boq:edit", "estimate:edit",
  ),
  contractor: arr(
    // Org-tier contractor — minimal.
    "activity:view",
  ),
  client: arr(
    // Org-tier client (e.g. a buyer of multiple units in the org).
    "activity:view",
    "handover:view",
  ),
  vendor: arr(
    // Org-tier vendor — material supplier serving the org across projects.
    // Vendor portal: respond to quotes, raise invoices, see price master.
    "activity:view",
    "po:create",            // submit quote against a PO request
    "invoice:create",
    "material:price:view",
  ),
};

// ── Project tier (project_members.role — 22 values) ───────────────────────
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
  ),
  senior_architect: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond", "rfi:close",
    "changeorder:create", "changeorder:approve",
    "boq:edit", "estimate:edit",
    "team:manage",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
  ),
  junior_architect: arr(
    "drawings:upload", "drawings:edit", "drawings:markup",
    "rfi:create",
    "update:add",
  ),
  design_architect_interior: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "material:add", "material:edit",
    "rfi:create", "rfi:respond",
    "boq:edit",
    "update:add",
  ),
  interior_designer: arr(
    "drawings:upload", "drawings:markup",
    "material:add", "material:edit",
    "update:add",
  ),
  design_head: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "team:manage",
    "rfi:respond", "rfi:close",
    "changeorder:approve",
    "boq:edit", "estimate:edit",
    "update:add", "update:edit",
  ),
  consultant_head: arr(
    "drawings:edit", "drawings:markup",
    "rfi:respond", "rfi:close",
    "changeorder:approve",
    "update:add",
  ),
  designer: arr(
    "drawings:upload", "drawings:markup",
    "update:add",
  ),
  consultant: arr(
    "drawings:markup",
    "rfi:create", "rfi:respond",
    "update:add",
  ),
  mep_consultant: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "inspection:create", "inspection:close",
    "update:add",
  ),
  structural_consultant: arr(
    "drawings:upload", "drawings:edit", "drawings:release", "drawings:markup",
    "rfi:create", "rfi:respond",
    "changeorder:create",
    "inspection:create", "inspection:close",
    "update:add",
  ),
  site_engineer: arr(
    "progress:edit",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "punchlist:add", "punchlist:close",
    "safety:report",
    "attendance:mark", "attendance:view", "labour:manage",
    "material:add", "material:edit",
    "rfi:create",
    "inspection:create", "inspection:close",
    "photo:upload",
    "dpr:submit", "dpr:approve", "dpr:view",
    "drawings:markup",
  ),
  civil_engineer: arr(
    "drawings:markup",
    "rfi:create",
    "issue:add",
    "inspection:create",
    "update:add",
  ),
  site_supervisor: arr(
    // The Sprint 2 voice DPR origin role.
    "dpr:submit", "dpr:view",
    "voice:record", "photo:upload",
    "update:add",
    "issue:add",
    "attendance:mark",
    "safety:report",
  ),
  site_inspector: arr(
    // External read-only audit. Write-once assignment (trigger-enforced).
    "compliance:view", "audit:read",
    "drawings:markup",
    "rera:file",
  ),
  pm: arr(
    "progress:edit",
    "milestone:add", "milestone:edit", "milestone:delete",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "team:manage", "attendance:view", "attendance:mark",
    "material:add", "material:edit",
    "po:create",
    "rfi:respond", "rfi:close",
    "changeorder:create", "changeorder:approve",
    "expense:add", "expense:approve",
    "rabill:create",
    "dpr:view", "dpr:approve",
    "drawings:upload",
    "message:send", "whatsapp:send",
    "export:pdf",
  ),
  project_admin: arr(
    "compliance:view", "rera:file", "gstn:file", "epfo:file",
    "invoice:create", "invoice:approve",
    "rabill:create", "rabill:approve",
    "milestone:add", "milestone:edit",
    "export:pdf", "export:csv",
  ),
  project_head: arr(
    "project:settings:edit",
    "progress:edit",
    "milestone:add", "milestone:edit",
    "team:manage",
    "update:add", "update:edit",
    "issue:add", "issue:resolve",
    "rfi:close",
    "changeorder:approve",
    "expense:approve",
    "rabill:approve",
    "budget:view", "ledger:view",
    "dpr:view", "dpr:approve",
    "export:pdf", "export:csv",
  ),
  contractor: arr(
    "update:add",
    "attendance:mark", "attendance:view",
    "material:add",
    "rfi:create",
    "rabill:create",
    "photo:upload",
  ),
  sub_contractor: arr(
    "update:add",
    "attendance:mark",
    "rfi:create",
    "photo:upload",
  ),
  client: arr(
    "dpr:view", "compliance:view",
    "handover:view", "handover:sign",
    "share:client:portal",
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
export function orgTierCapabilities(role: OrgTierRole): Capability[] {
  return ORG_TIER_CAPS[role] ?? [];
}
export function projectTierCapabilities(role: ProjectTierRole): Capability[] {
  return PROJECT_TIER_CAPS[role] ?? [];
}
