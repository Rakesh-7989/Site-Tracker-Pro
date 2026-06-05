// SiteTrack Pro — BOQ / Labour / Compliance / Field-Ops / Approvals query tests.

import { describe, it, expect } from "vitest";
import { listBoq, listLabour, listCompliance, listWorklogs } from "@/app/siteAdminQueries";
import { listPendingApprovals, decideApproval } from "@/app/approvalsQueries";

// A thenable chain that ignores select/eq/order and resolves to `result`.
function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert", "delete", "single", "update"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const single = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });
// Route by table name (for the cross-entity approvals query).
const router = (byTable: Record<string, { data?: unknown; error?: unknown }>) => ({
  from: (t: string) => chain(byTable[t] ?? { data: [], error: null }),
});

describe("siteAdmin list mappers", () => {
  it("listBoq maps amount + coerces category", async () => {
    const r = await listBoq(single({ data: [{ id: "1", code: "C1", description: "RCC", unit: "cum", qty: 10, rate: 5000, amount: 50000, category: "weird" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ code: "C1", description: "RCC", qty: 10, rate: 5000, amount: 50000, category: "Other" });
  });

  it("listLabour masks Aadhaar to last 4 only", async () => {
    const r = await listLabour(single({ data: [{ id: "1", name: "Ramu", trade: "Mason", wage: 800, joined: "2026-01-01", aadhaar: "123412341234" }], error: null }), "p");
    expect(r.ok && r.data[0].aadhaarMasked).toBe("•••• •••• 1234");
    expect(r.ok && r.data[0].aadhaarMasked).not.toContain("1234123");
  });

  it("listLabour null Aadhaar stays null", async () => {
    const r = await listLabour(single({ data: [{ id: "1", name: "X", aadhaar: null }], error: null }), "p");
    expect(r.ok && r.data[0].aadhaarMasked).toBeNull();
  });

  it("listCompliance coerces kind + status", async () => {
    const r = await listCompliance(single({ data: [{ id: "1", kind: "rera", ref_no: "P024", stage: "plinth", status: "nope", expires_at: null, notes: null }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ kind: "rera", refNo: "P024", stage: "plinth", status: "pending" });
  });

  it("listWorklogs maps hours/notes + surfaces error", async () => {
    const r = await listWorklogs(single({ data: [{ id: "1", date: "2026-06-05", activity: "Slab", hours: 8, notes: "ok" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ date: "2026-06-05", activity: "Slab", hours: 8, notes: "ok" });
    const e = await listWorklogs(single({ data: null, error: { message: "denied" } }), "p");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});

describe("approvals", () => {
  it("aggregates pending change orders + RA bills + POs", async () => {
    const client = router({
      change_orders: { data: [{ id: "co1", no: "CO-1", description: "Add lift", cost_impact: 200000 }], error: null },
      ra_bills: { data: [{ id: "ra1", no: "RA-1", subcontractor: "ABC", bill_amount: 500000 }], error: null },
      purchase_orders: { data: [{ id: "po1", po_no: "PO-1", items: "Cement", amount: 80000 }], error: null },
    });
    const r = await listPendingApprovals(client, "p");
    expect(r.ok && r.data.map(x => x.kind)).toEqual(["changeorder", "rabill", "po"]);
    expect(r.ok && r.data[2]).toMatchObject({ kind: "po", ref: "PO-1", amount: 80000 });
  });

  it("decideApproval maps PO reject to 'cancelled', CO reject to 'rejected'", async () => {
    const calls: Array<{ table: string; status: unknown }> = [];
    function spyFrom(table: string) {
      return {
        update(patch: { status: unknown }) {
          calls.push({ table, status: patch.status });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy: any = { from: spyFrom };
    await decideApproval(spy, "po", "po1", "rejected");
    await decideApproval(spy, "changeorder", "co1", "rejected");
    await decideApproval(spy, "rabill", "ra1", "approved");
    expect(calls).toEqual([
      { table: "purchase_orders", status: "cancelled" },
      { table: "change_orders", status: "rejected" },
      { table: "ra_bills", status: "approved" },
    ]);
  });
});
