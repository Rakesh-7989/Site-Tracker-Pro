// SiteTrack Pro — platform payment settings + UPI-QR payment claims (mig 105).

export type PayResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PaymentSettings { upiId: string | null; payeeName: string | null; }
export interface SignupForPay { firmName: string; plan: string; email: string; paymentStatus: string; }

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
    return { ok: true, data: { firmName: String(r.firm_name ?? ""), plan: String(r.plan ?? "basic"), email: String(r.email ?? ""), paymentStatus: String(r.payment_status ?? "unpaid") } };
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
