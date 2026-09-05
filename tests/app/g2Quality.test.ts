// SiteTrack Pro — v4 Phase G2: construction quality — corrective actions pure helpers + query mappers.

import { describe, it, expect } from "vitest";
import {
  listCorrectiveActions, createCorrectiveAction, setCorrectiveStatus, deleteCorrectiveAction,
  correctiveRollup, CORRECTIVE_NEXT, CORRECTIVE_STATUS_LABEL, CORRECTIVE_PRIORITY_LABEL,
  type CorrectiveAction, type CorrectiveStatus,
} from "@/app/queries/qualityQueries";

const act = (status: CorrectiveStatus, priority: CorrectiveAction["priority"] = "medium"): CorrectiveAction => ({
  id: "x", projectId: "proj", inspectionId: null, description: "Re-level slab", priority, status,
  assignedTo: null, dueDate: null, openedByName: "Ravi", openedAt: "",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (result: { data?: unknown; error?: unknown }): any => {
  const chain = {
    select: () => chain, insert: () => chain, update: () => chain, delete: () => chain,
    single: async () => result, eq: () => chain, order: async () => result,
  };
  return { from: () => chain };
};

describe("pure corrective-action helpers", () => {
  it("CORRECTIVE_NEXT walks open → in_progress → resolved → verified", () => {
    expect(CORRECTIVE_NEXT.open).toBe("in_progress");
    expect(CORRECTIVE_NEXT.in_progress).toBe("resolved");
    expect(CORRECTIVE_NEXT.resolved).toBe("verified");
    expect(CORRECTIVE_NEXT.verified).toBeNull();
  });
  it("labels cover every status + priority", () => {
    expect(CORRECTIVE_STATUS_LABEL.verified).toBe("Verified");
    expect(CORRECTIVE_PRIORITY_LABEL.critical).toBe("Critical");
  });
  it("correctiveRollup buckets statuses + highlights critical/high", () => {
    const r = correctiveRollup([act("open", "critical"), act("open", "high"), act("in_progress"), act("resolved"), act("verified")]);
    expect(r).toMatchObject({ total: 5, open: 2, inProgress: 1, resolved: 1, verified: 1, critical: 1, high: 1 });
  });
  it("correctiveRollup empty", () => {
    expect(correctiveRollup([])).toMatchObject({ total: 0, open: 0, inProgress: 0, resolved: 0, verified: 0, critical: 0, high: 0 });
  });
});

describe("query mappers", () => {
  it("listCorrectiveActions maps fields + joins opened_by + coerces", async () => {
    const r = await listCorrectiveActions(from({ data: [
      { id: "1", project_id: "proj", inspection_id: "ins", description: "A", priority: "critical", status: "open", assigned_to: "Suresh", due_date: "2026-08-20", opened_by: { name: "Ravi" }, opened_at: "2026-08-10T00:00:00" },
      { id: "2", project_id: "proj", inspection_id: null, description: "B", priority: "weird", status: "bogus", assigned_to: null, due_date: null, opened_by: null, opened_at: null },
    ], error: null }), "proj");
    expect(r.ok && r.data).toMatchObject([
      { id: "1", projectId: "proj", inspectionId: "ins", description: "A", priority: "critical", status: "open", assignedTo: "Suresh", dueDate: "2026-08-20", openedByName: "Ravi" },
      { id: "2", inspectionId: null, description: "B", priority: "medium", status: "open", assignedTo: null, openedByName: null },
    ]);
  });
  it("listCorrectiveActions surfaces errors", async () => {
    const r = await listCorrectiveActions(from({ data: null, error: { message: "nope" } }), "proj");
    expect(r).toEqual({ ok: false, error: "nope" });
  });
  it("createCorrectiveAction inserts body defaulting priority/status", async () => {
    let inserted: Record<string, unknown> | null = null;
    const client = {
      from: () => {
        const chain = {
          insert: (row: unknown) => { inserted = row as Record<string, unknown>; return chain; },
          select: () => chain, single: async () => ({ data: { id: "new" }, error: null }), eq: () => chain, order: () => chain,
        };
        return chain;
      },
    };
    const r = await createCorrectiveAction(client, { projectId: "proj", description: "Re-level", priority: "high", dueDate: "2026-08-20" });
    expect(r.ok && r.data?.id).toBe("new");
    expect(inserted).toMatchObject({ project_id: "proj", description: "Re-level", priority: "high", status: "open", due_date: "2026-08-20", assigned_to: null, inspection_id: null });
  });
  it("setCorrectiveStatus stamps verified_by only on verified", async () => {
    let patch: unknown = null;
    const client = { from: () => ({ update: (p: unknown) => { patch = p; return { eq: async () => ({ data: null, error: null }) }; } }) };
    await setCorrectiveStatus(client, "1", "in_progress");
    expect(patch).toMatchObject({ status: "in_progress" });
    await setCorrectiveStatus(client, "1", "verified", { verifiedBy: "u1" });
    expect(patch).toMatchObject({ status: "verified", verified_by: "u1" });
  });
  it("setCorrectiveStatus surfaces errors", async () => {
    const client = { from: () => ({ update: () => ({ eq: async () => ({ data: null, error: { message: "denied" } }) }) }) };
    const r = await setCorrectiveStatus(client, "1", "verified", { verifiedBy: "u1" });
    expect(r).toEqual({ ok: false, error: "denied" });
  });
  it("deleteCorrectiveAction surfaces errors", async () => {
    const client = { from: () => ({ delete: () => ({ eq: async () => ({ data: null, error: { message: "gone" } }) }) }) };
    const r = await deleteCorrectiveAction(client, "1");
    expect(r).toEqual({ ok: false, error: "gone" });
  });
});
