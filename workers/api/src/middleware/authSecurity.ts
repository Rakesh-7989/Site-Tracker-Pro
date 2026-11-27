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
