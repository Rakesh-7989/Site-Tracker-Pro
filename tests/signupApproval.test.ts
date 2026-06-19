import { describe, expect, it } from "vitest";

import { canApproveSignupRequest } from "../supabase/functions/_shared/signupApproval";

describe("canApproveSignupRequest", () => {
  it("lets owner approve without payment", () => {
    expect(canApproveSignupRequest(
      { staffTier: "owner" },
      { payment_status: "unpaid", paid_by: null },
    )).toEqual({ ok: true });
  });

  it("blocks non-owner staff when payment is unpaid or waived", () => {
    expect(canApproveSignupRequest(
      { staffTier: "head" },
      { payment_status: "unpaid", paid_by: null },
    )).toEqual({ ok: false, reason: "owner-payment-required" });

    expect(canApproveSignupRequest(
      { staffTier: "member" },
      { payment_status: "waived", paid_by: "owner-1" },
      new Set(["owner-1"]),
    )).toEqual({ ok: false, reason: "owner-payment-required" });
  });

  it("lets non-owner staff approve only when payment was confirmed by owner", () => {
    expect(canApproveSignupRequest(
      { staffTier: "head" },
      { payment_status: "paid", paid_by: "owner-1" },
      new Set(["owner-1"]),
    )).toEqual({ ok: true });
  });

  it("blocks paid requests when paid_by is missing or not an owner", () => {
    expect(canApproveSignupRequest(
      { staffTier: "head" },
      { payment_status: "paid", paid_by: null },
      new Set(["owner-1"]),
    )).toEqual({ ok: false, reason: "owner-payment-required" });

    expect(canApproveSignupRequest(
      { staffTier: "head" },
      { payment_status: "paid", paid_by: "head-1" },
      new Set(["owner-1"]),
    )).toEqual({ ok: false, reason: "owner-payment-required" });
  });
});
