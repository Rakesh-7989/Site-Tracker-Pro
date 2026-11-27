/**
 * SiteTrack Pro — Cloudflare Workers Auth Security & KV Token Helpers
 *
 * Provides KV-backed rate limiting, JWT revocation on logout, and single-use
 * tokens for magic-link login and password resets.
 */

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkAuthRateLimit(
  kv: KVNamespace | undefined,
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  if (!kv) return { allowed: true, remaining: maxAttempts };
  const kvKey = `rl:${key}`;
  const raw = await kv.get(kvKey);
  const count = raw ? Number(raw) : 0;
  if (Number.isFinite(count) && count >= maxAttempts) {
    return { allowed: false, remaining: 0 };
  }
  const next = (Number.isFinite(count) ? count : 0) + 1;
  await kv.put(kvKey, String(next), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: Math.max(0, maxAttempts - next) };
}

export async function revokeToken(
  kv: KVNamespace | undefined,
  token: string,
  ttlSeconds = 60 * 60 * 24 * 7
): Promise<void> {
  if (!kv || !token) return;
  const hash = await sha256Hex(token);
  await kv.put(`revoked_jwt:${hash}`, "1", { expirationTtl: ttlSeconds });
}

export async function isTokenRevoked(kv: KVNamespace | undefined, token: string): Promise<boolean> {
  if (!kv || !token) return false;
  const hash = await sha256Hex(token);
  const hit = await kv.get(`revoked_jwt:${hash}`);
  return hit !== null;
}

export async function issueOneTimeToken<T extends Record<string, unknown>>(
  kv: KVNamespace | undefined,
  prefix: "magic" | "reset",
  payload: T,
  ttlSeconds = 900
): Promise<string> {
  if (!kv) {
    throw new Error("KV CACHE binding required for one-time auth tokens");
  }
  const token = `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
  await kv.put(`${prefix}:${token}`, JSON.stringify(payload), { expirationTtl: ttlSeconds });
  return token;
}

export async function consumeOneTimeToken<T extends Record<string, unknown>>(
  kv: KVNamespace | undefined,
  prefix: "magic" | "reset",
  token: string
): Promise<T | null> {
  if (!kv || !token) return null;
  const key = `${prefix}:${token}`;
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.delete(key);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function verifySvixSignature(opts: {
  msgId: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  secret: string;
  nowSec?: number;
}): Promise<boolean> {
  const { msgId, timestamp, signature, rawBody, secret, nowSec = Math.floor(Date.now() / 1000) } = opts;
  if (!msgId || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;

  try {
    let b64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
    const pad = b64.length % 4;
    if (pad !== 0) b64 = b64.padEnd(b64.length + (4 - pad), "=");
    const bin = atob(b64);
    const keyBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) keyBytes[i] = bin.charCodeAt(i);

    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${msgId}.${timestamp}.${rawBody}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    for (const part of signature.trim().split(/\s+/)) {
      const [version, sig] = part.split(",", 2);
      if (version === "v1" && sig && sig.length === expected.length) {
        let diff = 0;
        for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
        if (diff === 0) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
