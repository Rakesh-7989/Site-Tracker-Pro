// SiteTrack Pro — self-service org registration queries.

export type RegisterPlan = "basic" | "pro" | "business";
export interface RegisterInput {
  email: string;
  password: string;
  firmName: string;
  contactName: string;
  phone?: string;
  plan: RegisterPlan;
}
export type RegisterResult = { ok: true; orgId: string; emailSent: boolean } | { ok: false; error: string };

async function getClient(): Promise<any | null> {
  const mod = await import("../lib/supabase.js");
  return await (mod as any).getSupabaseClient();
}

export async function registerOrg(input: RegisterInput): Promise<RegisterResult> {
  try {
    const client = await getClient();
    if (!client) return { ok: false, error: "Backend not configured." };
    const { data, error } = await client.functions.invoke("register_org", { body: input });
    if (error) {
      try {
        const body = await (error as any).context?.json?.();
        if (body?.message || body?.error) return { ok: false, error: String(body.message ?? body.error) };
      } catch { }
      return { ok: false, error: error.message || "Could not create your organization." };
    }
    if (data?.ok) return { ok: true, orgId: data.orgId, emailSent: data.emailSent ?? false };
    return { ok: false, error: data?.message || data?.error || "Could not create your organization." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
