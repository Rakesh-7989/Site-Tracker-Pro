import { describe, it, expect } from "vitest";
import {
  signupSummary,
  slaText,
  statusTone,
  fmtDate,
  PAY_TONE,
  PAY_LABEL,
  SIGNUP_CSV_COLUMNS,
} from "@/features/admin/SignupRequestsView";
import type { SignupRequestRow } from "@/app/signupAdminQueries";

const row = (over: Partial<SignupRequestRow>): SignupRequestRow => ({
  id: "r1", firmName: "Acme", contactName: "A", email: "a@b.co", phone: null,
  plan: "pro", message: null, status: "pending", reviewNotes: null, reviewedAt: null,
  createdOrgId: null, assignedStaffId: null, paymentStatus: "unpaid", paymentRef: null,
  paidAt: null, paidBy: null, createdAt: "2026-08-13T10:00:00Z", ...over,
});

describe("signupSummary", () => {
  it("rolls up statuses + unpaid pending from the loaded rows", () => {
    const s = signupSummary([
      row({ id: "a", status: "pending", paymentStatus: "unpaid" }),
      row({ id: "b", status: "pending", paymentStatus: "paid", paidAt: "2026-08-13T09:00:00Z" }),
      row({ id: "c", status: "pending", paymentStatus: "unpaid" }),
      row({ id: "d", status: "approved" }),
      row({ id: "e", status: "rejected" }),
      row({ id: "f", status: "approved" }),
    ]);
    expect(s).toEqual({ pending: 3, approved: 2, rejected: 1, pendingUnpaid: 2 });
  });

  it("returns zero buckets on an empty queue", () => {
    expect(signupSummary([])).toEqual({ pending: 0, approved: 0, rejected: 0, pendingUnpaid: 0 });
  });
});

describe("slaText", () => {
  it("returns null for non-pending / unpaid / undated requests", () => {
    expect(slaText(row({ status: "approved" }))).toBeNull();
    expect(slaText(row({ status: "pending", paymentStatus: "unpaid" }))).toBeNull();
    expect(slaText(row({ status: "pending", paymentStatus: "paid", paidAt: null }))).toBeNull();
  });

  it("counts hours down to provision deadline and flips over", () => {
    const now = Date.now();
    const within = row({ status: "pending", paymentStatus: "paid", paidAt: new Date(now - 2 * 3600 * 1000).toISOString() });
    expect(slaText(within)).toEqual({ text: expect.stringMatching(/^Provision due in 22h$/), over: false });
    const overdue = row({ status: "pending", paymentStatus: "paid", paidAt: new Date(now - 30 * 3600 * 1000).toISOString() });
    expect(slaText(overdue)).toEqual({ text: expect.stringMatching(/^Overdue by 6h$/), over: true });
  });
});

describe("status + payment tone maps", () => {
  it("maps signup status to badge tones", () => {
    expect(statusTone("approved")).toBe("success");
    expect(statusTone("rejected")).toBe("danger");
    expect(statusTone("pending")).toBe("warning");
  });

  it("labels + tones payment states", () => {
    expect(PAY_LABEL.unpaid).toBe("Payment due");
    expect(PAY_LABEL.paid).toBe("Paid");
    expect(PAY_LABEL.waived).toBe("Waived");
    expect(PAY_TONE.unpaid).toBe("warning");
    expect(PAY_TONE.paid).toBe("success");
    expect(PAY_TONE.waived).toBe("neutral");
  });
});

describe("fmtDate", () => {
  it("formats a valid ISO timestamp", () => {
    expect(fmtDate("2026-08-13T10:00:00Z")).toMatch(/Aug/i);
    expect(fmtDate("2026-08-13T10:00:00Z")).toMatch(/13/);
  });

  it("falls back to the raw string on invalid input", () => {
    expect(fmtDate("nope")).toBe("nope");
  });
});

describe("SIGNUP_CSV_COLUMNS", () => {
  it("covers the queue's raw fields for export", () => {
    const keys = SIGNUP_CSV_COLUMNS.map(c => c.key);
    expect(keys).toContain("firmName");
    expect(keys).toContain("email");
    expect(keys).toContain("status");
    expect(keys).toContain("paymentStatus");
    expect(keys).toContain("createdAt");
    expect(SIGNUP_CSV_COLUMNS.length).toBeGreaterThanOrEqual(10);
  });
});