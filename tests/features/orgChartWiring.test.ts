// SiteTrack Pro — pure chart-wiring helpers (Option 4 Phase 24).
// RevenueView.sourceSplitData / shortCurrency, OrgFinancialView.cashFlowTrend,
// ForecastView.burnUpSeries / monthLabel.

import { describe, expect, it } from "vitest";
import { sourceSplitData, shortCurrency } from "@/features/org/RevenueView";
import { cashFlowTrend } from "@/features/org/OrgFinancialView";
import { burnUpSeries, monthLabel } from "@/features/org/ForecastView";
import type { RaBill } from "@/app/forecastQueries";
import type { CashFlowForecastRow } from "@/app/crossAnalyticsQueries";

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
