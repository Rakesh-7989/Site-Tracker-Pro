// SiteTrack Pro — site-ops query tests (Batch 2: materials/safety/inspections/punch).

import { describe, it, expect } from "vitest";
import { listMaterials, listSafety, listInspections, listPunch } from "@/app/siteOpsQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });

describe("listMaterials", () => {
  it("maps + coerces bad status", async () => {
    const r = await listMaterials(mockClient({ data: [
      { id: "1", material: "TMT", quantity: "5t", supplier: "Vizag", delivery_date: "2026-07-01", status: "received" },
      { id: "2", material: "Cement", quantity: null, supplier: null, delivery_date: null, status: "weird" },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ material: "TMT", status: "received", quantity: "5t" });
    expect(r.ok && r.data[1].status).toBe("expected");
  });
});

describe("listSafety", () => {
  it("maps + coerces severity/status", async () => {
    const r = await listSafety(mockClient({ data: [
      { id: "1", description: "Fall", severity: "major", category: "fall", location: "L2", action_taken: "x", status: "open", incident_date: "2026-06-10" },
      { id: "2", description: "X", severity: "weird", category: null, location: null, action_taken: null, status: "weird", incident_date: "2026-06-11" },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ severity: "major", status: "open" });
    expect(r.ok && r.data[1]).toMatchObject({ severity: "near_miss", status: "open" });
  });
});

describe("listInspections", () => {
  it("maps + coerces result", async () => {
    const r = await listInspections(mockClient({ data: [
      { id: "1", type: "quality", scope: "slab", inspector_name: "R", scheduled_date: "2026-06-20", result: "pass" },
      { id: "2", type: "safety", scope: null, inspector_name: null, scheduled_date: null, result: "weird" },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ type: "quality", result: "pass" });
    expect(r.ok && r.data[1].result).toBe("pending");
  });
});

describe("listPunch", () => {
  it("maps + coerces severity/status + surfaces error", async () => {
    const r = await listPunch(mockClient({ data: [
      { id: "1", location: "4B", defect: "Paint", trade: "finishing", severity: "high", assigned_to: "X", status: "open" },
      { id: "2", location: "5A", defect: "Crack", trade: null, severity: "weird", assigned_to: null, status: "weird" },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ severity: "high", status: "open" });
    expect(r.ok && r.data[1]).toMatchObject({ severity: "medium", status: "open" });
    const e = await listPunch(mockClient({ data: null, error: { message: "denied" } }), "p");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});
