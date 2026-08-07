// SiteTrack Pro — finance + attendance query tests (Batch 2/3).

import { describe, it, expect } from "vitest";
import { listPOs, listInvoices, listExpenses, fmtRupees, invoiceTaxBreakup } from "@/app/financeQueries";
import { listAttendance } from "@/app/attendanceQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });

describe("fmtRupees", () => {
  it("formats with the Indian locale + ₹", () => {
    expect(fmtRupees(1500000)).toBe("₹15,00,000");
    expect(fmtRupees(0)).toBe("₹0");
  });
});

describe("invoiceTaxBreakup (ST-007)", () => {
  it("computes gst/tds and net receivable", () => {
    const b = invoiceTaxBreakup(100000, 18, 2);
    expect(b.gstAmount).toBe(18000);
    expect(b.tdsAmount).toBe(2000);
    expect(b.netReceivable).toBe(116000); // 100000 + 18000 - 2000
  });

  it("rounds and clamps non-finite inputs to 0", () => {
    expect(invoiceTaxBreakup(1500, 12.5, 2).gstAmount).toBe(188);
    expect(invoiceTaxBreakup(NaN, 18, 2).gstAmount).toBe(0);
    expect(invoiceTaxBreakup(1000, NaN, NaN).netReceivable).toBe(1000);
    expect(invoiceTaxBreakup(0, 18, 2).netReceivable).toBe(0);
  });
});

describe("listPOs", () => {
  it("maps + coerces status + numeric amount", async () => {
    const r = await listPOs(mockClient({ data: [
      { id: "1", po_no: "PO-1", items: "cement", amount: "50000", status: "approved", delivery_date: "2026-07-01" },
      { id: "2", po_no: "PO-2", items: null, amount: 0, status: "weird", delivery_date: null },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ poNo: "PO-1", amount: 50000, status: "approved" });
    expect(r.ok && r.data[1].status).toBe("pending");
  });
});

describe("listInvoices", () => {
  it("maps gst/tds + coerces status", async () => {
    const r = await listInvoices(mockClient({ data: [{ id: "1", no: "INV-1", amount: 200000, gst: 18, tds: 2, status: "paid", issued_date: "2026-06-15" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ no: "INV-1", amount: 200000, gst: 18, status: "paid" });
  });
});

describe("listExpenses", () => {
  it("maps + coerces status + surfaces error", async () => {
    const r = await listExpenses(mockClient({ data: [{ id: "1", category: "labour", description: "wages", amount: 30000, paid_to: "crew", expense_date: "2026-06-10", status: "weird" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ category: "labour", amount: 30000, status: "recorded" });
    const e = await listExpenses(mockClient({ data: null, error: { message: "denied" } }), "p");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});

describe("listAttendance", () => {
  it("maps + coerces kind/status", async () => {
    const r = await listAttendance(mockClient({ data: [
      { id: "1", attendee_name: "Ravi", attendee_kind: "labour", date: "2026-06-15", status: "present", hours: 8 },
      { id: "2", attendee_name: "X", attendee_kind: "weird", date: "2026-06-15", status: "weird", hours: null },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ attendeeName: "Ravi", kind: "labour", status: "present", hours: 8 });
    expect(r.ok && r.data[1]).toMatchObject({ kind: "labour", status: "present", hours: null });
  });
});
