// SiteTrack Pro — cross-project PO query + totals tests.

import { describe, it, expect } from "vitest";
import { getOrgPurchaseOrders, poTotals, type CrossPO } from "@/app/queries/crossPoQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }): any => ({ rpc: async () => result });

describe("getOrgPurchaseOrders", () => {
  it("maps fields + coerces status; surfaces error", async () => {
    const r = await getOrgPurchaseOrders(rpcClient({ data: [
      { id: "1", po_no: "PO-1", project_id: "p1", project_name: "Tower A", vendor_name: "ACC", items: "Cement", amount: 80000, status: "approved", created_date: "2026-06-01", delivery_date: "2026-06-15", received_amount: 30000, open_amount: 50000 },
      { id: "2", po_no: "PO-2", project_id: "p1", project_name: "Tower A", vendor_name: null, items: null, amount: 1000, status: "weird", created_date: null, delivery_date: null },
    ], error: null }), "o");
    expect(r.ok && r.data[0]).toMatchObject({ poNo: "PO-1", vendorName: "ACC", amount: 80000, status: "approved", deliveryDate: "2026-06-15" });
    expect(r.ok && r.data[0].receivedAmount).toBe(30000);
    expect(r.ok && r.data[0].openAmount).toBe(50000);
    expect(r.ok && r.data[1].status).toBe("pending"); // fallback
    const e = await getOrgPurchaseOrders(rpcClient({ data: null, error: { message: "x" } }), "o");
    expect(e).toEqual({ ok: false, error: "x" });
  });
});

describe("poTotals", () => {
  const mk = (amount: number, status: CrossPO["status"]): CrossPO => ({ id: "x", poNo: "", projectId: "p", projectName: "", vendorName: null, items: null, amount, status, createdDate: null, deliveryDate: null, receivedAmount: 0, openAmount: amount, requestedByName: null, approvedByName: null, approvedAt: null });
  it("sums value excluding cancelled + groups by status", () => {
    const t = poTotals([mk(100, "pending"), mk(200, "approved"), mk(50, "cancelled"), mk(300, "delivered")]);
    expect(t.count).toBe(4);
    expect(t.total).toBe(600); // 100 + 200 + 300 (cancelled excluded)
    expect(t.byStatus).toEqual({ pending: 100, approved: 200, delivered: 300, cancelled: 50 });
  });
});
