import { describe, expect, it } from "vitest";
import {
  INVOICE_STATUS_TONE,
  netReceivable,
  paymentStatus,
  raNetPayable,
  type Invoice,
} from "@/features/finance/financeQueries";

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: "inv-1",
    projectId: "p1",
    no: "INV-1",
    amount: 100000,
    gstPct: 18,
    tdsPct: 2,
    status: "sent",
    issuedDate: null,
    paidDate: null,
    ...overrides,
  };
}

describe("netReceivable (mig-239 percentage math)", () => {
  it("computes the canonical ₹1,00,000 @18/2 case", () => {
    expect(netReceivable(100000, 18, 2)).toBe(116000);
  });

  it("rounds half-up on fractional paise", () => {
    expect(netReceivable(38666, 0, 0.01)).toBe(Math.round(38666 * 0.9999));
  });

  it("treats gst/tds as percentages, never flat rupees", () => {
    expect(netReceivable(100000, 0, 0)).toBe(100000);
    expect(netReceivable(100000, 2, 2)).toBe(100000);
  });
});

describe("raNetPayable", () => {
  it("applies retention", () => {
    expect(raNetPayable(200000, 5)).toBe(190000);
  });

  it("zero retention returns full bill", () => {
    expect(raNetPayable(150000, 0)).toBe(150000);
  });
});

describe("paymentStatus", () => {
  it("paid date wins", () => {
    expect(paymentStatus(invoice({ paidDate: "2026-08-01" }))).toBe("paid");
  });

  it("overdue status maps to overdue", () => {
    expect(paymentStatus(invoice({ status: "overdue" }))).toBe("overdue");
  });

  it("sent without payment is pending", () => {
    expect(paymentStatus(invoice({}))).toBe("pending");
  });
});

describe("INVOICE_STATUS_TONE coverage", () => {
  it("has a tone for every legal status", () => {
    for (const s of ["sent", "paid", "overdue", "cancelled"]) {
      expect(INVOICE_STATUS_TONE[s]).toBeDefined();
    }
  });
});
