// SiteTrack Pro — TOTP multi-factor auth (MFA) helpers.
//
// Thin, testable wrappers over Supabase Auth's free MFA API
// (sb.auth.mfa.*). Each takes the supabase client so it can be unit-tested
// with a fake client (matches the query-module pattern).
//
// Flow:
//   enroll → show QR + secret → user scans in Authenticator app →
//   verifyEnrollment(code) activates the factor.
// At login, if the user has a verified factor the session lands at aal1 and
// must be upgraded to aal2 via challenge(code) before entering the app.
//
// Users WITHOUT a factor are unaffected — getMfaChallenge() returns
// required=false, so the login flow is unchanged for them.

export type MfaResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

export interface MfaFactor { id: string; friendlyName: string; status: string; }

const errMsg = (e: unknown): string => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

/**
 * Does the current session need an MFA code to proceed?
 * required=true ⇒ user has a verified factor but session is still aal1.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMfaChallenge(client: any): Promise<MfaResult<{ required: boolean; factorId: string | null }>> {
  try {
    const { data: aal, error: aalErr } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) return { ok: false, error: errMsg(aalErr) };
    const required = aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
    if (!required) return { ok: true, required: false, factorId: null };
    const { data: f, error: fErr } = await client.auth.mfa.listFactors();
    if (fErr) return { ok: false, error: errMsg(fErr) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verified = ((f?.totp ?? []) as any[]).find((x) => x.status === "verified");
    return { ok: true, required: true, factorId: verified?.id ?? null };
  } catch (e) { return { ok: false, error: errMsg(e) }; }
}

/** Verified + unverified TOTP factors on the account. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMfaFactors(client: any): Promise<MfaResult<{ factors: MfaFactor[] }>> {
  try {
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) return { ok: false, error: errMsg(error) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factors = ((data?.totp ?? []) as any[]).map((f) => ({
      id: String(f.id), friendlyName: String(f.friendly_name ?? f.friendlyName ?? ""), status: String(f.status ?? ""),
    }));
    return { ok: true, factors };
  } catch (e) { return { ok: false, error: errMsg(e) }; }
}

/**
 * Begin enrollment of a new TOTP factor. Clears any leftover *unverified*
 * factors first (abandoned enrol attempts) so re-enrol never collides.
 * Returns the QR code (SVG data URI) + secret to display.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrollMfa(client: any, friendlyName = "Authenticator"): Promise<MfaResult<{ factorId: string; qrCode: string; secret: string; uri: string }>> {
  try {
    // Sweep abandoned unverified factors.
    const existing = await listMfaFactors(client);
    if (existing.ok) {
      for (const f of existing.factors) {
        if (f.status !== "verified") { try { await client.auth.mfa.unenroll({ factorId: f.id }); } catch { /* ignore */ } }
      }
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName });
    if (error) return { ok: false, error: errMsg(error) };
    return {
      ok: true,
      factorId: String(data?.id ?? ""),
      qrCode: String(data?.totp?.qr_code ?? ""),
      secret: String(data?.totp?.secret ?? ""),
      uri: String(data?.totp?.uri ?? ""),
    };
  } catch (e) { return { ok: false, error: errMsg(e) }; }
}

/** Finish enrollment: challenge + verify the code, activating the factor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function verifyMfa(client: any, factorId: string, code: string): Promise<MfaResult> {
  try {
    const cleaned = String(code || "").replace(/\s/g, "").trim();
    if (!/^\d{6}$/.test(cleaned)) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: cleaned });
    if (error) return { ok: false, error: errMsg(error) };
    return { ok: true };
  } catch (e) { return { ok: false, error: errMsg(e) }; }
}

/** Remove a factor (disable 2FA for that authenticator). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function unenrollMfa(client: any, factorId: string): Promise<MfaResult> {
  try {
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) return { ok: false, error: errMsg(error) };
    return { ok: true };
  } catch (e) { return { ok: false, error: errMsg(e) }; }
}
