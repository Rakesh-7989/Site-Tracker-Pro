// SiteTrack Pro — v4 C1 query-helper tests (pure functions only; no client).
// Covers the fee/effort math used by the utilization report, time-entry
// aggregation, phase fee totals, and review-round numbering.

import { describe, it, expect } from "vitest";
import { computeUtilization, type ProjectBrief } from "@/app/utilizationQueries";
import { committedFee, type FeePhase } from "@/app/phaseQueries";
import { billableHours, totalHours, entryValue, type TimeEntry } from "@/app/timeQueries";
import { nextRoundNo, type ReviewRound } from "@/app/deliverableQueries";

function phase(over: Partial<FeePhase>): FeePhase {
  return {
    id: "p", title: "Phase", scope: null, feeAmount: 0,
    status: "draft", dueDate: null, completedDate: null, sortOrder: 0, createdAt: "", ...over,
  };
}

function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: "t", profileId: "u", memberName: null, date: "2026-07-31",
    activity: "Work", hours: 1, billable: true, rate: null, notes: null,
    approvalStatus: "approved", approvedBy: null, approvedAt: null,
    billed: false, billedInvoiceId: null, createdAt: "", ...over,
  };
}

describe("committedFee", () => {
  it("sums only approved / in_progress / completed phases", () => {
    const phases = [
      phase({ status: "draft", feeAmount: 100 }),
      phase({ status: "approved", feeAmount: 200 }),
      phase({ status: "in_progress", feeAmount: 300 }),
      phase({ status: "completed", feeAmount: 400 }),
      phase({ status: "cancelled", feeAmount: 9999 }),
    ];
    expect(committedFee(phases)).toBe(900);
  });
  it("is 0 with no phases or all drafts", () => {
    expect(committedFee([])).toBe(0);
    expect(committedFee([phase({ status: "draft", feeAmount: 500 }), phase({ status: "cancelled", feeAmount: 500 })])).toBe(0);
  });
});

describe("time aggregation helpers", () => {
  it("totalHours counts every entry regardless of billable", () => {
    const entries = [
      entry({ hours: 4, billable: true }),
      entry({ hours: 2, billable: false }),
    ];
    expect(totalHours(entries)).toBe(6);
    expect(billableHours(entries)).toBe(4);
  });
  it("entryValue = hours × rate, 0 when rate unset or non-billable", () => {
    expect(entryValue(entry({ hours: 4, billable: true, rate: 2000 }))).toBe(8000);
    expect(entryValue(entry({ hours: 4, billable: true, rate: null }))).toBe(0);
    expect(entryValue(entry({ hours: 4, billable: false, rate: 2000 }))).toBe(0);
  });
});

describe("computeUtilization", () => {
  const project: ProjectBrief = { id: "proj", name: "Tower A", type: "consultant" };

  it("computes fee vs billed-effort variance + utilization %", () => {
    const row = computeUtilization(project, [
      phase({ status: "approved", feeAmount: 1_000_000 }),
      phase({ status: "completed", feeAmount: 500_000 }),
    ], [
      entry({ hours: 50, billable: true, rate: 5000 }),   // 250,000
      entry({ hours: 10, billable: true, rate: null }),   // 0
      entry({ hours: 20, billable: false, rate: 5000 }),  // 0 (internal)
    ]);
    expect(row.fee).toBe(1_500_000);
    expect(row.loggedHours).toBe(60);                      // only billable
    expect(row.billedValue).toBe(250_000);
    expect(row.variance).toBe(1_250_000);
    expect(row.utilizationPct).toBe(Math.round((250_000 / 1_500_000) * 100));
  });

  it("reports 0% utilization and full-fee variance when no effort logged", () => {
    const row = computeUtilization(project, [phase({ status: "approved", feeAmount: 1_000_000 })], []);
    expect(row.billedValue).toBe(0);
    expect(row.variance).toBe(1_000_000);
    expect(row.utilizationPct).toBe(0);
  });

  it("avoids division by zero when fee is 0", () => {
    const row = computeUtilization(project, [phase({ status: "draft", feeAmount: 0 })], [entry({ hours: 5, billable: true })]);
    expect(row.utilizationPct).toBe(0);
    expect(row.fee).toBe(0);
  });
});

describe("nextRoundNo", () => {
  const round = (n: number): ReviewRound => ({
    id: "r", roundNo: n, status: "closed", requestedBy: null, requestedByName: null,
    comments: null, closedBy: null, closedByName: null, closedAt: null, createdAt: "",
  });
  it("increments from the max existing round", () => {
    expect(nextRoundNo([round(1), round(2)])).toBe(3);
    expect(nextRoundNo([])).toBe(1);
  });
});
