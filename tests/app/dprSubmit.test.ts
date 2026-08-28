import { describe, it, expect, vi } from "vitest";
import {
  normalizeE164,
  makeClientToken,
  buildDprPayload,
  submitDpr,
  voiceObjectPath,
  applyMediaRefs,
  isDeferredDprQueuePayload,
} from "@/app/services/dprSubmit";

describe("normalizeE164", () => {
  it("strips spaces/dashes and adds + prefix", () => {
    expect(normalizeE164("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeE164("98765-43210")).toBe("+9876543210");
  });

  it("accepts 10–15 digit E.164", () => {
    expect(normalizeE164("+919876543210")).toBe("+919876543210");
    expect(normalizeE164("919876543210")).toBe("+919876543210");
  });

  it("rejects too-short / too-long / non-numeric", () => {
    expect(normalizeE164("")).toBeNull();
    expect(normalizeE164("12345")).toBeNull();
    expect(normalizeE164("+1234567890123456")).toBeNull();
    expect(normalizeE164("+abc123")).toBeNull();
    expect(normalizeE164(null)).toBeNull();
  });
});

describe("makeClientToken", () => {
  it("uses the injected rand fn", () => {
    const token = makeClientToken(() => "fixed-token");
    expect(token).toBe("fixed-token");
  });
  it("produces a non-empty token by default", () => {
    expect(makeClientToken()).toBeTruthy();
  });
});

describe("buildDprPayload", () => {
  const base = {
    orgId: "org-1",
    promoterPhone: "+91 98765 43210",
    clientToken: "tok-1",
  };

  it("maps camelCase → snake_case with defaults (te language)", () => {
    const p = buildDprPayload(base);
    expect(p.org_id).toBe("org-1");
    expect(p.promoter_phone_e164).toBe("+919876543210");
    expect(p.client_token).toBe("tok-1");
    expect(p.language).toBe("te");
    expect(p.project_id).toBeNull();
    expect(p.transcript_text).toBeNull();
    expect(p.location_id).toBeNull();
  });

  it("passes project + location refs through to the EF body", () => {
    const p = buildDprPayload({ ...base, projectId: "proj-1", locationId: "loc-1" });
    expect(p.project_id).toBe("proj-1");
    expect(p.location_id).toBe("loc-1");
  });

  it("clamps confidence into [0,1] and rounds coordinates to 6dp", () => {
    const p = buildDprPayload({
      ...base,
      language: "en",
      transcript: "  slab poured  ",
      confidence: 1.5,
      provider: "mock",
      photoLat: 17.4123456789,
      photoLon: 78.4567891234,
    });
    expect(p.transcript_text).toBe("slab poured");
    expect(p.transcript_confidence).toBe(1);
    expect(p.photo_lat).toBe(17.412346);
    expect(p.photo_lon).toBe(78.456789);
  });

  it("rounds non-numeric coords to null", () => {
    const p = buildDprPayload({ ...base, photoLat: Number.NaN, photoLon: null as unknown as number });
    expect(p.photo_lat).toBeNull();
    expect(p.photo_lon).toBeNull();
  });

  it("throws on an invalid phone", () => {
    expect(() => buildDprPayload({ ...base, promoterPhone: "nope" })).toThrow(/E\.164/);
  });

  it("throws on an unsupported language", () => {
    expect(() => buildDprPayload({ ...base, language: "fr" as never })).toThrow(/unsupported language/);
  });
});

describe("submitDpr", () => {
  const input = {
    orgId: "org-1",
    promoterPhone: "+91 98765 43210",
    language: "te" as const,
    transcript: "slab pour ayindi",
    confidence: 0.91,
    provider: "mock",
    clientToken: "tok-1",
  };

  it("returns queued when offline (no send attempted, intent enqueued)", async () => {
    const enqueue = vi.fn(async () => "q-1");
    const send = vi.fn();
    const res = await submitDpr(input, {}, { enqueue, send, online: false });
    expect(res).toMatchObject({ ok: true, status: "queued", queued: true, queuedId: "q-1" });
    expect(send).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith({ key: "tok-1", kind: "dpr", payload: expect.anything() });
  });

  it("returns queued when no send fn provided", async () => {
    const enqueue = vi.fn(async () => "q-1");
    const res = await submitDpr(input, {}, { enqueue });
    expect(res).toMatchObject({ ok: true, status: "queued", queued: true });
  });

  it("returns sent when the EF send succeeds (terminal)", async () => {
    const send = vi.fn(async () => ({ ok: true, status: "sent" as const, dprMessageId: "m-1" }));
    const res = await submitDpr(input, {}, { send });
    expect(res).toMatchObject({ ok: true, status: "sent", dprMessageId: "m-1", queued: false });
  });

  it("keeps the intent queued when the EF send fails (config / not implemented)", async () => {
    const enqueue = vi.fn(async () => "q-1");
    const send = vi.fn(async () => ({ ok: false, error: "WHATSAPP_PERMANENT_TOKEN missing" }));
    const res = await submitDpr(input, {}, { enqueue, send });
    expect(res.ok).toBe(true);
    expect(res.queued).toBe(true);
    expect(res.status).toBe("queued");
    expect(res.error).toContain("WHATSAPP_PERMANENT_TOKEN");
  });

  it("uploads media before sending and passes refs into the payload", async () => {
    const photo = new Blob(["img"], { type: "image/jpeg" });
    const voice = new Blob(["audio"], { type: "audio/webm" });
    const uploadMedia = vi.fn(async () => ({
      ok: true as const,
      refs: { photoUrl: "https://cdn/x.webp", voiceUrl: "https://cdn/y.webm", voiceSha256: "a".repeat(64) },
    }));
    const send = vi.fn(async () => ({ ok: true, status: "sent" as const }));
    const res = await submitDpr(input, { photo, voice }, { uploadMedia, send });
    expect(res).toMatchObject({ ok: true, status: "sent" });
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });

  it("returns a hard failure when media upload fails", async () => {
    const uploadMedia = vi.fn(async () => ({ ok: false as const, error: "photo upload failed: network" }));
    const send = vi.fn();
    const res = await submitDpr(input, { photo: new Blob(["img"]) }, { uploadMedia, send });
    expect(res).toMatchObject({ ok: false, queued: false });
    expect(res.error).toContain("network");
    expect(send).not.toHaveBeenCalled();
  });

  it("returns a validation failure without touching runtime", async () => {
    const send = vi.fn();
    const res = await submitDpr({ ...input, promoterPhone: "bad" }, {}, { send });
    expect(res.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("continues to send when enqueue throws (queue is best-effort)", async () => {
    const enqueue = vi.fn(async () => { throw new Error("IndexedDB blocked"); });
    const send = vi.fn(async () => ({ ok: true, status: "sent" as const, dprMessageId: "m-9" }));
    const res = await submitDpr(input, {}, { enqueue, send });
    expect(res).toMatchObject({ ok: true, status: "sent", dprMessageId: "m-9", queued: false });
    expect(enqueue).toHaveBeenCalled();
  });

  it("defers photo Blob when offline (G1) — enqueues wrapper, no upload, returns queued", async () => {
    const photo = new Blob(["offline-img"], { type: "image/jpeg" });
    const uploadMedia = vi.fn(async () => ({ ok: true as const, refs: {} }));
    const enqueue = vi.fn(async (item: { payload: unknown }) => {
      expect(isDeferredDprQueuePayload(item.payload)).toBe(true);
      const w = item.payload as unknown as { media: { photo: Blob }, orgId: string, payload: { org_id: string } };
      expect(w.media.photo).toBe(photo);
      expect(w.orgId).toBe("org-1");
      expect(w.payload.org_id).toBe("org-1");
      return "q-deferred-1";
    });
    const send = vi.fn();
    const res = await submitDpr(input, { photo }, { uploadMedia, enqueue, send, online: false });
    expect(res).toMatchObject({ ok: true, status: "queued", queued: true, queuedId: "q-deferred-1" });
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("merges upload refs into payload when online (photoUrl -> photo_url)", async () => {
    const photo = new Blob(["img"], { type: "image/jpeg" });
    const uploadMedia = vi.fn(async () => ({
      ok: true as const,
      refs: { photoUrl: "https://cdn/x.webp", photoLat: 17.41, photoLon: 78.45 },
    }));
    let sentPayload: unknown = null;
    const send = vi.fn(async (p: unknown) => { sentPayload = p; return { ok: true, status: "sent" as const }; });
    const res = await submitDpr(input, { photo }, { uploadMedia, send, online: true });
    expect(res.ok).toBe(true);
    expect(sentPayload).toMatchObject({ photo_url: "https://cdn/x.webp", photo_lat: 17.41, photo_lon: 78.45 });
  });
});

describe("voiceObjectPath", () => {
  it("builds <org>/<date>/<sha>.<ext> with a safe sha", () => {
    const sha = "ab".repeat(32);
    const path = voiceObjectPath("org-9", sha, "webm");
    expect(path).toMatch(/^org-9\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{64}\.webm$/);
  });

  it("falls back to 'unknown' for a bad sha", () => {
    const path = voiceObjectPath("org-9", "nope", "mp4");
    expect(path).toMatch(/^org-9\/\d{4}-\d{2}-\d{2}\/unknown\.mp4$/);
  });
});

describe("applyMediaRefs / isDeferredDprQueuePayload", () => {
  it("applyMediaRefs merges refs into payload without mutating original", () => {
    const base = buildDprPayload({ orgId: "o1", promoterPhone: "+919876543210", clientToken: "t1" });
    const merged = applyMediaRefs(base, { photoUrl: "https://cdn/p.webp", voiceUrl: "https://cdn/v.webm", voiceSha256: "a".repeat(64) });
    expect(merged.photo_url).toBe("https://cdn/p.webp");
    expect(merged.voice_audio_url).toBe("https://cdn/v.webm");
    expect(merged.voice_audio_sha256).toBe("a".repeat(64));
    expect(base.photo_url).toBeUndefined();
  });

  it("isDeferredDprQueuePayload detects wrapper", () => {
    const base = buildDprPayload({ orgId: "o1", promoterPhone: "+919876543210", clientToken: "t1" });
    expect(isDeferredDprQueuePayload(base)).toBe(false);
    expect(isDeferredDprQueuePayload({ __deferredDpr: true, payload: base, media: {}, orgId: "o1" })).toBe(true);
  });
});
