// SiteTrack Pro — Batch 1 ported-tab query tests (tasks / updates / issues).

import { describe, it, expect } from "vitest";
import { listTasks, nextTaskStatus } from "@/app/queries/taskQueries";
import { listUpdates } from "@/app/queries/updateQueries";
import { listIssues } from "@/app/queries/issueQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });

describe("tasks", () => {
  it("nextTaskStatus cycles", () => {
    expect(nextTaskStatus("pending")).toBe("in_progress");
    expect(nextTaskStatus("completed")).toBe("pending");
  });
  it("listTasks maps + coerces bad priority/status", async () => {
    const r = await listTasks(mockClient({ data: [
      { id: "t1", title: "Steel", assignee_name: "Ravi", due_date: "2026-07-01", priority: "high", status: "in_progress" },
      { id: "t2", title: "X", assignee_name: null, due_date: null, priority: "weird", status: "weird" },
    ], error: null }), "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data[0]).toMatchObject({ id: "t1", assigneeName: "Ravi", priority: "high", status: "in_progress" });
      expect(r.data[1]).toMatchObject({ priority: "medium", status: "pending", assigneeName: null });
    }
  });
});

describe("updates", () => {
  it("listUpdates maps nested author name + numbers", async () => {
    const r = await listUpdates(mockClient({ data: [
      { id: "u1", notes: "Slab poured", weather: "Sunny", workers_count: 18, update_date: "2026-06-15", profiles: { name: "Sharma" } },
    ], error: null }), "p-1");
    expect(r.ok && r.data[0]).toMatchObject({ notes: "Slab poured", weather: "Sunny", workersCount: 18, authorName: "Sharma" });
  });
});

describe("issues", () => {
  it("listIssues maps + coerces severity/status", async () => {
    const r = await listIssues(mockClient({ data: [
      { id: "i1", title: "Seepage", description: "Basement", severity: "high", status: "open", reported_date: "2026-06-10", resolved_date: null },
      { id: "i2", title: "Y", description: null, severity: "weird", status: "weird", reported_date: null, resolved_date: null },
    ], error: null }), "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data[0]).toMatchObject({ severity: "high", status: "open" });
      expect(r.data[1]).toMatchObject({ severity: "medium", status: "open" });   // coerced
    }
  });
  it("surfaces an error", async () => {
    const r = await listIssues(mockClient({ data: null, error: { message: "denied" } }), "p-1");
    expect(r).toEqual({ ok: false, error: "denied" });
  });
});
