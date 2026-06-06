// SiteTrack Pro — MFA (TOTP) helper tests.

import { describe, it, expect, vi } from "vitest";
import { getMfaChallenge, listMfaFactors, enrollMfa, verifyMfa, unenrollMfa } from "@/auth/mfa";

// Build a fake supabase client whose auth.mfa.* return preset payloads.
function fakeClient(mfa: Record<string, unknown>) {
  return { auth: { mfa } };
}

describe("getMfaChallenge", () => {
  it("required=false when already aal2 (no challenge needed)", async () => {
    const c = fakeClient({
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null }),
    });
    const r = await getMfaChallenge(c);
    expect(r).toEqual({ ok: true, required: false, factorId: null });
  });

  it("required=false when no factor (aal1→aal1) — unchanged login", async () => {
    const c = fakeClient({
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
    });
    const r = await getMfaChallenge(c);
    expect(r.ok && r.required).toBe(false);
  });

  it("required=true + returns the verified factor id when aal1→aal2", async () => {
    const c = fakeClient({
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null }),
      listFactors: async () => ({ data: { totp: [{ id: "f1", status: "unverified" }, { id: "f2", status: "verified" }] }, error: null }),
    });
    const r = await getMfaChallenge(c);
    expect(r).toEqual({ ok: true, required: true, factorId: "f2" });
  });

  it("surfaces an AAL error", async () => {
    const c = fakeClient({ getAuthenticatorAssuranceLevel: async () => ({ data: null, error: { message: "boom" } }) });
    expect(await getMfaChallenge(c)).toEqual({ ok: false, error: "boom" });
  });
});

describe("listMfaFactors", () => {
  it("maps snake_case friendly_name", async () => {
    const c = fakeClient({ listFactors: async () => ({ data: { totp: [{ id: "f1", friendly_name: "Phone", status: "verified" }] }, error: null }) });
    const r = await listMfaFactors(c);
    expect(r.ok && r.factors[0]).toEqual({ id: "f1", friendlyName: "Phone", status: "verified" });
  });
});

describe("enrollMfa", () => {
  it("sweeps unverified factors then enrolls + returns QR/secret", async () => {
    const unenroll = vi.fn(async () => ({ error: null }));
    const c = fakeClient({
      listFactors: async () => ({ data: { totp: [{ id: "old", status: "unverified" }, { id: "keep", status: "verified" }] }, error: null }),
      unenroll,
      enroll: async () => ({ data: { id: "new", totp: { qr_code: "data:svg", secret: "ABC", uri: "otpauth://x" } }, error: null }),
    });
    const r = await enrollMfa(c, "My Phone");
    expect(unenroll).toHaveBeenCalledWith({ factorId: "old" });          // swept the unverified one
    expect(unenroll).not.toHaveBeenCalledWith({ factorId: "keep" });     // kept the verified one
    expect(r).toMatchObject({ ok: true, factorId: "new", qrCode: "data:svg", secret: "ABC" });
  });

  it("surfaces an enroll error", async () => {
    const c = fakeClient({ listFactors: async () => ({ data: { totp: [] }, error: null }), enroll: async () => ({ data: null, error: { message: "limit reached" } }) });
    expect(await enrollMfa(c)).toEqual({ ok: false, error: "limit reached" });
  });
});

describe("verifyMfa", () => {
  it("rejects a non-6-digit code locally (no network call)", async () => {
    const challengeAndVerify = vi.fn();
    const c = fakeClient({ challengeAndVerify });
    const r = await verifyMfa(c, "f1", "12");
    expect(r.ok).toBe(false);
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });

  it("strips spaces + verifies a good code", async () => {
    const challengeAndVerify = vi.fn(async () => ({ data: {}, error: null }));
    const c = fakeClient({ challengeAndVerify });
    const r = await verifyMfa(c, "f1", "123 456");
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
    expect(r).toEqual({ ok: true });
  });

  it("surfaces a wrong-code error", async () => {
    const c = fakeClient({ challengeAndVerify: async () => ({ data: null, error: { message: "Invalid TOTP code" } }) });
    expect(await verifyMfa(c, "f1", "000000")).toEqual({ ok: false, error: "Invalid TOTP code" });
  });
});

describe("unenrollMfa", () => {
  it("removes a factor", async () => {
    const c = fakeClient({ unenroll: async () => ({ data: {}, error: null }) });
    expect(await unenrollMfa(c, "f1")).toEqual({ ok: true });
  });
});
