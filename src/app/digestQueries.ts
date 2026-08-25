// SiteTrack Pro — digest subscription & dispatch queries.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const err = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbErr = (error: { message?: string }): Result<never> => ({ ok: false, error: String(error.message ?? error) });

export type DigestLang = "en" | "te" | "hi";
export type DigestStatus = "active" | "paused" | "cancelled";
export interface DigestSubscription { id: string; orgId: string; projectId: string | null; promoterPhoneE164: string; promoterName: string | null; language: DigestLang; timezone: string; hourLocal: number; status: DigestStatus; projectName: string | null; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listDigestSubscriptions(client: any, orgId: string): Promise<Result<DigestSubscription[]>> {
  try {
    const { data, error } = await client.from("digest_subscriptions").select("id, org_id, project_id, promoter_phone_e164, promoter_name, language, timezone, hour_local, status").eq("org_id", orgId).order("created_at", { ascending: false });
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), orgId: String(r.org_id), projectId: r.project_id == null ? null : String(r.project_id), promoterPhoneE164: String(r.promoter_phone_e164 ?? ""), promoterName: r.promoter_name == null ? null : String(r.promoter_name), language: (r.language as DigestLang) || "en", timezone: String(r.timezone ?? "Asia/Kolkata"), hourLocal: Number(r.hour_local ?? 7), status: (r.status as DigestStatus) || "active", projectName: null,
    })));
  } catch (e) { return err(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createDigestSubscription(client: any, input: { orgId: string; projectId?: string; promoterPhoneE164: string; promoterName?: string; language?: DigestLang; hourLocal?: number }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.rpc("subscribe_to_daily_digest", {
      p_project_id: input.projectId ?? null, p_promoter_phone_e164: input.promoterPhoneE164, p_promoter_name: input.promoterName || null, p_language: input.language || "en", p_hour_local: input.hourLocal ?? 7,
    });
    if (error) return dbErr(error); return ok({ id: String(data) });
  } catch (e) { return err(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateDigestSubscription(client: any, id: string, patch: { status?: DigestStatus; language?: DigestLang; hourLocal?: number; promoterName?: string }): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("digest_subscriptions").update(patch).eq("id", id);
    if (error) return dbErr(error); return ok({ ok: true });
  } catch (e) { return err(e); }
}

 
export interface DigestDispatch { id: string; sentForDate: string; dispatchedAt: string; outcome: string; metaMessageId: string | null; failureReason: string | null; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listDigestDispatches(client: any, subscriptionId: string): Promise<Result<DigestDispatch[]>> {
  try {
    const { data, error } = await client.from("digest_dispatches").select("id, sent_for_date, dispatched_at, outcome, meta_message_id, failure_reason").eq("subscription_id", subscriptionId).order("sent_for_date", { ascending: false }).limit(30);
    if (error) return dbErr(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), sentForDate: String(r.sent_for_date ?? ""), dispatchedAt: String(r.dispatched_at ?? ""), outcome: String(r.outcome ?? ""), metaMessageId: r.meta_message_id == null ? null : String(r.meta_message_id), failureReason: r.failure_reason == null ? null : String(r.failure_reason),
    })));
  } catch (e) { return err(e); }
}