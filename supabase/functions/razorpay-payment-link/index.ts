// SiteTrack Pro — create a Razorpay Payment Link for an invoice.
//
// Architect (orgadmin/pm) calls this to generate a shareable Razorpay
// payment link. The link is posted to the Razorpay API and stored so the
// invoice can be marked paid when the webhook arrives.
//
// Deploy:
//   supabase functions deploy razorpay-payment-link
//
// Then call from the frontend:
//   POST /functions/v1/razorpay-payment-link
//   { invoice_id, project_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  currency: string;
}

interface RequestBody {
  invoice_id: string;
  project_id?: string;
  mode?: "create" | "get";
}

function base64Credentials(keyId: string, secret: string): string {
  return btoa(`${keyId}:${secret}`);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method-not-allowed" }), {
      status: 405,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Auth: require a valid user JWT.
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "bad-json" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { invoice_id, project_id, mode = "create" } = body;
  if (!invoice_id) {
    return new Response(JSON.stringify({ ok: false, error: "invoice_id required" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    return new Response(JSON.stringify({ ok: false, error: "service-not-configured" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(url, serviceRole);

  // Verify the caller is a member of the invoice's org (read invoice first).
  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select("id, project_id, amount, status, org_id, razorpay_payment_link_id")
    .eq("id", invoice_id)
    .single();

  if (invoiceErr || !invoice) {
    return new Response(JSON.stringify({ ok: false, error: "invoice-not-found" }), {
      status: 404,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Resolve Razorpay credentials: per-org first (org_integrations), else EF secrets.
  let keyId = Deno.env.get("RAZORPAY_KEY_ID") || "";
  let secret = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
  if (invoice.org_id) {
    const { data: orgCfg } = await supabase
      .from("org_integrations")
      .select("razorpay")
      .eq("org_id", invoice.org_id)
      .limit(1)
      .maybeSingle();
    const razorpay = (orgCfg?.razorpay ?? {}) as Record<string, unknown> | null;
    if (razorpay && typeof razorpay.key_id === "string" && razorpay.key_id) keyId = razorpay.key_id;
    if (razorpay && typeof razorpay.key_secret === "string" && razorpay.key_secret) secret = razorpay.key_secret;
  }
  if (!keyId || !secret) {
    return new Response(JSON.stringify({ ok: false, error: "razorpay-not-configured" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const auth = base64Credentials(keyId, secret);

  // "get" mode: return the existing link's live short_url + status from Razorpay
  // (no new link created). Falls back to creating one if none exists yet.
  if (mode === "get") {
    const existingLinkId = String(invoice.razorpay_payment_link_id || "");
    if (existingLinkId && existingLinkId !== "null" && existingLinkId !== "undefined") {
      try {
        const res = await fetch(`${RAZORPAY_BASE}/payment_links/${existingLinkId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        });
        if (res.ok) {
          const pl = await res.json() as RazorpayPaymentLink;
          return new Response(JSON.stringify({
            ok: true,
            payment_link_id: pl.id,
            short_url: pl.short_url,
            status: pl.status,
            amount: pl.amount,
          }), {
            status: 200,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
        console.warn("razorpay get link failed, falling back to create:", res.status);
      } catch (e) {
        console.error("razorpay get link error, falling back to create:", e);
      }
    }
  }

  // Don't create a link for an already-paid invoice.
  if (invoice.status === "paid") {
    return new Response(JSON.stringify({ ok: false, error: "already-paid" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Build the Razorpay payment link payload.
  // Amount in paise (integer). Razorpay expects amount >= 100 for INR.
  const amountInPaise = Math.max(100, Math.round((invoice.amount || 0) * 100));

  let razorpayPayload: Record<string, unknown> = {
    amount: amountInPaise,
    currency: "INR",
    description: `Invoice ${invoice_id}`,
    notify: { sms: true, email: true },
    reminder_enable: true,
    notes: {
      sitetrack_invoice_id: invoice_id,
    },
    callback_url: `${(Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrackpro.in").replace(/\/+$/, "")}/invoices/${invoice_id}`,
    callback_method: "get",
  };

  if (project_id) {
    razorpayPayload.notes = {
      sitetrack_invoice_id: invoice_id,
      sitetrack_project_id: project_id,
    };
  }

  let razorpayResponse: RazorpayPaymentLink;
  try {
    const res = await fetch(`${RAZORPAY_BASE}/payment_links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(razorpayPayload),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.warn("razorpay create link failed:", res.status, errBody);
      return new Response(JSON.stringify({ ok: false, error: "razorpay-error", detail: errBody }), {
        status: 502,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    razorpayResponse = await res.json() as RazorpayPaymentLink;
  } catch (e) {
    console.error("razorpay fetch error:", e);
    return new Response(JSON.stringify({ ok: false, error: "razorpay-fetch-failed", detail: (e instanceof Error ? e.message : String(e)) }), {
      status: 502,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Store the payment link in the invoices table.
  const { error: updateErr } = await supabase
    .from("invoices")
    .update({
      razorpay_payment_link_id: razorpayResponse.id,
      razorpay_status: "created",
    })
    .eq("id", invoice_id);

  if (updateErr) {
    console.error("Failed to update invoice:", updateErr);
  }

  return new Response(JSON.stringify({
    ok: true,
    payment_link_id: razorpayResponse.id,
    short_url: razorpayResponse.short_url,
    status: razorpayResponse.status,
    amount: razorpayResponse.amount,
  }), {
    status: 200,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
});