// SiteTrack Pro — superadmin signup-queue queries. Reads the signup_requests
// table directly (RLS = superadmin); approve/reject go through the
// review_signup_request Edge Function (creates org + invite on approve).

export type SAResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type SignupStatus = "pending" | "approved" | "rejected";
export interface SignupRequestRow {
  id: string;
  firmName: string;
  contactName: string;
  email: string;
  phone: string | null;
  plan: string;
  message: string | null;
  status: SignupStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdOrgId: string | null;
  assignedStaffId: string | null;
  paymentStatus: "unpaid" | "paid" | "waived";
  paymentRef: string | null;
  paidAt: string | null;
  createdAt: string;
}

const asStatus = (v: unknown): SignupStatus => (["pending", "approved", "rejected"].includes(v as string) ? (v as SignupStatus) : "pending");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listSignupRequests(client: any, status?: SignupStatus): Promise<SAResult<SignupRequestRow[]>> {
  try {
    let q = client.from("signup_requests").select("id, firm_name, contact_name, email, phone, plan, message, status, review_notes, reviewed_at, created_org_id, assigned_staff_id, payment_status, payment_ref, paid_at, created_at").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), firmName: String(r.firm_name ?? ""), contactName: String(r.contact_name ?? ""),
      email: String(r.email ?? ""), phone: r.phone == null ? null : String(r.phone), plan: String(r.plan ?? "basic"),
      message: r.message == null ? null : String(r.message), status: asStatus(r.status),
      reviewNotes: r.review_notes == null ? null : String(r.review_notes),
      reviewedAt: r.reviewed_at == null ? null : String(r.reviewed_at),
      createdOrgId: r.created_org_id == null ? null : String(r.created_org_id),
      assignedStaffId: r.assigned_staff_id == null ? null : String(r.assigned_staff_id),
      paymentStatus: (["unpaid", "paid", "waived"].includes(String(r.payment_status)) ? String(r.payment_status) : "unpaid") as "unpaid" | "paid" | "waived",
      paymentRef: r.payment_ref == null ? null : String(r.payment_ref),
      paidAt: r.paid_at == null ? null : String(r.paid_at),
      createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pendingSignupCount(client: any): Promise<number> {
  try {
    const { data, error } = await client.rpc("pending_signup_count");
    if (error) return 0;
    return Number(data) || 0;
  } catch { return 0; }
}

export interface ReviewResult { ok: true; orgId?: string; emailSent?: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reviewSignupRequest(client: any, requestId: string, action: "approve" | "reject", notes?: string): Promise<SAResult<ReviewResult>> {
  try {
    const { data, error } = await client.functions.invoke("review_signup_request", { body: { requestId, action, notes } });
    if (error) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = await (error as any).context?.json?.();
        if (body?.message || body?.error) return { ok: false, error: String(body.message ?? body.error) };
      } catch { /* fall through */ }
      return { ok: false, error: error.message || "Review failed." };
    }
    if (data?.ok) return { ok: true, data: { ok: true, orgId: data.orgId, emailSent: data.emailSent } };
    return { ok: false, error: data?.message || data?.error || "Review failed." };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Create a Cashfree payment link for a signup (emailed to the customer). EF cashfree-checkout. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createCheckoutLink(client: any, requestId: string, period: "monthly" | "annual" = "annual"): Promise<SAResult<{ linkUrl: string; amount: number }>> {
  try {
    const { data, error } = await client.functions.invoke("cashfree-checkout", { body: { signupRequestId: requestId, period } });
    if (error) {
      let msg = String(error.message ?? "Checkout failed.");
      try { const b = await error.context.json(); msg = b.message || b.error || msg; } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
    return data?.ok ? { ok: true, data: { linkUrl: String(data.linkUrl), amount: Number(data.amount) } } : { ok: false, error: String(data?.message ?? data?.error ?? "Checkout failed.") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Staff confirms (manual) payment for a paid-plan signup. RPC mark_signup_paid (mig 104). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function markSignupPaid(client: any, requestId: string, status: "unpaid" | "paid" | "waived", ref?: string): Promise<SAResult<true>> {
  try {
    const { error } = await client.rpc("mark_signup_paid", { p_request: requestId, p_ref: ref ?? null, p_status: status });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
