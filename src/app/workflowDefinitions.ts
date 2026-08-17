// SiteTrack Pro — VNext P1.1: workflow definition register (declare-first).
// Every status ladder in the app is declared HERE as a WorkflowDefinition and
// persisted to `workflow_definitions` (migration 207). The query files derive
// their historical `*_NEXT` maps from these defs via workflowNextMap, so the
// register is the single source of truth for status transitions — no more
// hand-maintained ladders scattered across query files.

import { defineWorkflow, type WorkflowDefinition } from "./workflowEngine";

// ── Material request (167): requested → approved → ordered → received ───────
export const MATERIAL_REQUEST_WORKFLOW = defineWorkflow({
  id: "material_request",
  name: "Material request",
  description: "requested → approved → ordered → received ladder",
  initial: "requested",
  states: ["requested", "approved", "ordered", "received"] as const,
  transitions: [
    { from: "requested", to: "approved" },
    { from: "approved", to: "ordered" },
    { from: "ordered", to: "received" },
  ],
});

// ── Corrective action (168): open → in_progress → resolved → verified ───────
export const CORRECTIVE_ACTION_WORKFLOW = defineWorkflow({
  id: "corrective_action",
  name: "Corrective action",
  description: "open → in_progress → resolved → verified ladder",
  initial: "open",
  states: ["open", "in_progress", "resolved", "verified"] as const,
  transitions: [
    { from: "open", to: "in_progress" },
    { from: "in_progress", to: "resolved" },
    { from: "resolved", to: "verified" },
  ],
});

// ── Statutory approval (152): draft → applied → approved|rejected → expired ─
// Faithful to the StatutoryTab ladder: approved stays put (advance no-op),
// rejected reopens to draft, expired reapplies; approved may lapse to expired.
export const STATUTORY_WORKFLOW = defineWorkflow({
  id: "statutory",
  name: "Statutory approval",
  description: "draft → applied → approved/rejected → expired NOC ladder",
  initial: "draft",
  states: ["draft", "applied", "approved", "rejected", "expired"] as const,
  transitions: [
    { from: "draft", to: "applied" },
    { from: "applied", to: "approved", primary: true },
    { from: "applied", to: "rejected" },
    { from: "approved", to: "approved", primary: true },
    { from: "approved", to: "expired" },
    { from: "rejected", to: "draft" },
    { from: "expired", to: "applied" },
  ],
});

// ── Retainer (142): active ⇄ paused, cancelled is terminal ──────────────────
export const RETAINER_WORKFLOW = defineWorkflow({
  id: "retainer",
  name: "Retainer",
  description: "active ⇄ paused; cancelled is terminal",
  initial: "active",
  states: ["active", "paused", "cancelled"] as const,
  transitions: [
    { from: "active", to: "paused" },
    { from: "paused", to: "active" },
  ],
});

// ── Inspection checklist (163): draft → in_progress → passed|failed ─────────
export const CHECKLIST_WORKFLOW = defineWorkflow({
  id: "checklist",
  name: "Inspection checklist",
  description: "draft → in_progress → passed/failed; cancelled reopens to draft",
  initial: "draft",
  states: ["draft", "in_progress", "passed", "failed", "cancelled"] as const,
  transitions: [
    { from: "draft", to: "in_progress" },
    { from: "in_progress", to: "passed", primary: true },
    { from: "in_progress", to: "failed" },
    { from: "passed", to: "passed" },
    { from: "failed", to: "failed" },
    { from: "cancelled", to: "draft" },
  ],
});

// ── Consultancy report (163): draft → published → archived ──────────────────
export const REPORT_WORKFLOW = defineWorkflow({
  id: "report",
  name: "Consultancy report",
  description: "draft → published → archived ladder",
  initial: "draft",
  states: ["draft", "published", "archived"] as const,
  transitions: [
    { from: "draft", to: "published" },
    { from: "published", to: "archived" },
    { from: "archived", to: "archived" },
  ],
});

// ── CRM lead (161): funnel new → … → won; lost is terminal ──────────────────
export const LEAD_WORKFLOW = defineWorkflow({
  id: "lead",
  name: "CRM lead",
  description: "funnel new → contacted → meeting_scheduled → quotation_sent → negotiating → agreement_signed → won; lost terminal",
  initial: "new",
  states: ["new", "contacted", "meeting_scheduled", "quotation_sent", "negotiating", "agreement_signed", "won", "lost"] as const,
  transitions: [
    { from: "new", to: "contacted" },
    { from: "contacted", to: "meeting_scheduled" },
    { from: "meeting_scheduled", to: "quotation_sent" },
    { from: "quotation_sent", to: "negotiating" },
    { from: "negotiating", to: "agreement_signed" },
    { from: "agreement_signed", to: "won" },
  ],
});

// ── Procurement quote (153): requested → received → selected|rejected ───────
export const QUOTE_WORKFLOW = defineWorkflow({
  id: "quote",
  name: "Procurement quote",
  description: "requested → received → selected; rejected re-enters received",
  initial: "requested",
  states: ["requested", "received", "selected", "rejected"] as const,
  transitions: [
    { from: "requested", to: "received" },
    { from: "received", to: "selected", primary: true },
    { from: "received", to: "rejected" },
    { from: "selected", to: "rejected" },
    { from: "rejected", to: "received" },
  ],
});

// ── Interior install (151): planned → ordered → installed ───────────────────
export const INSTALL_WORKFLOW = defineWorkflow({
  id: "install",
  name: "FF&E install",
  description: "planned → ordered → installed; cancelled reopens to planned",
  initial: "planned",
  states: ["planned", "ordered", "installed", "cancelled"] as const,
  transitions: [
    { from: "planned", to: "ordered" },
    { from: "ordered", to: "installed" },
    { from: "installed", to: "installed" },
    { from: "cancelled", to: "planned" },
  ],
});

// ── Room finish (151): planned → in_progress → installed ────────────────────
export const ROOM_FINISH_WORKFLOW = defineWorkflow({
  id: "room_finish",
  name: "Room finish",
  description: "planned → in_progress → installed; cancelled reopens to planned",
  initial: "planned",
  states: ["planned", "in_progress", "installed", "cancelled"] as const,
  transitions: [
    { from: "planned", to: "in_progress" },
    { from: "in_progress", to: "installed" },
    { from: "installed", to: "installed" },
    { from: "cancelled", to: "planned" },
  ],
});

// ── Register (for DB seeding / outbox hooks) ────────────────────────────────
export const WORKFLOW_REGISTRY: readonly WorkflowDefinition[] = [
  MATERIAL_REQUEST_WORKFLOW,
  CORRECTIVE_ACTION_WORKFLOW,
  STATUTORY_WORKFLOW,
  RETAINER_WORKFLOW,
  CHECKLIST_WORKFLOW,
  REPORT_WORKFLOW,
  LEAD_WORKFLOW,
  QUOTE_WORKFLOW,
  INSTALL_WORKFLOW,
  ROOM_FINISH_WORKFLOW,
];

export function workflowById(id: string): WorkflowDefinition | undefined {
  return WORKFLOW_REGISTRY.find(w => w.id === id);
}
