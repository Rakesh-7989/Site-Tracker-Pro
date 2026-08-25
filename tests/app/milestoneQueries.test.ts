// SiteTrack Pro — milestone queries (v3 port, Batch 1) tests.

import { describe, it, expect } from "vitest";
import { listMilestones, nextStatus, setMilestoneStatus } from "@/app/milestoneQueries";
import type { TypedSupabaseClient } from "@/lib/db";

// Mock query chains are structural fakes — bridge them to the typed client once.
const asTyped = (c: unknown): TypedSupabaseClient => c as unknown as TypedSupabaseClient;

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
    const r = await listMilestones(asTyped(c), "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data[0]).toMatchObject({ id: "m1", title: "Foundation", status: "in_progress", dueDate: "2026-07-01" });
      expect(r.data[1].status).toBe("pending");   // coerced
    }
  });

  it("surfaces an error", async () => {
    const r = await listMilestones(asTyped(mockClient({ data: null, error: { message: "permission denied" } })), "p-1");
    expect(r).toEqual({ ok: false, error: "permission denied" });
  });

  it("maps the version column (defaults to 1 when absent)", async () => {
    const c = mockClient({ data: [
      { id: "m1", title: "A", status: "pending", due_date: null, completed_date: null, sort_order: 0, version: 4 },
      { id: "m2", title: "B", status: "pending", due_date: null, completed_date: null, sort_order: 1 },
    ], error: null });
    const r = await listMilestones(asTyped(c), "p-1");
    if (r.ok) {
      expect(r.data[0].version).toBe(4);
      expect(r.data[1].version).toBe(1);
    }
  });
});

describe("setMilestoneStatus versioning (migration 238)", () => {
  function recordingChain(result: { data?: unknown; error?: unknown }) {
    const calls: Array<[string, ...unknown[]]> = [];
    const c: Record<string, any> = {};
    for (const m of ["update", "eq", "select"]) {
      c[m] = (...args: unknown[]) => { calls.push([m, ...args]); return c; };
    }
    c.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return { chain: c, calls };
  }

  it("guarded write adds .eq('version', v) + .select and succeeds on a match", async () => {
    const { chain, calls } = recordingChain({ data: [{ id: "m1" }], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { from: () => chain as any };
    const r = await setMilestoneStatus(asTyped(client), "m1", "completed", { expectedVersion: 2 });
    expect(r).toEqual({ ok: true, data: { ok: true } });
    expect(calls).toContainEqual(["eq", "version", 2]);
    expect(calls.some(x => x[0] === "select")).toBe(true);
    expect(calls.filter(x => x[0] === "eq").length).toBeGreaterThanOrEqual(2); // id + version
  });

  it("guarded write reports a conflict on zero matched rows", async () => {
    const { chain } = recordingChain({ data: [], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { from: () => chain as any };
    const r = await setMilestoneStatus(asTyped(client), "m1", "completed", { expectedVersion: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflict).toBe(true);
  });

  it("unguarded write keeps legacy semantics (no select)", async () => {
    const { chain, calls } = recordingChain({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { from: () => chain as any };
    const r = await setMilestoneStatus(asTyped(client), "m1", "in_progress");
    expect(r).toEqual({ ok: true, data: { ok: true } });
    expect(calls.some(x => x[0] === "select")).toBe(false);
    expect(calls.some(x => x[0] === "eq" && x[1] === "version")).toBe(false);
  });

  it("surfaces builder errors without marking them conflicts", async () => {
    const { chain } = recordingChain({ data: null, error: { message: "42501 approval required" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { from: () => chain as any };
    const r = await setMilestoneStatus(asTyped(client), "m1", "completed", { expectedVersion: 1 });
    expect(r).toEqual({ ok: false, error: "42501 approval required", conflict: false });
  });
});
