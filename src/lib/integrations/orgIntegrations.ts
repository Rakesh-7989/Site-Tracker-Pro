// SiteTrack Pro — org integrations (provider creds) queries. An org admin
// stores their OWN 3rd-party provider accounts. Status is
// read via a booleans-only RPC (secrets never leave the DB); writes are direct
// table upserts gated by RLS (org admin) — migration 83.

export type IResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type ProviderId = "whatsapp" | "ai" | "razorpay";

export interface ProviderMeta { id: ProviderId; label: string; icon: string; help: string; fields: Array<[string, string]>; policyNote?: string; }

export const PROVIDERS: ProviderMeta[] = [
  { id: "whatsapp", label: "WhatsApp Business", icon: "send", help: "Send DPRs + invoice links via the WhatsApp Business API (your own Meta account).", fields: [["phone_id", "Phone number ID"], ["token", "System user access token"], ["template_id", "Template ID"]], policyNote: "Paused under the zero-cost policy — WhatsApp Business API is a paid Meta service. Email + in-app notifications are active instead." },
  { id: "ai", label: "AI Insights", icon: "zap", help: "Powers AI Insights + cost forecaster. Your provider bills you for tokens.", fields: [["provider", "Provider (openai / anthropic)"], ["key", "API key"], ["model", "Model name"]] },
  { id: "razorpay", label: "Razorpay", icon: "credit-card", help: "Invoice payment links + UPI deep-links (your Razorpay merchant account).", fields: [["key_id", "Key ID"], ["key_secret", "Key secret"], ["vpa", "UPI VPA (optional)"]] },
];

// Which field names are secrets (rendered as password inputs).
export const SECRET_FIELDS = new Set(["token", "key", "key_secret"]);

export type IntegrationStatus = Record<ProviderId, boolean>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getIntegrationStatus(client: any, orgId: string): Promise<IResult<IntegrationStatus>> {
  try {
    const { data, error } = await client.rpc("org_integrations_status", { p_org: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const r = (data ?? {}) as Record<string, unknown>;
    return { ok: true, data: { whatsapp: r.whatsapp === true, ai: r.ai === true, razorpay: r.razorpay === true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveProvider(client: any, orgId: string, provider: ProviderId, config: Record<string, string>, updatedBy: string): Promise<IResult<{ ok: true }>> {
  try {
    const row: Record<string, unknown> = { org_id: orgId, updated_by: updatedBy };
    row[provider] = config;
    const { error } = await client.from("org_integrations").upsert(row, { onConflict: "org_id" });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clearProvider(client: any, orgId: string, provider: ProviderId, updatedBy: string): Promise<IResult<{ ok: true }>> {
  try {
    const patch: Record<string, unknown> = { updated_by: updatedBy };
    patch[provider] = {};
    const { error } = await client.from("org_integrations").update(patch).eq("org_id", orgId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}