// Pure Web Push helpers — RFC 8292 VAPID JWT signing + RFC 8291 aes128gcm
// encryption. No Deno.env / Node Buffer imports, so this module is importable
// from Edge Functions (Deno) and from vitest (Node >= 20 global WebCrypto).

export const b64url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const unb64url = (s: string): Uint8Array => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const te = new TextEncoder();

export const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
};

export const uint32be = (n: number): Uint8Array =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

// WebCrypto HKDF performs extract+expand in one call (PRK = HMAC(salt, ikm), then expand with info).
// `BufferSource` (TS lib.dom) requires Uint8Array<ArrayBuffer>; our concat/slice
// helpers return the wider Uint8Array<ArrayBufferLike>, so cast once at the boundary.
export const hkdf = (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> =>
  crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"])
    .then((key) => crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, length * 8))
    .then((bits) => new Uint8Array(bits));

// Convert an ECDSA DER signature (SEQUENCE of two INTEGERs r, s) to raw 32+32-byte r || s.
export const derToRawSig = (der: Uint8Array): Uint8Array => {
  const toFixed = (raw: Uint8Array): Uint8Array => {
    let b = raw;
    if (b.length > 33) throw new Error("bad-der-int");
    if (b.length === 33 && b[0] === 0x00) b = b.slice(1);
    if (b.length > 32) throw new Error("bad-der-int");
    const out = new Uint8Array(32);
    out.set(b, 32 - b.length);
    return out;
  };
  const rLen = der[3];
  const rRaw = der.slice(4, 4 + rLen);
  const sLen = der[5 + rLen];
  const sRaw = der.slice(6 + rLen, 6 + rLen + sLen);
  return concatBytes(toFixed(rRaw), toFixed(sRaw));
};

export interface VapidKeyPair {
  /** 65-byte uncompressed P-256 point (0x04||x||y), base64url. */
  publicKey: string;
  /** 32-byte private scalar, base64url. */
  privateKey: string;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  link?: string;
}

// Sign a VAPID JWT (ES256) and return the compact "<signInput>.<signature>" token.
// The signature is emitted raw (r||s, 64 bytes). Runtime difference note: Deno's
// subtle.sign returns DER (converted here), Node's returns raw already (passed through).
export const signVapidToken = async (
  keys: VapidKeyPair,
  aud: string,
  exp: number,
  sub: string,
): Promise<string> => {
  if (!keys.publicKey || !keys.privateKey) throw new Error("vapid-not-configured");
  const pubRaw = unb64url(keys.publicKey);
  if (pubRaw.length !== 65) throw new Error("vapid-pub-invalid");
  if (pubRaw[0] !== 0x04) throw new Error("vapid-pub-invalid");
  const header = { alg: "ES256", typ: "JWT" };
  const signInput = `${b64url(te.encode(JSON.stringify(header)))}.${b64url(te.encode(JSON.stringify({ aud, exp, sub })))}`;
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: b64url(pubRaw.slice(1, 33)),
    y: b64url(pubRaw.slice(33, 65)),
    d: keys.privateKey,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(signInput)));
  const rawSig = sig.length === 64 ? sig : derToRawSig(sig);
  return `${signInput}.${b64url(rawSig)}`;
};

// RFC 8291: derive the auth secret chain (PRK → IKM → CEK/NONCE) and encrypt a
// payload into an aes128gcm record. Returns the full request body (header||ciphertext)
// plus the paraphernalia needed to reverse it for tests/debugging.
export const encryptPushPayload = async (
  keys: PushSubscriptionKeys,
  payload: PushPayload,
): Promise<{ body: Uint8Array; salt: Uint8Array; recordSize: number; ephPubRaw: Uint8Array }> => {
  const clientPub = unb64url(keys.p256dh);
  if (clientPub.length !== 65 || clientPub[0] !== 0x04) throw new Error("push-p256dh-invalid");
  const authSecret = unb64url(keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephJwk = await crypto.subtle.exportKey("jwk", eph.publicKey);
  const ephPubRaw = concatBytes(new Uint8Array([0x04]), unb64url(ephJwk.x ?? ""), unb64url(ephJwk.y ?? ""));
  const clientPubJwk = { kty: "EC", crv: "P-256", x: b64url(clientPub.slice(1, 33)), y: b64url(clientPub.slice(33, 65)) };
  const clientKey = await crypto.subtle.importKey("jwk", clientPubJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, eph.privateKey, 256));

  const PRK = await hkdf(authSecret, shared, new Uint8Array(0), 32);
  const IKM = await hkdf(new Uint8Array(32), PRK, concatBytes(te.encode("Content-Encoding: auth"), new Uint8Array([1])), 32);
  const CEK = await hkdf(new Uint8Array(32), IKM, concatBytes(te.encode("Content-Encoding: aes128gcm"), new Uint8Array([1])), 16);
  const NONCE = await hkdf(new Uint8Array(32), IKM, concatBytes(te.encode("Content-Encoding: nonce"), new Uint8Array([0])), 12);

  const plaintext = concatBytes(new Uint8Array([2]), te.encode(JSON.stringify(payload)));
  const padded = plaintext.length >= 16 ? plaintext : concatBytes(plaintext, new Uint8Array(16 - plaintext.length));
  const recordSize = padded.length + 16; // + 16-byte AES-GCM tag
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const header = concatBytes(salt, uint32be(recordSize), ephPubRaw); // AAD

  const aes = await crypto.subtle.importKey("raw", CEK as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: NONCE as BufferSource, additionalData: header as BufferSource }, aes, padded as BufferSource),
  );

  return { body: concatBytes(header, ciphertext), salt, recordSize, ephPubRaw };
};

export interface PushRequestOptions extends VapidKeyPair {
  endpoint: string;
  keys: PushSubscriptionKeys;
  payload: PushPayload;
  /** VAPID subject, e.g. "mailto:hello@sitetrackpro.in". */
  subject: string;
  /** Payload Time-To-Live in seconds (default 86400). */
  ttl?: number;
  /** Push urgency hint (default "normal"). */
  urgency?: string;
}

// Assemble the complete POST request without performing the fetch.
export const buildPushRequest = async (opts: PushRequestOptions): Promise<{
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: Uint8Array;
}> => {
  const aud = new URL(opts.endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const token = await signVapidToken({ publicKey: opts.publicKey, privateKey: opts.privateKey }, aud, exp, opts.subject);
  const { body } = await encryptPushPayload(opts.keys, opts.payload);
  return {
    url: opts.endpoint,
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${opts.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttl ?? 86400),
      Urgency: opts.urgency ?? "normal",
    },
    body,
  };
};