// VNext P1.1 — workflow engine: pure engine semantics + declare-first parity.
// The register (workflowDefinitions.ts) is the single source of truth; these
// tests lock both the engine behavior and that every derived *_NEXT map still
// equals the historical hand-rolled ladder values.

import { describe, it, expect } from "vitest";

import {
  defineWorkflow,
  nextStates,
  canTransition,
  transit,
  workflowNextMap,
  terminalStates,
  transitionActions,
  WorkflowError,
} from "@/app/workflowEngine";
import {
  MATERIAL_REQUEST_WORKFLOW,
  STATUTORY_WORKFLOW,
  RETAINER_WORKFLOW,
  CHECKLIST_WORKFLOW,
  REPORT_WORKFLOW,
  WORKFLOW_REGISTRY,
  workflowById,
} from "@/app/workflowDefinitions";
import { REQUEST_NEXT } from "@/app/materialRequestQueries";
import { CORRECTIVE_NEXT } from "@/app/qualityQueries";
import { STATUTORY_NEXT } from "@/app/statutoryQueries";
import { RETAINER_NEXT } from "@/app/retainerQueries";
import { CHECKLIST_STATUS_NEXT, REPORT_STATUS_NEXT, CL_STATUS_NEXT } from "@/app/consultancyAuditQueries";
import { LEAD_STAGE_NEXT } from "@/app/crmQueries";
import { QUOTE_NEXT } from "@/app/procurementQuotes";
import { INSTALL_NEXT, ROOM_FINISH_NEXT } from "@/app/interiorQueries";

// ── Engine: defineWorkflow validation ───────────────────────────────────────
describe("defineWorkflow", () => {
  it("accepts a valid linear definition", () => {
    const def = defineWorkflow({
      id: "t", name: "T", initial: "a",
      states: ["a", "b", "c"] as const,
      transitions: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    });
    expect(def.states).toHaveLength(3);
  });

  it("rejects an empty states array", () => {
    expect(() => defineWorkflow({
      id: "t", name: "T", initial: "a", states: [], transitions: [],
    })).toThrow(/at least one state/);
  });

  it("rejects an initial not in states", () => {
    expect(() => defineWorkflow({
      id: "t", name: "T", initial: "nope",
      states: ["a"] as const, transitions: [],
    })).toThrow(/initial/);
  });

  it("rejects transitions referencing unknown states", () => {
    expect(() => defineWorkflow({
      id: "t", name: "T", initial: "a",
      states: ["a", "b"] as const,
      transitions: [{ from: "a", to: "zzz" }],
    })).toThrow(/unknown state 'zzz'/);
  });

  it("rejects duplicate transitions", () => {
    expect(() => defineWorkflow({
      id: "t", name: "T", initial: "a",
      states: ["a", "b"] as const,
      transitions: [{ from: "a", to: "b" }, { from: "a", to: "b" }],
    })).toThrow(/duplicate transition/);
  });

  it("rejects a branching state without a primary transition", () => {
    expect(() => defineWorkflow({
      id: "t", name: "T", initial: "a",
      states: ["a", "b", "c"] as const,
      transitions: [{ from: "a", to: "b" }, { from: "a", to: "c" }],
    })).toThrow(/no transition is marked primary/);
  });
});

// ── Engine: nextStates / canTransition / transit ────────────────────────────
describe("nextStates / canTransition / transit", () => {
  it("lists all reachable states (branching included)", () => {
    expect(nextStates(CHECKLIST_WORKFLOW, "in_progress")).toEqual(["passed", "failed"]);
  });

  it("returns an empty list for terminal states", () => {
    expect(nextStates(MATERIAL_REQUEST_WORKFLOW, "received")).toEqual([]);
  });

  it("canTransition respects declared edges", () => {
    expect(canTransition(MATERIAL_REQUEST_WORKFLOW, "requested", "approved")).toBe(true);
    expect(canTransition(MATERIAL_REQUEST_WORKFLOW, "requested", "received")).toBe(false);
    expect(canTransition(MATERIAL_REQUEST_WORKFLOW, "received", "requested")).toBe(false);
  });

  it("canTransition enforces capability requirements when caps provided", () => {
    const def = defineWorkflow({
      id: "gated", name: "Gated", initial: "a",
      states: ["a", "b"] as const,
      transitions: [{ from: "a", to: "b", requires: ["approve:do"] }],
    });
    expect(canTransition(def, "a", "b")).toBe(true); // no caps → open
    expect(canTransition(def, "a", "b", new Set(["approve:do"]))).toBe(true);
    expect(canTransition(def, "a", "b", new Set(["other:cap"]))).toBe(false);
    expect(canTransition(def, "a", "b", new Set())).toBe(false);
  });

  it("transit returns the target for legal moves and throws WorkflowError otherwise", () => {
    expect(transit(MATERIAL_REQUEST_WORKFLOW, "approved", "ordered")).toBe("ordered");
    expect(() => transit(MATERIAL_REQUEST_WORKFLOW, "received", "requested")).toThrow(WorkflowError);
    expect(() => transit(MATERIAL_REQUEST_WORKFLOW, "requested", "received")).toThrow(/illegal transition/);
  });
});

// ── Engine: workflowNextMap / terminalStates / transitionActions ────────────
describe("workflowNextMap / terminalStates / transitionActions", () => {
  it("builds a single-next map with null terminal (linear ladder)", () => {
    const m = workflowNextMap(MATERIAL_REQUEST_WORKFLOW);
    expect(m).toEqual({ requested: "approved", approved: "ordered", ordered: "received", received: null });
  });

  it("picks the primary branch when several outbound transitions exist", () => {
    const m = workflowNextMap(CHECKLIST_WORKFLOW);
    expect(m.in_progress).toBe("passed");
  });

  it("keeps self-loop terminal states staying put", () => {
    const m = workflowNextMap(REPORT_WORKFLOW);
    expect(m.archived).toBe("archived");
  });

  it("terminalStates lists states with no outbound transitions", () => {
    expect(terminalStates(MATERIAL_REQUEST_WORKFLOW)).toEqual(["received"]);
    expect(terminalStates(RETAINER_WORKFLOW)).toEqual(["cancelled"]);
  });

  it("transitionActions lists edges with primary/requires metadata", () => {
    const acts = transitionActions(STATUTORY_WORKFLOW, "applied");
    expect(acts).toEqual([
      { to: "approved", requires: undefined, primary: true },
      { to: "rejected", requires: undefined, primary: undefined },
    ]);
  });
});

// ── Register: structure ─────────────────────────────────────────────────────
describe("workflow register", () => {
  it("has unique workflow ids and resolves by id", () => {
    const ids = WORKFLOW_REGISTRY.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(workflowById(id)?.id).toBe(id);
    expect(workflowById("nope")).toBeUndefined();
  });

  it("every registered workflow passes defineWorkflow validation (initial + all transitions resolve)", () => {
    for (const w of WORKFLOW_REGISTRY) {
      const def = defineWorkflow(w);
      expect(def.states).toContain(def.initial);
    }
  });
});

// ── Parity: derived *_NEXT maps equal historical hand-rolled ladders ───────
describe("declare-first parity (derived maps === historical values)", () => {
  it("REQUEST_NEXT (material request)", () => {
    expect(REQUEST_NEXT).toEqual({ requested: "approved", approved: "ordered", ordered: "received", received: null });
  });

  it("CORRECTIVE_NEXT (corrective action)", () => {
    expect(CORRECTIVE_NEXT).toEqual({ open: "in_progress", in_progress: "resolved", resolved: "verified", verified: null });
  });

  it("STATUTORY_NEXT (NOC: approved stays put, rejected→draft, expired→applied)", () => {
    expect(STATUTORY_NEXT).toEqual({ draft: "applied", applied: "approved", approved: "approved", rejected: "draft", expired: "applied" });
  });

  it("RETAINER_NEXT (retainer toggle, cancelled terminal)", () => {
    expect(RETAINER_NEXT).toEqual({ active: "paused", paused: "active", cancelled: null });
  });

  it("CHECKLIST_STATUS_NEXT + CL_STATUS_NEXT alias", () => {
    const expected = { draft: "in_progress", in_progress: "passed", passed: "passed", failed: "failed", cancelled: "draft" };
    expect(CHECKLIST_STATUS_NEXT).toEqual(expected);
    expect(CL_STATUS_NEXT).toEqual(expected);
  });

  it("REPORT_STATUS_NEXT", () => {
    expect(REPORT_STATUS_NEXT).toEqual({ draft: "published", published: "archived", archived: "archived" });
  });

  it("LEAD_STAGE_NEXT (Partial — terminal stages absent)", () => {
    expect(LEAD_STAGE_NEXT).toEqual({
      new: "contacted", contacted: "meeting_scheduled", meeting_scheduled: "quotation_sent",
      quotation_sent: "negotiating", negotiating: "agreement_signed", agreement_signed: "won",
    });
    expect(LEAD_STAGE_NEXT.won).toBeUndefined();
    expect(LEAD_STAGE_NEXT.lost).toBeUndefined();
  });

  it("QUOTE_NEXT (cycle rejected → received)", () => {
    expect(QUOTE_NEXT).toEqual({ requested: "received", received: "selected", selected: "rejected", rejected: "received" });
  });

  it("INSTALL_NEXT (terminal installed stays put, cancelled → planned)", () => {
    expect(INSTALL_NEXT).toEqual({ planned: "ordered", ordered: "installed", installed: "installed", cancelled: "planned" });
  });

  it("ROOM_FINISH_NEXT (terminal installed stays put, cancelled → planned)", () => {
    expect(ROOM_FINISH_NEXT).toEqual({ planned: "in_progress", in_progress: "installed", installed: "installed", cancelled: "planned" });
  });

  it("derived maps are also reachable via the registry defs (single source of truth)", () => {
    expect(workflowNextMap(workflowById("material_request")!)).toEqual(REQUEST_NEXT);
    expect(workflowNextMap(workflowById("corrective_action")!)).toEqual(CORRECTIVE_NEXT);
    expect(workflowNextMap(workflowById("statutory")!)).toEqual(STATUTORY_NEXT);
    expect(workflowNextMap(workflowById("retainer")!)).toEqual(RETAINER_NEXT);
    expect(workflowNextMap(workflowById("checklist")!)).toEqual(CHECKLIST_STATUS_NEXT);
    expect(workflowNextMap(workflowById("report")!)).toEqual(REPORT_STATUS_NEXT);
    expect(workflowNextMap(workflowById("quote")!)).toEqual(QUOTE_NEXT);
    expect(workflowNextMap(workflowById("install")!)).toEqual(INSTALL_NEXT);
    expect(workflowNextMap(workflowById("room_finish")!)).toEqual(ROOM_FINISH_NEXT);
  });
});