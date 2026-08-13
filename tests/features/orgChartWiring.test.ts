// SiteTrack Pro — pure chart-wiring helpers (Option 4 Phase 24/25).
// RevenueView.sourceSplitData / shortCurrency, OrgFinancialView.cashFlowTrend,
// ForecastView.burnUpSeries / monthLabel, UtilizationView fee/value series,
// ProcurementView.quotePriceData.

import { describe, expect, it } from "vitest";
import { sourceSplitData, shortCurrency } from "@/features/org/RevenueView";
import { cashFlowTrend } from "@/features/org/OrgFinancialView";
import { burnUpSeries, monthLabel } from "@/features/org/ForecastView";
import { utilizationFeeData, utilizationValueData, phaseFeeData, phaseValueData } from "@/features/org/UtilizationView";
import { quotePriceData } from "@/features/org/ProcurementView";
import type { RaBill } from "@/app/forecastQueries";
import type { CashFlowForecastRow } from "@/app/crossAnalyticsQueries";
import type { UtilizationRow, UtilizationPhaseRow } from "@/app/utilizationQueries";
import type { ProcurementQuote } from "@/app/procurementQuotes";

describe("sourceSplitData", () => {
  it("keeps only positive slices in phase, hourly, retainer order", () => {
    const rows = sourceSplitData(100, 0, 50);
    expect(rows.map(r => r.label)).toEqual(["Phase", "Retainer"]);
    expect(rows).toEqual([
      { label: "Phase", value: 100 },
      { label: "Retainer", value: 50 },
    ]);
  });

  it("returns empty when every source is zero", () => {
    expect(sourceSplitData(0, 0, 0)).toEqual([]);
  });

  it("keeps all three sources when all positive", () => {
    expect(sourceSplitData(1, 2, 3).map(r => r.label)).toEqual(["Phase", "Hourly", "Retainer"]);
  });
});

describe("shortCurrency", () => {
  it("formats crores", () => {
    expect(shortCurrency(12000000)).toBe("₹1.2Cr");
  });

  it("formats lakhs as k", () => {
    expect(shortCurrency(250000)).toBe("₹250k");
  });

  it("falls back to full rupees for small amounts", () => {
    expect(shortCurrency(1500)).toContain("1,500");
  });
});

describe("cashFlowTrend", () => {
  const rows: CashFlowForecastRow[] = [
    { period: "Aug", projectedIn: 500, projectedOut: 200, net: 300, cumulative: 300 },
    { period: "Sep", projectedIn: 700, projectedOut: 400, net: 300, cumulative: 600 },
  ];

  it("maps the in-side series", () => {
    expect(cashFlowTrend(rows, "in")).toEqual([
      { label: "Aug", value: 500 },
      { label: "Sep", value: 700 },
    ]);
  });

  it("maps the out-side series", () => {
    expect(cashFlowTrend(rows, "out")).toEqual([
      { label: "Aug", value: 200 },
      { label: "Sep", value: 400 },
    ]);
  });

  it("returns empty for an empty forecast", () => {
    expect(cashFlowTrend([], "in")).toEqual([]);
  });
});

describe("monthLabel", () => {
  it("renders a short month for a valid date", () => {
    const label = monthLabel("2026-08-15");
    expect(label.length).toBeGreaterThan(0);
    expect(label.length).toBeLessThanOrEqual(3);
  });

  it("falls back to the raw string when invalid", () => {
    expect(monthLabel("not-a-date")).toBe("not-a-date");
  });
});

describe("burnUpSeries", () => {
  const bill = (partial: Partial<RaBill>): RaBill => ({
    id: partial.id ?? "x",
    no: partial.no ?? "NO",
    subcontractor: null,
    scope: null,
    bill_amount: partial.bill_amount ?? 0,
    cumulative: null,
    status: "approved",
    bill_date: partial.bill_date ?? null,
  });

  it("computes a cumulative series sorted oldest-first", () => {
    const rows = burnUpSeries([
      bill({ id: "a", bill_amount: 100, bill_date: "2026-06-01" }),
      bill({ id: "b", bill_amount: 50, bill_date: "2026-05-01" }),
      bill({ id: "c", bill_amount: 250, bill_date: "2026-07-01" }),
    ]);
    expect(rows.map(r => r.value)).toEqual([50, 150, 400]);
  });

  it("skips undated and zero-amount bills", () => {
    const rows = burnUpSeries([
      bill({ id: "a", bill_amount: 100, bill_date: null }),
      bill({ id: "b", bill_amount: 0, bill_date: "2026-05-01" }),
      bill({ id: "c", bill_amount: 25, bill_date: "2026-04-01" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ value: 25, label: expect.any(String) });
  });

  it("returns empty when there is nothing dated", () => {
    expect(burnUpSeries([bill({ id: "a", bill_amount: 10, bill_date: null })])).toEqual([]);
  });
});

describe("utilizationFeeData / utilizationValueData", () => {
  const rows: UtilizationRow[] = [
    { projectId: "p1", name: "Design Hub", type: "design", fee: 500000, loggedHours: 40, billedValue: 300000, variance: 200000, utilizationPct: 60 },
    { projectId: "p2", name: "Villa", type: "consultant", fee: 900000, loggedHours: 90, billedValue: 800000, variance: 100000, utilizationPct: 89 },
  ];

  it("maps fee series by project name", () => {
    expect(utilizationFeeData(rows)).toEqual([
      { label: "Design Hub", value: 500000 },
      { label: "Villa", value: 900000 },
    ]);
  });

  it("maps billed-value series rounded to whole rupees", () => {
    expect(utilizationValueData([{ ...rows[0], billedValue: 300000.4 }])).toEqual([
      { label: "Design Hub", value: 300000 },
    ]);
  });

  it("returns empty for an empty rollup", () => {
    expect(utilizationFeeData([])).toEqual([]);
  });
});

describe("phaseFeeData / phaseValueData", () => {
  const phases: UtilizationPhaseRow[] = [
    { projectId: "p1", projectName: "Design Hub", phaseId: "f1", phaseTitle: "Concept", feeAmount: 100000, loggedHours: 10, billedValue: 80000, variance: 20000, utilizationPct: 80 },
    { projectId: "p1", projectName: "Design Hub", phaseId: "__unassigned__", phaseTitle: "Unassigned", feeAmount: 0, loggedHours: 5, billedValue: 40000, variance: -40000, utilizationPct: 0 },
  ];

  it("maps phase fee series keeping the unassigned row", () => {
    expect(phaseFeeData(phases)).toEqual([
      { label: "Concept", value: 100000 },
      { label: "Unassigned", value: 0 },
    ]);
  });

  it("maps phase billed-value series", () => {
    expect(phaseValueData(phases)).toEqual([
      { label: "Concept", value: 80000 },
      { label: "Unassigned", value: 40000 },
    ]);
  });

  it("returns empty for empty phases", () => {
    expect(phaseValueData([])).toEqual([]);
  });
});

describe("quotePriceData", () => {
  const quote = (partial: Partial<ProcurementQuote> & { id: string }): ProcurementQuote => ({
    id: partial.id,
    orgId: "org",
    ffeEntryId: "f1",
    projectId: "p1",
    vendorId: partial.vendorId ?? null,
    vendorName: partial.vendorName ?? "Vendor",
    itemName: null,
    unitPrice: partial.unitPrice ?? 0,
    qty: 1,
    leadDays: null,
    validUntil: null,
    status: partial.status ?? "received",
    notes: null,
    createdBy: null,
    createdAt: "",
  });

  it("maps vendor → unit price, marking the best quote success", () => {
    const rows = quotePriceData(
      [
        quote({ id: "a", vendorName: "SteelCo", unitPrice: 1200 }),
        quote({ id: "b", vendorName: "Ira", unitPrice: 900 }),
      ],
      "b",
    );
    expect(rows).toEqual([
      { label: "SteelCo", value: 1200, color: undefined },
      { label: "Ira", value: 900, color: "var(--st-success)" },
    ]);
  });

  it("drops rejected and zero-price quotes", () => {
    const rows = quotePriceData(
      [
        quote({ id: "a", vendorName: "A", unitPrice: 500 }),
        quote({ id: "b", vendorName: "B", unitPrice: 0 }),
        quote({ id: "c", vendorName: "C", unitPrice: 700, status: "rejected" }),
      ],
      null,
    );
    expect(rows.map(r => r.label)).toEqual(["A"]);
  });

  it("returns empty when nothing comparable", () => {
    expect(quotePriceData([quote({ id: "a", unitPrice: 0 })], null)).toEqual([]);
  });
});
