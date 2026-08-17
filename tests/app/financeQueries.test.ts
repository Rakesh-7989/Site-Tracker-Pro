// SiteTrack Pro — finance + attendance query tests (Batch 2/3).

import { describe, it, expect } from "vitest";
import { listPOs, listInvoices, listExpenses, fmtRupees, invoiceTaxBreakup, listLedger, createLedgerTxn, stockBalance, stockRows, stockLevel, type LedgerTxn } from "@/app/financeQueries";
import { listAttendance } from "@/app/attendanceQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });

const txn = (p: Partial<LedgerTxn>): LedgerTxn => ({ id: "1", txnDate: "2026-08-17", material: "Cement", unit: "bag", qty: 10, direction: "inward", source: null, refNo: null, issuedTo: null, notes: null, recordedByName: null, ...p });

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

describe("listLedger (ST-018)", () => {
  it("maps issuedTo/notes/recordedBy embed + coerces direction", async () => {
    const r = await listLedger(mockClient({ data: [
      { id: "1", txn_date: "2026-08-17", material: "Cement", unit: "bag", qty: 10, direction: "outward", source: null, ref_no: "PO-1", issued_to: "Contractor Ravi", notes: "slab pour", recorded_by: { name: "Rajesh" } },
      { id: "2", txn_date: "2026-08-16", material: "Steel", unit: null, qty: 5, direction: "weird", source: "x", ref_no: null, issued_to: null, notes: null, recorded_by: null },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ issuedTo: "Contractor Ravi", notes: "slab pour", recordedByName: "Rajesh", refNo: "PO-1" });
    expect(r.ok && r.data[1]).toMatchObject({ direction: "inward", issuedTo: null, recordedByName: null });
    const e = await listLedger(mockClient({ data: null, error: { message: "denied" } }), "p");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});

describe("createLedgerTxn (ST-018)", () => {
  it("inserts issuedTo/notes/recordedBy + coerces falsy to null", async () => {
    let body: Record<string, unknown> = {};
    const c: Record<string, unknown> = {};
    c.select = () => c; c.single = () => c;
    c.then = (resolve: (v: unknown) => unknown) => resolve({ data: { id: "9" }, error: null });
    const insert = (b: Record<string, unknown>) => { body = b; return c; };
    const r = await createLedgerTxn({ from: () => ({ insert }) }, { projectId: "p", material: "Cement", qty: 4, direction: "outward", issuedTo: "Contractor", notes: "note", recordedBy: "u" });
    expect(r.ok && r.data.id).toBe("9");
    expect(body).toMatchObject({ project_id: "p", issued_to: "Contractor", notes: "note", recorded_by: "u", direction: "outward" });
  });
});

describe("stock helpers (ST-018)", () => {
  const ledger: LedgerTxn[] = [
    txn({ material: "Cement", qty: 20, direction: "inward" }),
    txn({ material: "Cement", qty: 6, direction: "outward", issuedTo: "Ravi" }),
    txn({ material: "Steel", qty: 5, direction: "inward", unit: "ton" }),
    txn({ material: "Steel", qty: 3, direction: "wastage", unit: "ton" }),
    txn({ material: "Sand", qty: 2, direction: "outward", unit: null }),
  ];

  it("stockBalance sums inward/return + subtracts outward/wastage", () => {
    const b = stockBalance(ledger);
    expect(b.get("Cement")).toBe(14);
    expect(b.get("Steel")).toBe(2);
    expect(b.get("Sand")).toBe(-2);
  });

  it("stockLevel tones ok/low/out", () => {
    expect(stockLevel(5)).toBe("ok");
    expect(stockLevel(0)).toBe("low");
    expect(stockLevel(-1)).toBe("out");
  });

  it("stockRows aggregates + last-known unit + sorted", () => {
    const rows = stockRows(ledger);
    expect(rows).toEqual([
      { material: "Cement", unit: "bag", balance: 14, level: "ok" },
      { material: "Sand", unit: null, balance: -2, level: "out" },
      { material: "Steel", unit: "ton", balance: 2, level: "ok" },
    ]);
  });

  it("stockRows empty + out-tone null-unit", () => {
    expect(stockRows([])).toEqual([]);
  });
});
