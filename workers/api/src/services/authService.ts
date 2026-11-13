/**
 * SiteTrack Pro — Cloudflare Workers Auth Service
 *
 * Implements password hashing via standard Web Crypto PBKDF2 (100k iterations, SHA-256)
 * and compact HMAC-SHA256 JWT tokens. Runs natively in Cloudflare Workers with zero dependencies.
 */

// ── Password Hashing (PBKDF2) ────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign"]
  );

  const rawKey = await crypto.subtle.exportKey("raw", key);
  const hashHex = Array.from(new Uint8Array(rawKey))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, originalHash] = storedHash.split(":");
  if (!saltHex || !originalHash) return false;

  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign"]
  );

  const rawKey = await crypto.subtle.exportKey("raw", key);
  const hashHex = Array.from(new Uint8Array(rawKey))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex === originalHash;
}

// ── JWT Signing & Verification (HMAC-SHA256) ─────────────────────────────────

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 86400 * 7 // 7 days
): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${data}.${encodedSignature}`;
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const enc = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signature = new Uint8Array(
      base64UrlDecode(encodedSignature)
        .split("")
        .map((c) => c.charCodeAt(0))
    );

    const valid = await crypto.subtle.verify("HMAC", key, signature, enc.encode(data));
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null; // expired

    return payload;
  } catch {
    return null;
  }
}

