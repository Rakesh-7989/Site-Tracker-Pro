// SiteTrack Pro — Phase E Opt2: persisted design_workflow query layer tests.
import { describe, it, expect } from "vitest";
import {
  designStageFromOrder, MAX_DESIGN_STAGE_ORDER,
  getDesignWorkflow, ensureDesignWorkflow, advanceDesignWorkflow,
  approveDesignWorkflow, resetDesignWorkflow,
} from "@/app/queries/designWorkflowQueries";

describe("designStageFromOrder", () => {
  it("maps ladder indices to canonical stages", () => {
    expect(designStageFromOrder(0)).toBe("requirements");
    expect(designStageFromOrder(1)).toBe("concept");
    expect(designStageFromOrder(2)).toBe("floorplan");
    expect(designStageFromOrder(3)).toBe("elevation");
    expect(designStageFromOrder(4)).toBe("3d");
    expect(designStageFromOrder(5)).toBe("client_review");
    expect(designStageFromOrder(6)).toBe("approved");
    expect(MAX_DESIGN_STAGE_ORDER).toBe(6);
  });

  it("clamps out-of-range orders", () => {
    expect(designStageFromOrder(-5)).toBe("requirements");
    expect(designStageFromOrder(99)).toBe("approved");
  });
});

describe("designWorkflow CRUD (mock client)", () => {
  it("getDesignWorkflow maps a row and absent→null", async () => {
    const row = { project_id: "p1", stage_order: 4, review_note: null, reviewed_by: null, reviewed_at: null, approved_by: null, approved_at: null };
    const c = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }) };
    const res = await getDesignWorkflow(c, "p1");
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.data?.stageOrder).toBe(4); expect(res.data?.stage).toBe("3d"); expect(res.data?.projectId).toBe("p1"); }
  });

  it("getDesignWorkflow absent → null result", async () => {
    const c = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) };
    const res = await getDesignWorkflow(c, "p1");
    expect(res.ok && res.data === null).toBe(true);
  });

  it("advance bumps from 2 to 3 when no explicit target", async () => {
    let upsertArg: unknown;
    const c = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { project_id: "p1", stage_order: 2, review_note: null, reviewed_by: null, reviewed_at: null, approved_by: null, approved_at: null }, error: null }) }) }),
        upsert: (arg: unknown) => { upsertArg = arg; return { onConflict: () => Promise.resolve({ error: null }) }; },
      }),
    };
    const res = await advanceDesignWorkflow(c, "p1");
    expect(res.ok).toBe(true);
    expect((upsertArg as { stage_order: number }).stage_order).toBe(3);
  });

  it("advance to an explicit earlier target clamps to current", async () => {
    let upsertArg: unknown;
    const c = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { project_id: "p1", stage_order: 4, review_note: null, reviewed_by: null, reviewed_at: null, approved_by: null, approved_at: null }, error: null }) }) }),
        upsert: (arg: unknown) => { upsertArg = arg; return { onConflict: () => Promise.resolve({ error: null }) }; },
      }),
    };
    const res = await advanceDesignWorkflow(c, "p1", "concept");
    expect(res.ok).toBe(true);
    expect((upsertArg as { stage_order: number }).stage_order).toBe(4);
  });

  it("approve locks at approved (6) with approver", async () => {
    let upsertArg: unknown;
    const c = {
      from: () => ({ upsert: (arg: unknown) => { upsertArg = arg; return { onConflict: () => Promise.resolve({ error: null }) }; } }),
    };
    const res = await approveDesignWorkflow(c, "p1", "u9");
    expect(res.ok).toBe(true);
    expect((upsertArg as { stage_order: number }).stage_order).toBe(6);
    expect((upsertArg as { approved_by: string }).approved_by).toBe("u9");
  });

  it("reset sends stage to 0 and clears annotations", async () => {
    let upsertArg: unknown;
    const c = {
      from: () => ({ upsert: (arg: unknown) => { upsertArg = arg; return { onConflict: () => Promise.resolve({ error: null }) }; } }),
    };
    const res = await resetDesignWorkflow(c, "p1");
    expect(res.ok).toBe(true);
    const up = upsertArg as { stage_order: number; approved_at: null; review_note: null };
    expect(up.stage_order).toBe(0);
    expect(up.approved_at).toBeNull();
    expect(up.review_note).toBeNull();
  });

  it("ensureDesignWorkflow upserts an empty row at 0", async () => {
    let upsertArg: unknown;
    const c = { from: () => ({ upsert: (arg: unknown) => { upsertArg = arg; return { onConflict: () => Promise.resolve({ error: null }) }; } }) };
    const res = await ensureDesignWorkflow(c, "p1");
    expect(res.ok).toBe(true);
    expect((upsertArg as { stage_order: number }).stage_order).toBe(0);
  });

  it("propagates a select error from getDesignWorkflow", async () => {
    const c = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) }) };
    const res = await getDesignWorkflow(c, "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("boom");
  });
});