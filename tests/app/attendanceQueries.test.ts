// SiteTrack Pro — attendance query helpers (P-F follow-up: kiosk clock-out RPC).

import { describe, it, expect, vi } from "vitest";
import {
  listAttendance, createAttendance, setAttendanceStatus, deleteAttendance, clockOutAttendance,
} from "@/app/attendanceQueries";

const fromClient = (result: { data?: unknown; error?: unknown }) => {
  // Supabase query builders are thenable: every method returns the chain and
  // awaiting the terminal call resolves to `result`. `then` makes that work.
  const chain: any = {
    then: (resolve: (v: unknown) => void) => resolve(result),
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    single: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: () => chain,
  };
  return { from: () => chain };
};

describe("listAttendance", () => {
  it("maps camelCase fields + coerces kinds/statuses with safe fallbacks", async () => {
    const r = await listAttendance(fromClient({ data: [
      { id: "1", attendee_name: "Ravi", attendee_kind: "labour", date: "2026-08-15", status: "present", hours: "8.5", overtime: "1.5" },
      { id: "2", attendee_name: "", attendee_kind: "weird", date: null, status: "bogus", hours: null, overtime: null },
    ], error: null }), "p1");
    expect(r.ok && r.data).toMatchObject([
      { id: "1", attendeeName: "Ravi", kind: "labour", date: "2026-08-15", status: "present", hours: 8.5, overtime: 1.5 },
      { id: "2", attendeeName: "", kind: "labour", date: "", status: "present", hours: null, overtime: null },
    ]);
  });
  it("surfaces errors", async () => {
    const r = await listAttendance(fromClient({ data: null, error: { message: "boom" } }), "p1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("boom");
  });
});

describe("createAttendance", () => {
  it("inserts the row and returns the id", async () => {
    const r = await createAttendance(fromClient({ data: { id: "a1" }, error: null }), {
      projectId: "p1", attendeeName: "Ravi", kind: "labour", status: "present", recordedBy: "u1",
    });
    expect(r.ok && r.data).toEqual({ id: "a1" });
  });
  it("surfaces errors", async () => {
    const r = await createAttendance(fromClient({ data: null, error: { message: "nope" } }), {
      projectId: "p1", attendeeName: "Ravi", kind: "labour", status: "present", recordedBy: "u1",
    });
    expect(r.ok).toBe(false);
  });
});

describe("setAttendanceStatus / deleteAttendance", () => {
  it("update + delete happy path", async () => {
    expect((await setAttendanceStatus(fromClient({ data: null, error: null }), "a1", "absent")).ok).toBe(true);
    expect((await deleteAttendance(fromClient({ data: null, error: null }), "a1")).ok).toBe(true);
  });
  it("surface errors", async () => {
    expect((await setAttendanceStatus(fromClient({ error: { message: "x" } }), "a1", "absent")).ok).toBe(false);
    expect((await deleteAttendance(fromClient({ error: { message: "y" } }), "a1")).ok).toBe(false);
  });
});

describe("clockOutAttendance (kiosk RPC)", () => {
  it("calls the kiosk_clock_out RPC with the attendance id, out time and hours", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const ok = await clockOutAttendance({ rpc }, "a1", "17:30:00", 8.5);
    expect(ok.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("kiosk_clock_out", { p_attendance_id: "a1", p_out_time: "17:30:00", p_hours: 8.5 });
  });
  it("surfaces the RPC error message", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "worker is not checked in" } });
    const r = await clockOutAttendance({ rpc }, "a1", "17:30:00", 8.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("worker is not checked in");
  });
});
