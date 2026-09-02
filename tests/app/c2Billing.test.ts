// SiteTrack Pro — v4 C2 billing query-helper tests (pure functions only; no client).
// Covers the unbilled pipeline, retainer status machine, rate-card lookups,
// the invoice/revenue rollups used by BillingTab + RevenueView, and the
// org-wide invoice/retainer listers behind the Revenue view.

import { describe, it, expect } from "vitest";
import { effectiveRate, type RateCard } from "@/app/queries/rateCardQueries";
import { RETAINER_NEXT, type Retainer } from "@/app/queries/retainerQueries";
import {
  unbilledSummary, unbilledByMember, pendingApproval, billedToDate, billedBySource, retainerMrr,
  listOrgInvoices, listOrgRetainers,
  type UnbilledSummary,
} from "@/app/queries/billingQueries";
import type { TimeEntry } from "@/app/queries/timeQueries";
import type { Invoice } from "@/app/queries/financeQueries";

function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: "t", profileId: "u", memberName: null, date: "2026-07-31",
    activity: "Work", hours: 1, billable: true, rate: null, notes: null,
    approvalStatus: "approved", approvedBy: null, approvedAt: null,
    billed: false, billedInvoiceId: null, createdAt: "", phaseId: null, ...over,
  };
}

function card(over: Partial<RateCard>): RateCard {
  return {
    id: "c", projectId: "p", profileId: "u", memberName: "A", rate: 2000,
    effectiveFrom: "2026-01-01", notes: null, createdAt: "", ...over,
  };
}

function inv(over: Partial<Invoice>): Invoice {
  return {
    id: "i", no: "INV-1", amount: 1000, gst: 18, tds: 2, status: "sent",
    issuedDate: "2026-07-31", source: null, periodFrom: null, periodTo: null,
    retainerId: null, phaseId: null, razorpayPaymentLinkId: null, razorpayStatus: null,
    lines: [], ...over,
  };
}

function retainer(over: Partial<Retainer>): Retainer {
  return {
    id: "r", projectId: "p", title: "Advisory", monthlyAmount: 50_000,
    status: "active", startDate: "2026-01-01", endDate: null, billingDay: 1,
    createdAt: "", ...over,
  };
}

describe("unbilled pipeline helpers", () => {
  const entries = [
    entry({ id: "a", hours: 4, billable: true, rate: 2000, approvalStatus: "approved", billed: false }),
    entry({ id: "b", hours: 2, billable: true, rate: 3000, approvalStatus: "pending", billed: false }),
    entry({ id: "c", hours: 3, billable: true, rate: 1000, approvalStatus: "approved", billed: true }),
    entry({ id: "d", hours: 5, billable: false, approvalStatus: "approved", billed: false }),
    entry({ id: "e", hours: 1, billable: true, rate: null, approvalStatus: "approved", billed: false }),
  ];

  it("unbilledSummary counts only approved+billable+unbilled, rate-less at ₹0", () => {
    const s: UnbilledSummary = unbilledSummary(entries);
    expect(s.entries).toBe(2);            // a + e (d is non-billable → excluded)
    expect(s.hours).toBe(5);              // 4 (a) + 1 (e)
    expect(s.value).toBe(8000);           // a only; e has no rate
  });

  it("pendingApproval returns only pending entries", () => {
    const p = pendingApproval(entries);
    expect(p.map(x => x.id)).toEqual(["b"]);
  });

  it("unbilledByMember rolls up per member, sorted by value desc", () => {
    const rows = unbilledByMember([
      entry({ profileId: "u1", memberName: "A", hours: 2, rate: 1000 }),
      entry({ profileId: "u2", memberName: "B", hours: 5, rate: 3000 }),
      entry({ profileId: "u1", memberName: "A", hours: 1, rate: 1000 }),
      entry({ profileId: "u2", memberName: "B", hours: 1, rate: 3000, billed: true }), // excluded
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].profileId).toBe("u2");
    expect(rows[0].hours).toBe(5);
    expect(rows[0].value).toBe(15000);
    expect(rows[1].profileId).toBe("u1");
    expect(rows[1].hours).toBe(3);
    expect(rows[1].value).toBe(3000);
  });
});

describe("rate-card lookup", () => {
  it("effectiveRate picks the latest card on/before the entry date", () => {
    const cards = [
      card({ profileId: "u1", rate: 1000, effectiveFrom: "2026-01-01" }),
      card({ profileId: "u1", rate: 2500, effectiveFrom: "2026-06-01" }),
      card({ profileId: "u2", rate: 5000, effectiveFrom: "2026-01-01" }),
    ];
    expect(effectiveRate("u1", "2026-03-01", cards)).toBe(1000);
    expect(effectiveRate("u1", "2026-07-01", cards)).toBe(2500);
    expect(effectiveRate("u1", "2025-12-01", cards)).toBeNull();
    expect(effectiveRate("u3", "2026-07-01", cards)).toBeNull();
  });
  it("works with no cards", () => {
    expect(effectiveRate("u1", "2026-07-01", [])).toBeNull();
  });
});

describe("retainer status machine", () => {
  it("active ↔ paused, cancelled is terminal", () => {
    expect(RETAINER_NEXT.active).toBe("paused");
    expect(RETAINER_NEXT.paused).toBe("active");
    expect(RETAINER_NEXT.cancelled).toBeNull();
  });
  it("retainerMrr sums only active retainers", () => {
    const retainers = [
      retainer({ monthlyAmount: 50_000, status: "active" }),
      retainer({ monthlyAmount: 20_000, status: "paused" }),
      retainer({ monthlyAmount: 30_000, status: "active" }),
    ];
    expect(retainerMrr(retainers)).toBe(80_000);
  });
});

describe("invoice rollups", () => {
  it("billedToDate excludes cancelled invoices", () => {
    const invoices = [
      inv({ amount: 1000, status: "paid" }),
      inv({ amount: 2000, status: "sent" }),
      inv({ amount: 4000, status: "cancelled" }),
    ];
    expect(billedToDate(invoices)).toBe(3000);
  });
  it("billedBySource filters by source tag", () => {
    const invoices = [
      inv({ amount: 1000, source: "hourly" }),
      inv({ amount: 2000, source: "retainer", status: "cancelled" }),
      inv({ amount: 3000, source: "retainer" }),
    ];
    expect(billedBySource(invoices, "retainer")).toBe(3000);
    expect(billedBySource(invoices, "hourly")).toBe(1000);
    expect(billedBySource(invoices, "phase")).toBe(0);
  });
});

describe("org-wide listers (Revenue view)", () => {
  function chain(result: { data?: unknown; error?: unknown }) {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "in", "eq", "order"]) c[m] = () => c;
    c.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return c;
  }
  const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });

  it("listOrgInvoices maps source/period tags + project id and coerces status", async () => {
    const r = await listOrgInvoices(mockClient({ data: [
      { id: "i1", no: "HRY-1", amount: 5000, gst: 18, tds: 2, status: "paid", issued_date: "2026-07-31", source: "hourly", period_from: "2026-07-01", period_to: "2026-07-31", retainer_id: null, phase_id: null, project_id: "p1" },
      { id: "i2", no: "RTR-1", amount: 3000, gst: 18, tds: 2, status: "weird", issued_date: null, source: "unknown", period_from: null, period_to: null, retainer_id: null, phase_id: null, project_id: "p2" },
    ], error: null }), ["p1", "p2"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(2);
    expect(r.data[0]).toMatchObject({ projectId: "p1", source: "hourly", periodFrom: "2026-07-01", periodTo: "2026-07-31", status: "paid" });
    expect(r.data[1]).toMatchObject({ projectId: "p2", source: null, status: "sent" });
  });

  it("listOrgInvoices short-circuits with an empty project list", async () => {
    const r = await listOrgInvoices(mockClient({ data: [{ id: "x" }], error: null }), []);
    expect(r.ok && r.data).toHaveLength(0);
  });

  it("listOrgRetainers coerces status and keeps project id", async () => {
    const r = await listOrgRetainers(mockClient({ data: [
      { id: "r1", project_id: "p1", title: "Advisory", monthly_amount: "50000", status: "active", start_date: "2026-01-01", end_date: null, billing_day: 1, created_at: "2026-01-01" },
      { id: "r2", project_id: "p1", title: "Old", monthly_amount: 1000, status: "bogus", start_date: "2025-01-01", end_date: "2025-12-31", billing_day: 15, created_at: "2025-01-01" },
    ], error: null }), ["p1"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data[0]).toMatchObject({ projectId: "p1", monthlyAmount: 50000, status: "active", billingDay: 1 });
    expect(r.data[1].status).toBe("active"); // unknown → default active
  });

  it("listOrgRetainers short-circuits with an empty project list", async () => {
    const r = await listOrgRetainers(mockClient({ data: [{ id: "x" }], error: null }), []);
    expect(r.ok && r.data).toHaveLength(0);
  });
});
