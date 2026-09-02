// SiteTrack Pro — v4 C3.3 invoice line-item tests.
// Pure helpers + query mapping (no real client).

import { describe, it, expect } from "vitest";
import { invoiceLinesTotal, type InvoiceLine, type Invoice } from "@/app/queries/financeQueries";

function line(over: Partial<InvoiceLine>): InvoiceLine {
  return { id: "l", description: "Work", qty: 1, unitPrice: 0, amount: 0, ...over };
}

describe("invoiceLinesTotal", () => {
  it("sums line amounts", () => {
    expect(invoiceLinesTotal([line({ amount: 1000 }), line({ amount: 2500 }), line({ amount: 400 })])).toBe(3900);
  });

  it("returns 0 for empty or missing lines", () => {
    expect(invoiceLinesTotal([])).toBe(0);
    expect(invoiceLinesTotal(undefined as unknown as InvoiceLine[])).toBe(0);
  });

  it("ignores NaN amounts", () => {
    expect(invoiceLinesTotal([line({ amount: 100 }), line({ amount: NaN })])).toBe(100);
  });
});

describe("Invoice mapping carries line items", () => {
  // Mirrors listInvoices / listOrgInvoices row→Invoice mapping semantics.
  function mapRow(r: Record<string, unknown>): Invoice {
    const rawLines = Array.isArray(r.invoice_lines) ? r.invoice_lines : [];
    return {
      id: String(r.id), no: String(r.no ?? ""), amount: Number(r.amount ?? 0),
      gst: Number(r.gst ?? 0), tds: Number(r.tds ?? 0),
      status: (["sent", "paid", "overdue", "cancelled"] as const).includes(r.status as Invoice["status"])
        ? r.status as Invoice["status"] : "sent",
      issuedDate: r.issued_date == null ? null : String(r.issued_date),
      source: r.source == null ? null : r.source as Invoice["source"],
      periodFrom: r.period_from == null ? null : String(r.period_from),
      periodTo: r.period_to == null ? null : String(r.period_to),
      retainerId: r.retainer_id == null ? null : String(r.retainer_id),
      phaseId: r.phase_id == null ? null : String(r.phase_id),
      razorpayPaymentLinkId: r.razorpay_payment_link_id == null ? null : String(r.razorpay_payment_link_id),
      razorpayStatus: r.razorpay_status == null ? null : String(r.razorpay_status),
      lines: rawLines.map((l) => {
        const x = l as Record<string, unknown>;
        return {
          id: String(x.id ?? ""), description: String(x.description ?? ""),
          qty: Number(x.qty ?? 0), unitPrice: Number(x.unit_price ?? 0), amount: Number(x.amount ?? 0),
        };
      }),
    };
  }

  it("maps embedded invoice_lines into Invoice.lines", () => {
    const inv = mapRow({
      id: "i1", no: "HRY-1", amount: 3500, gst: 18, tds: 2, status: "sent",
      issued_date: "2026-08-01", source: "hourly", period_from: "2026-08-01", period_to: "2026-08-31",
      retainer_id: null, phase_id: null,
      invoice_lines: [
        { id: "l1", description: "Arjun Kapoor", qty: 2.5, unit_price: 1000, amount: 2500 },
        { id: "l2", description: "Sana", qty: 1, unit_price: 1000, amount: 1000 },
      ],
    });
    expect(inv.lines).toHaveLength(2);
    expect(inv.lines[0]).toMatchObject({ description: "Arjun Kapoor", qty: 2.5, unitPrice: 1000, amount: 2500 });
    expect(invoiceLinesTotal(inv.lines)).toBe(3500);
  });

  it("defaults to an empty line list when none embedded", () => {
    const inv = mapRow({ id: "i2", no: "INV-2", amount: 500, gst: 18, tds: 2, status: "sent" });
    expect(inv.lines).toEqual([]);
  });

  it("tolerates non-array invoice_lines", () => {
    const inv = mapRow({ id: "i3", no: "INV-3", amount: 500, gst: 18, tds: 2, status: "sent", invoice_lines: null });
    expect(inv.lines).toEqual([]);
  });
});