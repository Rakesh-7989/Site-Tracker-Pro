// SiteTrack Pro — platform payment settings + UPI-QR payment claims (mig 105).

export type PayResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PaymentSettings { upiId: string | null; payeeName: string | null; }
export interface SignupForPay {
  firmName: string;
  plan: string;
  email: string;
  paymentStatus: string;
  /** DB plan annual price incl. 18% GST (mig 196), null when no plans row. */
  planAmountInr: number | null;
  /** Actual recorded charge in paise (mig 195), null when never charged. */
  paidAmountPaise: number | null;
}

/** Public: the platform UPI id + payee name (for building a QR). RPC get_payment_settings. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPaymentSettings(client: any): Promise<PayResult<PaymentSettings>> {
  try {
    const { data, error } = await client.rpc("get_payment_settings");
    if (error) return { ok: false, error: String(error.message ?? error) };
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    return { ok: true, data: { upiId: r?.upi_id ? String(r.upi_id) : null, payeeName: r?.payee_name ? String(r.payee_name) : null } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Owner/head: set a platform setting (upi_id | payee_name). RPC set_platform_setting. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setPlatformSetting(client: any, key: "upi_id" | "payee_name", value: string): Promise<PayResult<true>> {
  try {
    const { error } = await client.rpc("set_platform_setting", { p_key: key, p_value: value });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Public: load a signup request for the /pay page. RPC get_signup_for_pay. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSignupForPay(client: any, requestId: string): Promise<PayResult<SignupForPay>> {
  try {
    const { data, error } = await client.rpc("get_signup_for_pay", { p_request: requestId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!r) return { ok: false, error: "Request not found." };
    return {
      ok: true,
      data: {
        firmName: String(r.firm_name ?? ""),
        plan: String(r.plan ?? "basic"),
        email: String(r.email ?? ""),
        paymentStatus: String(r.payment_status ?? "unpaid"),
        planAmountInr: r.plan_amount_inr == null ? null : Number(r.plan_amount_inr),
        paidAmountPaise: r.paid_amount_paise == null ? null : Number(r.paid_amount_paise),
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Public: the payer attaches their UPI transaction ref. RPC submit_payment_claim. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function submitPaymentClaim(client: any, requestId: string, utr: string): Promise<PayResult<true>> {
  try {
    const { error } = await client.rpc("submit_payment_claim", { p_request: requestId, p_utr: utr });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Plan-tier price lookup for the resolver (basic/pro/business only — custom is
 *  priced via the DB `plans` row, which has no frontend tier entry). */
export interface TierPrice { id: string; annual: number }

/** Resolve the INR amount to charge on the /pay page. Precedence:
 *  1. `paidAmountPaise` — the actual recorded charge (mig 195), when set.
 *  2. `planAmountInr` — the DB plan annual incl. GST (mig 196), when set.
 *  3. `tiers` fallback — legacy frontend PLAN_TIERS (basic/pro/business).
 *  Returns null when nothing resolves (e.g. a custom plan with no DB row) so the
 *  page can render a "contact us" state instead of a ₹0 QR. */
export function resolveSignupAmount(
  req: { paidAmountPaise: number | null; planAmountInr: number | null; plan: string },
  tiers: ReadonlyArray<TierPrice> = []
): number | null {
  if (req.paidAmountPaise != null && req.paidAmountPaise > 0) return Math.round(req.paidAmountPaise / 100);
  if (req.planAmountInr != null && req.planAmountInr > 0) return Math.round(req.planAmountInr);
  const tier = tiers.find(t => t.id === req.plan);
  if (tier && tier.annual > 0) return Math.round(tier.annual);
  return null;
}
