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
  createdAt: string;
}

const asStatus = (v: unknown): SignupStatus => (["pending", "approved", "rejected"].includes(v as string) ? (v as SignupStatus) : "pending");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listSignupRequests(client: any, status?: SignupStatus): Promise<SAResult<SignupRequestRow[]>> {
  try {
    let q = client.from("signup_requests").select("id, firm_name, contact_name, email, phone, plan, message, status, review_notes, reviewed_at, created_org_id, created_at").order("created_at", { ascending: false });
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
