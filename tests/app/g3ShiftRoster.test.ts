// v5 Phase G3 — shift roster + overtime + wages. Pure helpers in shiftQueries.ts
// and the labour_register epf/esi surface. Mirrors the g1/g2 suite pattern.

import { describe, it, expect, vi } from "vitest";
import {
  baseWage, overtimeAmount, statutoryDeductions, wageSlip, attendanceTally,
  SHIFT_LABEL, OVER_TIME_MULTIPLIER, SHIFT_BASE_HOURS,
  listShiftRoster, createShiftRoster, deleteShiftRoster,
} from "@/app/queries/shiftQueries";

describe("shiftQueries — wage slip math", () => {
  it("baseWage = presentDays × dailyWage, clamps negatives", () => {
    expect(baseWage({ dailyWage: 500, presentDays: 20, overtimeHours: 0 })).toBe(10000);
    expect(baseWage({ dailyWage: 500, presentDays: -2, overtimeHours: 0 })).toBe(0);
    expect(baseWage({ dailyWage: -10, presentDays: 3, overtimeHours: 0 })).toBe(0);
  });

  it("overtimeAmount = hours × (wage / 8) × 1.5", () => {
    // 500/day → 62.5/hr × 2h × 1.5 = 187.5
    expect(overtimeAmount({ dailyWage: 500, presentDays: 20, overtimeHours: 2 })).toBeCloseTo(187.5, 5);
    expect(overtimeAmount({ dailyWage: 500, presentDays: 20, overtimeHours: 0 })).toBe(0);
    expect(overtimeAmount({ dailyWage: 500, presentDays: 20, overtimeHours: -3 })).toBe(0);
  });

  it("statutoryDeductions applies 12% EPF + 0.75% ESI", () => {
    const d = statutoryDeductions(10000);
    expect(d.epf).toBe(1200);
    expect(d.esi).toBe(75);
    expect(statutoryDeductions(0)).toEqual({ epf: 0, esi: 0 });
  });

  it("wageSlip returns complete breakdown with net = gross - deductions", () => {
    const s = wageSlip({ dailyWage: 500, presentDays: 20, overtimeHours: 2 });
    expect(s.baseAmount).toBe(10000);
    expect(s.otAmount).toBeCloseTo(187.5, 5);
    expect(s.gross).toBeCloseTo(10187.5, 5);
    expect(s.epf).toBeCloseTo(1222.5, 5);   // 12% of 10187.5
    expect(s.esi).toBeCloseTo(76.41, 2);    // 0.75% of 10187.5
    expect(s.net).toBeCloseTo(s.gross - s.epf - s.esi, 5);
    expect(s.baseDays).toBe(20);
    expect(s.otHours).toBe(2);
  });

  it("exports constants + labels used by the UI", () => {
    expect(OVER_TIME_MULTIPLIER).toBe(1.5);
    expect(SHIFT_BASE_HOURS).toBe(8);
    expect(SHIFT_LABEL.day).toBe("Day");
    expect(SHIFT_LABEL.night).toBe("Night");
    expect(SHIFT_LABEL.special).toBe("Special");
  });
});

describe("attendanceTally", () => {
  const rows = [
    { attendeeName: "A", status: "present", overtime: 1 },
    { attendeeName: "A", status: "present", overtime: 2 },
    { attendeeName: "A", status: "half_day", overtime: 0 },
    { attendeeName: "B", status: "absent" },
    { attendeeName: "B", status: "on_site_late" },
  ];
  it("present counts as 1, on_site_late as 1, half_day as 0.5, absent as 0", () => {
    const t = attendanceTally(rows);
    expect(t.A.presentDays).toBe(2.5);
    expect(t.B.presentDays).toBe(1);
  });
  it("sums overtime per attendee and ignores null", () => {
    const t = attendanceTally(rows);
    expect(t.A.overtimeHours).toBe(3);
    expect(t.B.overtimeHours).toBe(0);
  });
});

describe("shiftQueries — DB mappers", () => {
  it("listShiftRoster maps camelCase + coerces unknown shift name to day", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ data: [
      { id: "1", labour_id: "l1", worker_name: "Ravi", shift_date: "2026-08-01", shift_name: "night", start_time: "20:00", end_time: "04:00", notes: null },
      { id: "2", labour_id: null, worker_name: "Sita", shift_date: "2026-08-01", shift_name: "bogus", start_time: null, end_time: null, notes: "x" },
    ], error: null }) }) }) }) };
    const res = await listShiftRoster(client, "proj1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ id: "1", labourId: "l1", workerName: "Ravi", shiftDate: "2026-08-01", shiftName: "night", startTime: "20:00", endTime: "04:00" });
    expect(res.data[1].shiftName).toBe("day");
    expect(res.data[1].notes).toBe("x");
  });

  it("listShiftRoster surfaces DB errors", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ data: null, error: { message: "boom" } }) }) }) }) };
    const res = await listShiftRoster(client, "p");
    expect(res).toEqual({ ok: false, error: "boom" });
  });

  it("createShiftRoster inserts body incl. defaults + returns id", async () => {
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "n1" }, error: null }) }) });
    const client = { from: vi.fn().mockReturnValue({ insert }) };
    const res = await createShiftRoster(client, { projectId: "p", workerName: "Ravi", shiftDate: "2026-08-01", shiftName: "night", startTime: "20:00" });
    expect(res).toEqual({ ok: true, data: { id: "n1" } });
    expect(client.from).toHaveBeenCalledWith("shift_roster");
    expect(insert).toHaveBeenCalledWith({
      project_id: "p", worker_name: "Ravi", shift_date: "2026-08-01", shift_name: "night",
      start_time: "20:00", end_time: null, notes: null,
    });
  });

  it("deleteShiftRoster calls delete by id + surfaces error", async () => {
    const okClient = { from: () => ({ delete: () => ({ eq: () => ({ error: null }) }) }) };
    const res = await deleteShiftRoster(okClient, "id1");
    expect(res).toEqual({ ok: true, data: { ok: true } });

    const bad = { from: () => ({ delete: () => ({ eq: () => ({ error: { message: "nope" } }) }) }) };
    expect(await deleteShiftRoster(bad, "id1")).toEqual({ ok: false, error: "nope" });
  });
});