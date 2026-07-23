// SiteTrack Pro -- Razorpay payment integration (scaffold)
//
// Two integration modes:
//
//   1. Hosted Payment Links (recommended for v1)
//      Architect generates a Razorpay Payment Link from their dashboard, pastes
//      the URL into the invoice. Client clicks -> Razorpay-hosted UPI/card/
//      netbanking -> webhook updates invoice status. Zero credit card flow on
//      our domain, no PCI scope.
//
//   2. Razorpay Checkout SDK (later)
//      Pop the Razorpay modal inside SiteTrack. Requires server-side order
//      creation (Supabase Edge Function). Better UX but more setup.
//
// This module ships the helpers + UI glue. The Edge Function for webhook
// handling is queued in docs/BACKEND_PLAN.md.

interface RazorpayConfig {
  key_id?: string;
  upiId?: string;
  accountName?: string;
}

interface Invoice {
  id: string;
  amount: number;
  gst?: number;
  tds?: number;
  milestone?: string;
  no?: string;
  status?: string;
  paid_date?: string;
}

interface Project {
  id: string;
  name: string;
  client_name?: string;
  client_email?: string;
}

interface PaymentLinkRequest {
  amount: number;
  currency: string;
  accept_partial: boolean;
  description: string;
  customer: { name: string; email: string };
  notify: { sms: boolean; email: boolean };
  reminder_enable: boolean;
  notes: {
    sitetrack_invoice_id: string;
    sitetrack_project_id: string;
  };
  callback_url: string;
  callback_method: string;
}

const SETTINGS_KEY = "sitetrack_razorpay_v1";

export function getRazorpayConfig(): RazorpayConfig {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
  catch { return {}; }
}

export function saveRazorpayConfig(cfg: RazorpayConfig): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)); } catch {}
}

// Build the Razorpay Payment Link API request body so a server (or curl) can
// create the link. Returns the JSON the server should POST to
// https://api.razorpay.com/v1/payment_links.
export function buildPaymentLinkRequest(invoice: Invoice, project: Project): PaymentLinkRequest {
  const grossAmount = Math.round((invoice.amount || 0) * (1 + (invoice.gst || 0) / 100) * (1 - (invoice.tds || 0) / 100));
  return {
    amount: grossAmount * 100, // paise
    currency: "INR",
    accept_partial: false,
    description: `${project.name} \u2014 ${invoice.milestone || invoice.no || "Invoice"}`,
    customer: {
      name: project.client_name || "Client",
      email: project.client_email || "",
    },
    notify: { sms: true, email: true },
    reminder_enable: true,
    notes: {
      sitetrack_invoice_id: invoice.id,
      sitetrack_project_id: project.id,
    },
    callback_url: `${typeof window !== "undefined" ? `${window.location.origin}/?share=${project.id}` : ""}`,
    callback_method: "get",
  };
}

// Build a UPI deep link as the simplest fallback when no server is available.
// Most India payment apps accept upi:// links. Architect/builder gives their
// UPI ID once in settings -> SiteTrack generates the link per invoice.
export function buildUpiDeepLink(invoice: Invoice, project: Project, payeeUpi: string, payeeName: string): string {
  const amount = Math.round((invoice.amount || 0) * (1 + (invoice.gst || 0) / 100) * (1 - (invoice.tds || 0) / 100));
  const params = new URLSearchParams({
    pa: payeeUpi || "",
    pn: payeeName || project.client_name || "SiteTrack",
    am: String(amount),
    cu: "INR",
    tn: `${project.name} ${invoice.no || ""}`,
  });
  return `upi://pay?${params.toString()}`;
}

// Mark invoice paid locally -- production would receive this from a Razorpay
// webhook routed through a Supabase Edge Function.
export function markPaidLocally(invoice: Invoice): Invoice {
  return { ...invoice, status: "paid", paid_date: new Date().toISOString().split("T")[0] };
}
