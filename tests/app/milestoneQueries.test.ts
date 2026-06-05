// SiteTrack Pro — milestone queries (v3 port, Batch 1) tests.

import { describe, it, expect } from "vitest";
import { listMilestones, nextStatus } from "@/app/milestoneQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });

describe("nextStatus", () => {
  it("cycles pending → in_progress → completed → pending", () => {
    expect(nextStatus("pending")).toBe("in_progress");
    expect(nextStatus("in_progress")).toBe("completed");
    expect(nextStatus("completed")).toBe("pending");
  });
});

describe("listMilestones", () => {
  it("maps rows + coerces an unknown status to pending", async () => {
    const c = mockClient({ data: [
      { id: "m1", title: "Foundation", status: "in_progress", due_date: "2026-07-01", completed_date: null, sort_order: 0 },
      { id: "m2", title: "Roof", status: "weird", due_date: null, completed_date: null, sort_order: 1 },
    ], error: null });
    const r = await listMilestones(c, "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data[0]).toMatchObject({ id: "m1", title: "Foundation", status: "in_progress", dueDate: "2026-07-01" });
      expect(r.data[1].status).toBe("pending");   // coerced
    }
  });

  it("surfaces an error", async () => {
    const r = await listMilestones(mockClient({ data: null, error: { message: "permission denied" } }), "p-1");
    expect(r).toEqual({ ok: false, error: "permission denied" });
  });
});
