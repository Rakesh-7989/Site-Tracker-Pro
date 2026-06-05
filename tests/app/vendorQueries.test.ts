// SiteTrack Pro — vendor directory query tests.

import { describe, it, expect } from "vitest";
import { listVendors, createVendor } from "@/app/vendorQueries";

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
