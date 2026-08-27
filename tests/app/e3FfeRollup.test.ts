// SiteTrack Pro — v4 E3 cross-project FF&E rollup tests.
// Pure ffeOrgRollup aggregations + listOrgFfe query mapper (project list via
// listProjectsByType, then one `.in(project_id)` fetch grouped back by project).

import { describe, it, expect } from "vitest";
import {
  ffeOrgRollup, listOrgFfe,
  FFE_STATUSES, FFE_CATEGORIES,
  type FfeOrgProject,
} from "@/app/queries/ffeQueries";

const entry = (status: "specified" | "selected" | "ordered" | "installed" | "cancelled", category: "furniture" | "fixture" | "equipment", qty: number, unitCost: number) => ({ qty, unitCost, status, category });

describe("ffeQueries ffeOrgRollup", () => {
  it("aggregates committed + procured across projects (cancelled excluded)", () => {
    const r = ffeOrgRollup([
      { projectId: "p1", name: "Lobby Fit-out", type: "interior", entries: [
        entry("specified", "furniture", 4, 2500),
        entry("ordered", "fixture", 2, 10000),
        entry("cancelled", "equipment", 1, 5000),
      ]},
      { projectId: "p2", name: "HQ Build", type: "design", entries: [
        entry("installed", "furniture", 1, 30000),
      ]},
    ]);
    expect(r.projects).toBe(2);
    expect(r.entries).toBe(4);
    // p1: 4×2500 + 2×10000 = 30000 (cancelled excluded); p2: 1×30000
    expect(r.committed).toBe(60000);
    // ordered + installed only
    expect(r.procured).toBe(50000);
  });

  it("seeds status buckets in canonical order incl. zero slots", () => {
    const r = ffeOrgRollup([
      { projectId: "p1", name: "P", type: null, entries: [entry("installed", "furniture", 1, 100)] },
    ]);
    expect(r.byStatus.map(b => b.key)).toEqual([...FFE_STATUSES]);
    const installed = r.byStatus.find(b => b.key === "installed");
    const cancelled = r.byStatus.find(b => b.key === "cancelled");
    expect(installed?.count).toBe(1);
    expect(installed?.committed).toBe(100);
    expect(cancelled?.count).toBe(0);
    expect(cancelled?.committed).toBe(0);
  });

  it("seeds category buckets in canonical order", () => {
    const r = ffeOrgRollup([
      { projectId: "p1", name: "P", type: null, entries: [entry("ordered", "fixture", 3, 200)] },
    ]);
    expect(r.byCategory.map(b => b.key)).toEqual([...FFE_CATEGORIES]);
    const fixture = r.byCategory.find(b => b.key === "fixture");
    expect(fixture?.count).toBe(1);
    expect(fixture?.committed).toBe(600);
  });

  it("sorts per-project rows by committed descending", () => {
    const r = ffeOrgRollup([
      { projectId: "p1", name: "A", type: "design", entries: [entry("specified", "furniture", 1, 10)] },
      { projectId: "p2", name: "B", type: "interior", entries: [entry("specified", "furniture", 1, 500)] },
      { projectId: "p3", name: "C", type: "design", entries: [] },
    ]);
    expect(r.byProject.map(p => p.projectId)).toEqual(["p2", "p1", "p3"]);
    const p2 = r.byProject.find(p => p.projectId === "p2");
    expect(p2?.committed).toBe(500);
    expect(p2?.procured).toBe(0);
    expect(p2?.count).toBe(1);
    const p3 = r.byProject.find(p => p.projectId === "p3");
    expect(p3?.count).toBe(0);
  });

  it("returns a zero rollup for no projects", () => {
    const r = ffeOrgRollup([]);
    expect(r.projects).toBe(0);
    expect(r.entries).toBe(0);
    expect(r.committed).toBe(0);
    expect(r.procured).toBe(0);
    expect(r.byProject).toEqual([]);
  });
});

describe("ffeQueries listOrgFfe", () => {
  const chain = (result: { data?: unknown; error?: unknown }) => ({
    select: () => ({ eq: () => ({ in: () => result }), in: () => result }),
  });
  const mockClient = (opts: { projects?: { data?: unknown; error?: unknown }; ffe?: { data?: unknown; error?: unknown } }) => ({
    from: (table: string) => (table === "projects"
      ? chain(opts.projects ?? { data: [], error: null })
      : chain(opts.ffe ?? { data: [], error: null })),
  });

  it("groups ffe rows back under their project, camelCase-mapped", async () => {
    const client = mockClient({
      projects: { data: [{ id: "p1", name: "Lobby", type: "interior" }, { id: "p2", name: "HQ", type: "design" }], error: null },
      ffe: {
        data: [
          { id: "e1", project_id: "p1", code: "F-01", category: "furniture", name: "Sofa", space_or_room: "Lobby", manufacturer: "X", model: null, finish: null, dimensions: null, qty: 4, unit_cost: 2500, status: "ordered", notes: null, created_at: "2026-08-01" },
          { id: "e2", project_id: "p2", code: "EQ-01", category: "equipment", name: "Projector", space_or_room: "Studio", manufacturer: null, model: null, finish: null, dimensions: null, qty: 1, unit_cost: 80000, status: "specified", notes: "warranty", created_at: "2026-08-02" },
        ],
        error: null,
      },
    });
    const r = await listOrgFfe(client, "org-1");
    expect(r.ok).toBe(true);
    const data = (r as { ok: true; data: FfeOrgProject[] }).data;
    expect(data.length).toBe(2);
    const p1 = data.find(p => p.projectId === "p1")!;
    expect(p1.name).toBe("Lobby");
    expect(p1.entries).toHaveLength(1);
    expect(p1.entries[0]).toMatchObject({ id: "e1", category: "furniture", qty: 4, unitCost: 2500, status: "ordered", spaceOrRoom: "Lobby" });
    const p2 = data.find(p => p.projectId === "p2")!;
    expect(p2.entries[0].name).toBe("Projector");
    expect(p2.entries[0].notes).toBe("warranty");
  });

  it("yields projects with empty entries when no ffe rows exist", async () => {
    const client = mockClient({
      projects: { data: [{ id: "p1", name: "Lobby", type: "interior" }], error: null },
      ffe: { data: [], error: null },
    });
    const r = await listOrgFfe(client, "org-1");
    expect(r.ok).toBe(true);
    const data = (r as { ok: true; data: FfeOrgProject[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0].entries).toEqual([]);
  });

  it("short-circuits to empty when the org has no design/interior projects", async () => {
    const client = mockClient({ projects: { data: [], error: null } });
    const r = await listOrgFfe(client, "org-1");
    expect(r).toEqual({ ok: true, data: [] });
  });

  it("propagates project-list errors", async () => {
    const client = mockClient({ projects: { data: null, error: { message: "rls denied" } } });
    const r = await listOrgFfe(client, "org-1");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("rls denied");
  });

  it("propagates ffe-row errors", async () => {
    const client = mockClient({
      projects: { data: [{ id: "p1", name: "Lobby", type: "interior" }], error: null },
      ffe: { data: null, error: { message: "boom" } },
    });
    const r = await listOrgFfe(client, "org-1");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("boom");
  });
});
