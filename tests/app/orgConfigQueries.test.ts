// SiteTrack Pro — org config query tests (templates / approval chains / notif).

import { describe, it, expect } from "vitest";
import { listTemplates, listChains, listRules, TRIGGER_LABEL } from "@/app/orgConfigQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert", "single", "update", "delete", "upsert"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const client = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });

describe("listTemplates", () => {
  it("maps + coerces kind, surfaces error", async () => {
    const r = await listTemplates(client({ data: [{ id: "1", kind: "boq", name: "Std BOQ", description: null }, { id: "2", kind: "weird", name: "X", description: "d" }], error: null }), "o");
    expect(r.ok && r.data[0]).toMatchObject({ kind: "boq", name: "Std BOQ", description: null });
    expect(r.ok && r.data[1].kind).toBe("project"); // fallback
    const e = await listTemplates(client({ data: null, error: { message: "no grant" } }), "o");
    expect(e).toEqual({ ok: false, error: "no grant" });
  });
});

describe("listChains", () => {
  it("parses rungs jsonb + coerces resource", async () => {
    const r = await listChains(client({ data: [{ resource: "ra_bill", name: "Std", rungs: [{ threshold: 500000, role: "pm" }, { threshold: "oops", role: "admin" }] }], error: null }), "o");
    expect(r.ok && r.data[0]).toMatchObject({ resource: "ra_bill", name: "Std" });
    expect(r.ok && r.data[0].rungs).toEqual([{ threshold: 500000, role: "pm" }, { threshold: 0, role: "admin" }]);
  });
  it("non-array rungs → empty", async () => {
    const r = await listChains(client({ data: [{ resource: "po", name: "X", rungs: null }], error: null }), "o");
    expect(r.ok && r.data[0].rungs).toEqual([]);
  });
});

describe("listRules", () => {
  it("maps channel + enabled default true; trigger label resolves", async () => {
    const r = await listRules(client({ data: [{ id: "1", trigger: "high_issue", channel: "email", enabled: undefined }], error: null }), "o");
    expect(r.ok && r.data[0]).toMatchObject({ trigger: "high_issue", channel: "email", enabled: true });
    expect(TRIGGER_LABEL["high_issue"]).toBe("HIGH severity issue opens");
  });
  it("enabled false respected", async () => {
    const r = await listRules(client({ data: [{ id: "1", trigger: "x", channel: "bad", enabled: false }], error: null }), "o");
    expect(r.ok && r.data[0]).toMatchObject({ channel: "in_app", enabled: false });
  });
});
