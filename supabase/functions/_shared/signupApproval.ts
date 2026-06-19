export interface SignupApprovalUser {
  staffTier?: string | null;
}

export interface SignupApprovalRequest {
  payment_status?: unknown;
  paid_by?: unknown;
}

export interface SignupApprovalDecision {
  ok: boolean;
  reason?: "owner-payment-required";
}

export function isStaffOwner(user: SignupApprovalUser): boolean {
  return user.staffTier === "owner";
}

export function canApproveSignupRequest(
  user: SignupApprovalUser,
  request: SignupApprovalRequest,
  ownerConfirmedPaymentByIds: ReadonlySet<string> = new Set(),
): SignupApprovalDecision {
  if (isStaffOwner(user)) return { ok: true };

  const paymentStatus = String(request.payment_status ?? "unpaid");
  const paidBy = request.paid_by == null ? "" : String(request.paid_by);
  if (paymentStatus === "paid" && paidBy && ownerConfirmedPaymentByIds.has(paidBy)) {
    return { ok: true };
  }

  return { ok: false, reason: "owner-payment-required" };
}
