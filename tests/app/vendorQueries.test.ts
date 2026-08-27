// SiteTrack Pro — vendor directory query tests.

import { describe, it, expect } from "vitest";
import { listVendors, createVendor, vendorOptionGroups } from "@/app/queries/vendorQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert", "single"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (result: { data?: unknown; error?: unknown }): any => ({ from: () => chain(result) });

describe("listVendors", () => {
  it("maps fields + coerces rating; surfaces error", async () => {
    const r = await listVendors(client({ data: [
      { id: "1", name: "ABC", category: "Cement", contact: "Ram", phone: "999", gst: "29ABC", rating: 4 },
      { id: "2", name: "X", category: null, contact: null, phone: null, gst: null, rating: null },
    ], error: null }), "o");
    expect(r.ok && r.data[0]).toMatchObject({ name: "ABC", category: "Cement", gst: "29ABC", rating: 4 });
    expect(r.ok && r.data[1]).toMatchObject({ category: null, rating: null });
    const e = await listVendors(client({ data: null, error: { message: "no grant" } }), "o");
    expect(e).toEqual({ ok: false, error: "no grant" });
  });
});

describe("createVendor", () => {
  it("returns the new id", async () => {
    const r = await createVendor(client({ data: { id: "v9" }, error: null }), { orgId: "o", name: "New Co" });
    expect(r).toEqual({ ok: true, data: { id: "v9" } });
  });
});

describe("vendorOptionGroups", () => {
  it("groups by category (sorted) and buckets uncategorised vendors into Other", () => {
    const g = vendorOptionGroups([
      { id: "1", name: "Cement Co", category: "Cement" },
      { id: "2", name: "Steel Co", category: "Steel" },
      { id: "3", name: "Ramesh Trans", category: null },
      { id: "4", name: "Lime Co", category: "Cement" },
      { id: "5", name: "  ", category: "   " },
    ]);
    expect(g.map(x => x.label)).toEqual(["Cement", "Other", "Steel"]);
    expect(g[0].options).toEqual([
      { value: "1", label: "Cement Co" },
      { value: "4", label: "Lime Co" },
    ]);
    expect(g[1].options).toEqual([
      { value: "3", label: "Ramesh Trans" },
      { value: "5", label: "  " },
    ]);
    expect(g[2].options).toEqual([{ value: "2", label: "Steel Co" }]);
  });

  it("returns [] for an empty vendor list", () => {
    expect(vendorOptionGroups([])).toEqual([]);
  });
});
