// SiteTrack Pro — self-service org registration queries.

import type { CompanySegment } from "@/auth";
import type { BillingPeriod } from "@/features/marketing/plans";

export type RegisterPlan = "basic" | "pro" | "business";
export interface RegisterInput {
  email: string;
  password: string;
  firmName: string;
  contactName: string;
  phone?: string;
  /** Optional — the minimal identity screen omits this; the EF defaults to the Pro trial. */
  plan?: RegisterPlan;
  /** Billing cycle chosen at signup — "monthly" | "annual" (P-D unified flow). */
  billing?: BillingPeriod;
  /** What kind of company this org is (migration 134). Optional — set in onboarding. */
  segment?: CompanySegment;
  consentVersion?: string;
  /** Honeypot — bots autofill this hidden field; real users leave it empty. */
  website?: string;
}
export type RegisterResult =
  | { ok: true; orgId: string; emailSent: boolean; plan?: RegisterPlan; trialEndsAt?: string }
  | { ok: false; error: string };

async function getClient(): Promise<any | null> {
  const mod = await import("../lib/supabase");
  return await (mod as any).getSupabaseClient();
}

export async function registerOrg(
  input: RegisterInput,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  injectedClient?: any,
): Promise<RegisterResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = injectedClient ?? (await getClient());
    if (!client) return { ok: false, error: "Backend not configured." };
    
    const anonKey = (client as any).supabaseKey || "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let error: any = null;

    const invokeHeaders: Record<string, string> = {};
    if (anonKey) {
      invokeHeaders.apikey = anonKey;
      invokeHeaders.Authorization = `Bearer ${anonKey}`;
    }

    try {
      const res = await client.functions.invoke("register_org", {
        body: input,
        headers: invokeHeaders,
      });
      data = res.data;
      error = res.error;
    } catch (invErr) {
      error = invErr;
    }

    // Resilient fallback: if Edge function fails due to CORS/network or invalid auth headers
    const errMsg = String(error?.message || "");
    const isNetworkOrAuthErr = errMsg.includes("Failed to send") || errMsg.includes("Invalid JWT") || error?.name === "FunctionsFetchError" || error?.name === "FunctionsHttpError";

    if (error && isNetworkOrAuthErr) {
      try {
        if (typeof window !== "undefined" && window.location?.origin) {
          const proxyRes = await fetch(`${window.location.origin}/api/ef/register_org`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
            },
            body: JSON.stringify(input),
          });
          const proxyData = await proxyRes.json().catch(() => ({}));
          if (proxyRes.ok && proxyData?.ok) {
            return { ok: true, orgId: proxyData.orgId, emailSent: proxyData.emailSent ?? false, plan: proxyData.plan, trialEndsAt: proxyData.trialEndsAt };
          }
          if (proxyData?.message || proxyData?.error) {
            return { ok: false, error: String(proxyData.message ?? proxyData.error) };
          }
        }
      } catch { /* proceed to default error handler */ }
    }

    if (error) {
      try {
        const body = await (error as any).context?.json?.();
        if (body?.message || body?.error) return { ok: false, error: String(body.message ?? body.error) };
      } catch { }
      return { ok: false, error: error.message || "Could not create your organization." };
    }
    if (data?.ok) return { ok: true, orgId: data.orgId, emailSent: data.emailSent ?? false, plan: data.plan, trialEndsAt: data.trialEndsAt };
    return { ok: false, error: data?.message || data?.error || "Could not create your organization." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ResendResult = { ok: true; emailSent: boolean } | { ok: false; error: string };

export async function resendConfirmation(
  email: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  injectedClient?: any,
): Promise<ResendResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = injectedClient ?? (await getClient());
    if (!client) return { ok: false, error: "Backend not configured." };
    
    const anonKey = (client as any).supabaseKey || "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let error: any = null;

    const invokeHeaders: Record<string, string> = {};
    if (anonKey) {
      invokeHeaders.apikey = anonKey;
      invokeHeaders.Authorization = `Bearer ${anonKey}`;
    }

    try {
      const res = await client.functions.invoke("resend_confirmation", {
        body: { email },
        headers: invokeHeaders,
      });
      data = res.data;
      error = res.error;
    } catch (invErr) {
      error = invErr;
    }

    const errMsg = String(error?.message || "");
    const isNetworkOrAuthErr = errMsg.includes("Failed to send") || errMsg.includes("Invalid JWT") || error?.name === "FunctionsFetchError" || error?.name === "FunctionsHttpError";

    if (error && isNetworkOrAuthErr) {
      try {
        if (typeof window !== "undefined" && window.location?.origin) {
          const proxyRes = await fetch(`${window.location.origin}/api/ef/resend_confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
            },
            body: JSON.stringify({ email }),
          });
          const proxyData = await proxyRes.json().catch(() => ({}));
          if (proxyRes.ok && proxyData?.ok) {
            return { ok: true, emailSent: proxyData.emailSent ?? false };
          }
          if (proxyData?.message || proxyData?.error) {
            return { ok: false, error: String(proxyData.message ?? proxyData.error) };
          }
        }
      } catch { /* proceed to default error handler */ }
    }

    if (error) {
      try {
        const body = await (error as any).context?.json?.();
        if (body?.message || body?.error) return { ok: false, error: String(body.message ?? body.error) };
      } catch { }
      return { ok: false, error: error.message || "Could not resend the confirmation email." };
    }
    if (data?.ok) return { ok: true, emailSent: data.emailSent ?? false };
    return { ok: false, error: data?.message || data?.error || "Could not resend the confirmation email." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
