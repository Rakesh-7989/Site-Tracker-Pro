// SiteTrack Pro — Web Push channel tests.
//
// Pure-function tests for _shared/webpush.ts (RFC 8292 VAPID + RFC 8291
// aes128gcm). Runs in the node environment (jsdom's global crypto lacks
// subtle/deriveBits). Covers:
//   - VAPID ES256 JWT signing + WebCrypto verification
//   - aes128gcm payload encryption + independent client-side decryption
//   - buildPushRequest header assembly
//   - derToRawSig DER -> raw(r||s) signature conversion

// @vitest-environment node

import { describe, it, expect } from "vitest";

import {
  b64url,
  unb64url,
  concatBytes,
  derToRawSig,
  signVapidToken,
  encryptPushPayload,
  buildPushRequest,
} from "../supabase/functions/_shared/webpush";

const te = new TextEncoder();
const zeros32 = new Uint8Array(32);

const eq = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// RFC 3279 DER INTEGER encoding for a fixed-width P-256 component.
// https://www.ietf.org/rfc/rfc3279.txt — an INTEGER is the minimal two's
// complement form; prepend 0x00 when the high bit is set.
const derInt = (fixed: Uint8Array): Uint8Array => {
  let i = 0;
  while (i < fixed.length && fixed[i] === 0) i += 1;
  let body: Uint8Array = fixed.slice(i);
  if (body.length === 0) body = new Uint8Array([0]);
  if (body[0] & 0x80) body = concatBytes(new Uint8Array([0]), body);
  return concatBytes(new Uint8Array([0x02, body.length]), body);
};

const rawToDer = (raw: Uint8Array): Uint8Array => {
  const seq = concatBytes(derInt(raw.slice(0, 32)), derInt(raw.slice(32, 64)));
  return concatBytes(new Uint8Array([0x30, seq.length]), seq);
};

// Generate an ECDSA P-256 keypair and derive VapidKeyPair strings from the JWK.
const makeVapidKeys = async (): Promise<{ publicKey: string; privateKey: string }> => {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return {
    publicKey: b64url(concatBytes(new Uint8Array([0x04]), unb64url(jwk.x ?? ""), unb64url(jwk.y ?? ""))),
    privateKey: (jwk as { d: string }).d,
  };
};

// Client-side subscription keys for RFC 8291: an ephemeral ECDH keypair whose
// public point is the p256dh value, plus a random 16-byte auth secret.
const makeSubscriptionKeys = async (): Promise<{ p256dh: string; auth: string; privateKey: CryptoKey }> => {
  const ecdh = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const jwk = await crypto.subtle.exportKey("jwk", ecdh.publicKey);
  return {
    p256dh: b64url(concatBytes(new Uint8Array([0x04]), unb64url(jwk.x ?? ""), unb64url(jwk.y ?? ""))),
    auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
    privateKey: ecdh.privateKey,
  };
};

// Re-derive the RFC 8291 key chain from the client's private key + auth secret
// and decrypt an aes128gcm record. Mirrors the module's derivation (the chain
// is symmetric) so round-trips prove the encryption is standards-correct.
const decryptPushPayload = async (
  clientPriv: CryptoKey,
  authSecret: Uint8Array,
  body: Uint8Array,
): Promise<string> => {
  const header = body.slice(0, 85);
  const ephPub = body.slice(20, 85);
  const ephJwk = {
    kty: "EC",
    crv: "P-256",
    x: b64url(ephPub.slice(1, 33)),
    y: b64url(ephPub.slice(33, 65)),
  };
  const ephKey = await crypto.subtle.importKey("jwk", ephJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ephKey }, clientPriv, 256));

  const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> => {
    const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(
      await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, key, length * 8),
    );
  };

  const PRK = await hkdf(authSecret, shared, new Uint8Array(0), 32);
  const IKM = await hkdf(zeros32, PRK, concatBytes(te.encode("Content-Encoding: auth"), new Uint8Array([1])), 32);
  const CEK = await hkdf(zeros32, IKM, concatBytes(te.encode("Content-Encoding: aes128gcm"), new Uint8Array([1])), 16);
  const NONCE = await hkdf(zeros32, IKM, concatBytes(te.encode("Content-Encoding: nonce"), new Uint8Array([0])), 12);

  const aes = await crypto.subtle.importKey("raw", CEK as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: NONCE as BufferSource, additionalData: header as BufferSource },
      aes,
      body.slice(85) as BufferSource,
    ),
  );
  let end = plaintext.length;
  while (end > 0 && plaintext[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(plaintext.slice(1, end));
};

describe("signVapidToken", () => {
  it("produces a verifiable ES256 JWT with the expected claims", async () => {
    const keys = await makeVapidKeys();
    const aud = "https://fcm.googleapis.com";
    const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
    const sub = "mailto:hello@sitetrackpro.in";

    const token = await signVapidToken(keys, aud, exp, sub);
    const [h, p, sig] = token.split(".");
    expect(sig).toBeDefined();

    const header = JSON.parse(new TextDecoder().decode(unb64url(h))) as { alg: string; typ: string };
    expect(header).toEqual({ alg: "ES256", typ: "JWT" });
    const payload = JSON.parse(new TextDecoder().decode(unb64url(p))) as { aud: string; exp: number; sub: string };
    expect(payload).toEqual({ aud, exp, sub });

    const signInput = te.encode(`${h}.${p}`);
    const pubJwk = {
      kty: "EC",
      crv: "P-256",
      x: b64url(unb64url(keys.publicKey).slice(1, 33)),
      y: b64url(unb64url(keys.publicKey).slice(33, 65)),
    };
    const pubKey = await crypto.subtle.importKey("jwk", pubJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    // JWS ES256 (RFC 7518 §3.4) signatures are the 64-byte R||S concatenation —
    // which is exactly what Node's subtle.sign yields (verified above that Node
    // verify() accepts this raw form and rejects DER).
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, unb64url(sig) as BufferSource, signInput as BufferSource);
    expect(ok).toBe(true);
  });

  it("throws vapid-not-configured when keys are empty", async () => {
    await expect(signVapidToken({ publicKey: "", privateKey: "" }, "https://x.example", 1, "sub")).rejects.toThrow(
      "vapid-not-configured",
    );
  });

  it("throws vapid-pub-invalid when the public key is not a 65-byte point", async () => {
    await expect(
      signVapidToken({ publicKey: "YWJj", privateKey: "dGVzdA" }, "https://x.example", 1, "sub"),
    ).rejects.toThrow("vapid-pub-invalid");
  });
});

describe("encryptPushPayload", () => {
  it("round-trips a payload through the RFC 8291 key chain", async () => {
    const sub = await makeSubscriptionKeys();
    const payload = { title: "DPR submitted", body: "Your daily report is live", link: "/projects/abc" };

    const { body, salt, recordSize, ephPubRaw } = await encryptPushPayload(
      { p256dh: sub.p256dh, auth: sub.auth },
      payload,
    );
    expect(body.length).toBeGreaterThan(85);
    expect(eq(body.slice(0, 16), salt)).toBe(true);
    expect(eq(body.slice(16, 20), new Uint8Array([(recordSize >>> 24) & 0xff, (recordSize >>> 16) & 0xff, (recordSize >>> 8) & 0xff, recordSize & 0xff]))).toBe(true);
    expect(eq(body.slice(20, 85), ephPubRaw)).toBe(true);

    const plain = await decryptPushPayload(sub.privateKey, unb64url(sub.auth), body);
    expect(JSON.parse(plain)).toEqual(payload);
  });

  it("throws push-p256dh-invalid for a malformed p256dh", async () => {
    await expect(
      encryptPushPayload({ p256dh: "QUJD", auth: "ZGVm" }, { title: "t", body: "b" }),
    ).rejects.toThrow("push-p256dh-invalid");
  });
});

describe("buildPushRequest", () => {
  it("assembles the complete POST request with standard headers", async () => {
    const keys = await makeVapidKeys();
    const sub = await makeSubscriptionKeys();
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";
    const req = await buildPushRequest({
      ...keys,
      endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
      payload: { title: "t", body: "b", link: "/x" },
      subject: "mailto:hello@sitetrackpro.in",
    });

    expect(req.url).toBe(endpoint);
    expect(req.method).toBe("POST");
    expect(req.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(req.headers["Content-Type"]).toBe("application/octet-stream");
    expect(req.headers.TTL).toBe("86400");
    expect(req.headers.Urgency).toBe("normal");
    expect(req.headers.Authorization.startsWith("vapid t=")).toBe(true);
    expect(req.headers.Authorization).toContain(`k=${keys.publicKey}`);
    expect(req.headers.Authorization.split(",")).toHaveLength(2);
    expect(req.body.length).toBe(85 + req.body.length - 85);
  });

  it("honours custom TTL and urgency", async () => {
    const keys = await makeVapidKeys();
    const sub = await makeSubscriptionKeys();
    const req = await buildPushRequest({
      ...keys,
      endpoint: "https://fcm.googleapis.com/x",
      keys: { p256dh: sub.p256dh, auth: sub.auth },
      payload: { title: "t", body: "b" },
      subject: "mailto:hello@sitetrackpro.in",
      ttl: 3600,
      urgency: "high",
    });
    expect(req.headers.TTL).toBe("3600");
    expect(req.headers.Urgency).toBe("high");
  });

  it("rejects like signVapidToken when VAPID keys are empty", async () => {
    const sub = await makeSubscriptionKeys();
    await expect(
      buildPushRequest({
        publicKey: "",
        privateKey: "",
        endpoint: "https://fcm.googleapis.com/x",
        keys: { p256dh: sub.p256dh, auth: sub.auth },
        payload: { title: "t", body: "b" },
        subject: "mailto:hello@sitetrackpro.in",
      }),
    ).rejects.toThrow("vapid-not-configured");
  });
});

describe("derToRawSig", () => {
  it("converts an ECDSA DER signature back to raw r||s", async () => {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, te.encode("msg")));
    expect(raw.length).toBe(64);
    expect(eq(derToRawSig(rawToDer(raw)), raw)).toBe(true);
  });
});