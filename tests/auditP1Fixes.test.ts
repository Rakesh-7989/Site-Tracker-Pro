// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolveCloudflareBackendEnabled } from "../src/lib/api/cloudflareClient";
import {
  checkAuthRateLimit,
  consumeOneTimeToken,
  isTokenRevoked,
  issueOneTimeToken,
  revokeToken,
  verifySvixSignature,
} from "../workers/api/src/middleware/authSecurity";
import { assertWriteRole, TenantSecurityError, type SecurityContext } from "../workers/api/src/middleware/tenant";

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

describe("Audit P1 Fixes (Backend Config & Auth Security)", () => {
  it("2A: explicit supabase/local provider overrides VITE_CLOUDFLARE_API_URL", () => {
    expect(
      resolveCloudflareBackendEnabled({
        VITE_BACKEND_PROVIDER: "supabase",
        VITE_CLOUDFLARE_API_URL: "https://sitetrack-api.example.workers.dev/api",
      })
    ).toBe(false);

    expect(
      resolveCloudflareBackendEnabled({
        VITE_BACKEND: "local",
        VITE_CLOUDFLARE_API_URL: "https://sitetrack-api.example.workers.dev/api",
      })
    ).toBe(false);

    expect(
      resolveCloudflareBackendEnabled({
        VITE_BACKEND_PROVIDER: "cloudflare",
      })
    ).toBe(true);

    expect(
      resolveCloudflareBackendEnabled({
        VITE_CLOUDFLARE_API_URL: "https://sitetrack-api.example.workers.dev/api",
      })
    ).toBe(true);
  });

  it("AUD-06: KV auth rate limiter blocks attempts past threshold", async () => {
    const kv = createMockKV();
    const first = await checkAuthRateLimit(kv, "login:1.2.3.4:u@a.in", 2, 300);
    const second = await checkAuthRateLimit(kv, "login:1.2.3.4:u@a.in", 2, 300);
    const third = await checkAuthRateLimit(kv, "login:1.2.3.4:u@a.in", 2, 300);

    expect(first).toEqual({ allowed: true, remaining: 1 });
    expect(second).toEqual({ allowed: true, remaining: 0 });
    expect(third).toEqual({ allowed: false, remaining: 0 });
  });

  it("AUD-06: JWT revocation and single-use magic/reset tokens work via KV", async () => {
    const kv = createMockKV();
    expect(await isTokenRevoked(kv, "jwt_abc")).toBe(false);
    await revokeToken(kv, "jwt_abc");
    expect(await isTokenRevoked(kv, "jwt_abc")).toBe(true);

    const magicToken = await issueOneTimeToken(kv, "magic", { userId: "u_1", email: "a@b.in" });
    const consumed = await consumeOneTimeToken<{ userId: string; email: string }>(kv, "magic", magicToken);
    expect(consumed).toEqual({ userId: "u_1", email: "a@b.in" });

    // Single-use: second consume returns null
    const replay = await consumeOneTimeToken(kv, "magic", magicToken);
    expect(replay).toBeNull();
  });

  it("P1: verifies Svix Resend webhook signatures and blocks read-only write roles", async () => {
    const rawKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const secret = "whsec_" + btoa(String.fromCharCode(...rawKey)).replace(/=+$/, "");
    const msgId = "msg_123";
    const ts = "1700000000";
    const body = '{"type":"email.delivered"}';
    const key = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${msgId}.${ts}.${body}`));
    const sig = "v1," + btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    expect(
      await verifySvixSignature({ msgId, timestamp: ts, signature: sig, rawBody: body, secret, nowSec: 1700000010 })
    ).toBe(true);
    expect(
      await verifySvixSignature({ msgId, timestamp: ts, signature: sig, rawBody: '{"type":"tampered"}', secret, nowSec: 1700000010 })
    ).toBe(false);

    const viewerCtx: SecurityContext = { userId: "u1", email: "v@o.in", orgId: "o1", role: "viewer", isAdmin: false, partnerOrgIds: [] };
    const engineerCtx: SecurityContext = { ...viewerCtx, role: "engineer" };
    expect(() => assertWriteRole(viewerCtx)).toThrow(TenantSecurityError);
    expect(() => assertWriteRole(engineerCtx)).not.toThrow();
  });
});
