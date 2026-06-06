// SiteTrack Pro — public signup request submission (approval-gated onboarding).
// Calls the submit_signup_request Edge Function (public, --no-verify-jwt) via
// the anon Supabase client. No session required.

export type SignupPlan = "basic" | "pro" | "business" | "custom";
export interface SignupInput {
  firmName: string;
  contactName: string;
  email: string;
  phone?: string;
  plan: SignupPlan;
  message?: string;
  /** Honeypot — real users leave this empty; bots fill it. */
  website?: string;
  /** Version of Terms + Privacy the applicant agreed to (DPDP consent). */
  consentVersion?: string;
}
export type SignupResult = { ok: true } | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  const mod = await import("../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

export async function submitSignupRequest(
  input: SignupInput,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  injectedClient?: any,
): Promise<SignupResult> {
  try {
    const client = injectedClient ?? (await getClient());
    if (!client) return { ok: false, error: "Backend not configured." };
    const { data, error } = await client.functions.invoke("submit_signup_request", { body: input });
    if (error) {
      // The EF returns a JSON error body on 4xx; surface its friendly message.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = await (error as any).context?.json?.();
        if (body?.message || body?.error) return { ok: false, error: String(body.message ?? body.error) };
      } catch { /* fall through */ }
      return { ok: false, error: error.message || "Could not submit your request. Please try again." };
    }
    if (data?.ok) return { ok: true };
    return { ok: false, error: data?.message || data?.error || "Could not submit your request." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
