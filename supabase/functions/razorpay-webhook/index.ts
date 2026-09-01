// SiteTrack Pro — Razorpay webhook handler.
//
// Razorpay POSTs events here when a payment link is paid, failed, or
// expired. We verify the HMAC-SHA256 signature, then update the invoice
// status accordingly.
//
// Webhook events we handle (entity nested under payload.<type>.entity):
//   payment.captured         → invoice.paid
//   payment.failed           → invoice.failed
//   payment.expired          → invoice.expired
//   payment.refunded         → invoice.cancelled
//   payment.partially_refunded → invoice.partial
//   payment_link.paid        → invoice.paid
//   payment_link.cancelled   → invoice.cancelled
//   payment_link.expired     → invoice.expired
//   payment_link.partially_paid → invoice.partial
//
// The invoice is resolved from the payment-link notes (sitetrack_invoice_id),
// falling back to a search by razorpay_payment_link_id on the invoices table.
// For all other events we return 200 (ack) so Razorpay stops retrying.
//
// Deploy:
//   supabase functions deploy razorpay-webhook --no-verify-jwt
//
// Then in the Razorpay dashboard → Settings → Webhooks, set:
//   https://<proj>.supabase.co/functions/v1/razorpay-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
const RAZORPAY_WEBHOOK_SECRET_FALLBACK = Deno.env.get("RAZORPAY_KEY_SECRET");

// Razorpay signs the raw webhook payload with HMAC-SHA256 and sends the
// hex digest in the X-Razorpay-Signature header. Verify with the Web Crypto
// API (Deno-native), matching the cashfree/_shared pattern.
function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = WEBHOOK_SECRET || RAZORPAY_WEBHOOK_SECRET_FALLBACK;
  if (!rawBody || !signature || !secret) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const expected = bytesToHex(sigBuf);
    if (expected.length !== signature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  const eventId = req.headers.get("x-razorpay-event-id") || "";

  if (!(await verifySignature(rawBody, signature))) {
    console.warn("Razorpay webhook signature invalid", { eventId, sigPrefix: signature.slice(0, 8) });
    return new Response("Invalid signature", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    return new Response("Service not configured", { status: 500 });
  }

  let parsed: { event?: string; payload?: Record<string, { entity?: Record<string, unknown> }> };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = createClient(url, serviceRole);

  const eventType = parsed.event || "";
  const payload = parsed.payload || {};

  // Razorpay nests the affected entity under payload.payment_link.entity for
  // payment_link.* events, or payload.payment.entity for payment.* events.
  const paymentLinkEntity = payload.payment_link?.entity as Record<string, unknown> | undefined;
  const paymentEntity = payload.payment?.entity as Record<string, unknown> | undefined;
  const entity = paymentLinkEntity || paymentEntity || {};

  const paymentLinkId = String(
    paymentLinkEntity?.id || entity.razorpay_payment_link_id || "",
  );
  const notes = (entity.notes || {}) as Record<string, unknown>;
  const notesInvoiceId = String(notes.sitetrack_invoice_id || "");

  async function resolveInvoiceId(): Promise<string | null> {
    if (notesInvoiceId && notesInvoiceId !== "null" && notesInvoiceId !== "undefined") {
      return notesInvoiceId;
    }
    if (!paymentLinkId || paymentLinkId === "undefined" || paymentLinkId === "null") {
      return null;
    }
    const { data: found } = await supabase
      .from("invoices")
      .select("id")
      .eq("razorpay_payment_link_id", paymentLinkId)
      .maybeSingle();
    return found ? found.id : null;
  }

  const invoiceId = await resolveInvoiceId();
  if (!invoiceId) {
    console.warn("Razorpay webhook: no matching invoice", { eventType, paymentLinkId });
    return new Response(JSON.stringify({ ok: true, message: "no matching invoice" }), { status: 200 });
  }

  const newStatus = mapRazorpayStatus(eventType);
  if (newStatus === "pending") {
    // Unknown event — ack anyway so Razorpay stops retrying.
    return new Response(JSON.stringify({ ok: true, event: eventType, ignored: true }), { status: 200 });
  }

  const updates: Record<string, unknown> = {
    razorpay_status: newStatus,
    razorpay_payment_at: new Date().toISOString(),
  };
  if (paymentLinkId && paymentLinkId !== "null" && paymentLinkId !== "undefined") {
    updates.razorpay_payment_link_id = paymentLinkId;
  }

  // Mark paid_date when captured/paid.
  if (newStatus === "paid" || newStatus === "partial") {
    updates["paid_date"] = new Date().toISOString().split("T")[0];
  }

  const { error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", invoiceId);

  if (error) {
    console.error("Failed to update invoice status:", error);
    return new Response(JSON.stringify({ ok: false, error: "update-failed" }), { status: 500 });
  }

  console.log(`Razorpay webhook: invoice ${invoiceId} → ${newStatus} (event: ${eventType})`);

  return new Response(JSON.stringify({ ok: true, invoice_id: invoiceId, status: newStatus }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function mapRazorpayStatus(eventType: string): string {
  const statusMap: Record<string, string> = {
    "payment.captured": "paid",
    "payment.failed": "failed",
    "payment.expired": "expired",
    "payment.refunded": "cancelled",
    "payment.partially_refunded": "partial",
    "payment_link.paid": "paid",
    "payment_link.cancelled": "cancelled",
    "payment_link.expired": "expired",
    "payment_link.partially_paid": "partial",
  };
  return statusMap[eventType] || "pending";
}