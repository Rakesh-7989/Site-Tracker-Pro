// SiteTrack Pro -- Razorpay payment-link query layer.
//
// Thin client over the `razorpay-payment-link` Edge Function. The Razorpay
// key/secret NEVER reach the browser: the EF creates the payment link and
// returns only the shareable short_url + status.

export interface RazorpayPaymentLinkResult {
  ok: boolean;
  error?: string;
  data?: {
    paymentLinkId: string;
    shortUrl: string;
    status: string;
    amount: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPaymentLink(client: any, invoiceId: string, projectId?: string, mode: "create" | "get" = "create"): Promise<RazorpayPaymentLinkResult> {
  try {
    const body = { invoice_id: invoiceId, project_id: projectId ?? undefined, mode };
    const { data, error } = await client.functions.invoke("razorpay-payment-link", { body });
    if (error) {
      let msg = String(error.message ?? "Payment link creation failed.");
      try { const b = await error.context.json(); msg = b.error || b.detail || msg; } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
    if (!data?.ok) return { ok: false, error: String(data?.error ?? data?.detail ?? "Payment link creation failed.") };
    return {
      ok: true,
      data: {
        paymentLinkId: String(data.payment_link_id ?? data.paymentLinkId ?? ""),
        shortUrl: String(data.short_url ?? ""),
        status: String(data.status ?? "created"),
        amount: Number(data.amount ?? 0),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
