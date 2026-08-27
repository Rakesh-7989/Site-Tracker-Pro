// SiteTrack Pro — global search query + url helper tests.

import { describe, it, expect } from "vitest";
import { globalSearch, hitUrl, type SearchHit } from "@/app/queries/searchQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }, spy?: (args: unknown) => void): any => ({
  rpc: async (_name: string, args: unknown) => { spy?.(args); return result; },
});

describe("globalSearch", () => {
  it("short-circuits queries under 2 chars (no RPC call)", async () => {
    let called = false;
    const r = await globalSearch(rpcClient({ data: [], error: null }, () => { called = true; }), "a");
    expect(r).toEqual({ ok: true, data: [] });
    expect(called).toBe(false);
  });
  it("maps hits + coerces kind; surfaces error", async () => {
    const r = await globalSearch(rpcClient({ data: [
      { kind: "project", id: "p1", project_id: "p1", label: "Tower A", sublabel: "Hyderabad" },
      { kind: "weird", id: "x", project_id: null, label: "Vend", sublabel: "" },
    ], error: null }), "tow");
    expect(r.ok && r.data[0]).toMatchObject({ kind: "project", label: "Tower A", projectId: "p1" });
    expect(r.ok && r.data[1].kind).toBe("task"); // fallback
    const e = await globalSearch(rpcClient({ data: null, error: { message: "x" } }), "tow");
    expect(e).toEqual({ ok: false, error: "x" });
  });
});

describe("hitUrl", () => {
  const mk = (kind: SearchHit["kind"], id: string, projectId: string | null): SearchHit => ({ kind, id, projectId, label: "", sublabel: "" });
  it("routes each kind correctly", () => {
    expect(hitUrl(mk("project", "p1", "p1"))).toBe("/projects/p1");
    expect(hitUrl(mk("vendor", "v1", null))).toBe("/vendors");
    expect(hitUrl(mk("milestone", "m1", "p2"))).toBe("/projects/p2/milestones");
    expect(hitUrl(mk("task", "t1", "p3"))).toBe("/projects/p3/tasks");
  });
});
