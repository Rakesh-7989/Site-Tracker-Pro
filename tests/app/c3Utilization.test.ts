// SiteTrack Pro — v4 C3.1 per-phase utilization drill-down tests (pure fn).
// Covers buildPhaseRows: per-phase fee/effort math, the "Unassigned" bucket for
// billable entries with no phase, sort order, and empty inputs.

import { describe, it, expect } from "vitest";
import { buildPhaseRows, type UtilizationPhaseRow } from "@/app/queries/utilizationQueries";

type PhaseRow = Record<string, unknown>;
type EntryRow = Record<string, unknown>;

function phase(over: Partial<PhaseRow>): PhaseRow {
  return { id: "ph", project_id: "proj", title: "Phase", fee_amount: 0, status: "approved", ...over };
}

function entry(over: Partial<EntryRow>): EntryRow {
  return { id: "t", project_id: "proj", hours: 1, billable: true, rate: 2000, phase_id: "ph", ...over };
}

function byTitle(rows: UtilizationPhaseRow[], title: string): UtilizationPhaseRow | undefined {
  return rows.find(r => r.phaseTitle === title);
}

describe("buildPhaseRows", () => {
  it("computes fee vs billed-effort per phase with variance + utilization %", () => {
    const rows = buildPhaseRows("proj", "Tower A", [
      phase({ id: "ph1", title: "Design Dev", fee_amount: 1_000_000 }),
    ], [
      entry({ phase_id: "ph1", hours: 50, rate: 5000 }),  // 250,000 billed
      entry({ phase_id: "ph1", hours: 10, rate: null }),  // 0 (no rate)
      entry({ phase_id: "ph1", hours: 20, billable: false, rate: 5000 }), // 0 (internal)
    ]);
    const r = byTitle(rows, "Design Dev")!;
    expect(r).toBeDefined();
    expect(r.feeAmount).toBe(1_000_000);
    expect(r.loggedHours).toBe(60);      // billable only
    expect(r.billedValue).toBe(250_000);
    expect(r.variance).toBe(750_000);
    expect(r.utilizationPct).toBe(25);
    expect(r.projectName).toBe("Tower A");
  });

  it("rolls billable entries without a phase into an Unassigned bucket", () => {
    const rows = buildPhaseRows("proj", "Tower A", [
      phase({ id: "ph1", title: "Design Dev", fee_amount: 1_000_000 }),
    ], [
      entry({ phase_id: "ph1", hours: 10, rate: 2000 }),  // 20,000 to phase
      entry({ phase_id: null, hours: 5, rate: 1000 }),    // 5,000 unassigned
      entry({ phase_id: null, hours: 3, billable: false, rate: 1000 }), // internal, ignored
    ]);
    const un = byTitle(rows, "Unassigned")!;
    expect(un).toBeDefined();
    expect(un.feeAmount).toBe(0);
    expect(un.loggedHours).toBe(5);
    expect(un.billedValue).toBe(5_000);
    expect(un.variance).toBe(-5_000);
    expect(un.utilizationPct).toBe(0);
    expect(byTitle(rows, "Design Dev")!.loggedHours).toBe(10);
  });

  it("emits no Unassigned bucket when every billable entry is phased", () => {
    const rows = buildPhaseRows("proj", "Tower A", [phase({ id: "ph1" })], [entry({ phase_id: "ph1" })]);
    expect(byTitle(rows, "Unassigned")).toBeUndefined();
  });

  it("emits no Unassigned bucket when only non-billable entries lack a phase", () => {
    const rows = buildPhaseRows("proj", "Tower A", [phase({ id: "ph1" })], [entry({ phase_id: null, billable: false })]);
    expect(byTitle(rows, "Unassigned")).toBeUndefined();
  });

  it("returns [] for a project with no phases and no entries", () => {
    expect(buildPhaseRows("proj", "Tower A", [], [])).toEqual([]);
  });

  it("sorts phases by fee descending with Unassigned last", () => {
    const rows = buildPhaseRows("proj", "Tower A", [
      phase({ id: "small", title: "Small", fee_amount: 100 }),
      phase({ id: "big", title: "Big", fee_amount: 10_000 }),
    ], [
      entry({ phase_id: null }),
      entry({ phase_id: "big" }),
      entry({ phase_id: "small" }),
    ]);
    const titles = rows.map(r => r.phaseTitle);
    expect(titles).toEqual(["Big", "Small", "Unassigned"]);
  });

  it("avoids division by zero on a 0-fee phase with logged hours", () => {
    const rows = buildPhaseRows("proj", "Tower A", [phase({ id: "ph1", fee_amount: 0 })], [entry({ phase_id: "ph1", hours: 5 })]);
    expect(byTitle(rows, "Phase")!.utilizationPct).toBe(0);
  });
});
