// SiteTrack Pro — Sprint 2 (Session 30.3): voiceTranscribe unit tests.
//
// Covers pure logic: provider selection, hash computation, mock branch,
// confidence-bar check. Real Bhashini/AWS calls are NOT tested (they're
// in the EF; here we test the lib interface contract).

import { describe, it, expect } from "vitest";

import {
  SUPPORTED_LANGUAGES,
  ALL_PROVIDERS,
  DEFAULT_PROVIDER_ORDER,
  pickProviderOrder,
  hashAudio,
  mockTranscribe,
  transcribe,
  meetsAccuracyBar,
} from "../src/lib/voiceTranscribe";

describe("voiceTranscribe — constants", () => {
  it("exposes 3 supported languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["te", "hi", "en"]);
  });

  it("exposes 3 providers", () => {
    expect(ALL_PROVIDERS).toEqual(["bhashini", "aws", "mock"]);
  });

  it("default provider order is Bhashini → AWS", () => {
    expect(DEFAULT_PROVIDER_ORDER).toEqual(["bhashini", "aws"]);
  });
});

describe("pickProviderOrder()", () => {
  it("returns ['mock'] when provider='mock'", () => {
    expect(pickProviderOrder({ lang: "te", provider: "mock" })).toEqual(["mock"]);
  });

  it("returns ['bhashini'] when provider='bhashini' and key present", () => {
    expect(
      pickProviderOrder({ lang: "te", provider: "bhashini", env: { BHASHINI_API_KEY: "x" } }),
    ).toEqual(["bhashini"]);
  });

  it("returns [] when provider='bhashini' but key missing", () => {
    expect(pickProviderOrder({ lang: "te", provider: "bhashini", env: {} })).toEqual([]);
  });

  it("returns ['aws'] only when BOTH AWS keys present AND BUDGET_MODE=paid", () => {
    expect(pickProviderOrder({ lang: "hi", provider: "aws", env: {} })).toEqual([]);
    expect(
      pickProviderOrder({
        lang: "hi",
        provider: "aws",
        env: { AWS_ACCESS_KEY_ID: "a", BUDGET_MODE: "paid" },
      }),
    ).toEqual([]);
    expect(
      pickProviderOrder({
        lang: "hi",
        provider: "aws",
        env: { AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b", BUDGET_MODE: "paid" },
      }),
    ).toEqual(["aws"]);
  });

  it("BUDGET_MODE=zero-spend (default) strips AWS even with creds set", () => {
    // provider='aws' explicitly requested but mode blocks → []
    expect(
      pickProviderOrder({
        lang: "hi",
        provider: "aws",
        env: { AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b" /* mode defaults zero-spend */ },
      }),
    ).toEqual([]);
  });

  it("auto + BUDGET_MODE=zero-spend strips AWS from chain (Bhashini-only)", () => {
    expect(
      pickProviderOrder({
        lang: "te",
        provider: "auto",
        env: {
          BHASHINI_API_KEY: "x",
          AWS_ACCESS_KEY_ID: "a",
          AWS_SECRET_ACCESS_KEY: "b",
          /* no BUDGET_MODE → defaults to zero-spend */
        },
      }),
    ).toEqual(["bhashini"]);   // AWS stripped by budget guard
  });

  it("auto + BUDGET_MODE=paid: prefers Bhashini, falls back to AWS", () => {
    expect(
      pickProviderOrder({
        lang: "te",
        provider: "auto",
        env: {
          BUDGET_MODE: "paid",
          BHASHINI_API_KEY: "x",
          AWS_ACCESS_KEY_ID: "a",
          AWS_SECRET_ACCESS_KEY: "b",
        },
      }),
    ).toEqual(["bhashini", "aws"]);
  });

  it("auto + no creds + test env → ['mock']", () => {
    expect(pickProviderOrder({ lang: "te", provider: "auto", env: { VITEST: "1" } })).toEqual([
      "mock",
    ]);
  });

  it("auto + no creds + non-test env → []", () => {
    expect(pickProviderOrder({ lang: "te", provider: "auto", env: {} })).toEqual([]);
  });
});

describe("hashAudio()", () => {
  it("returns 64-char hex sha256", async () => {
    const audio = new Uint8Array([1, 2, 3, 4, 5]);
    const h = await hashAudio(audio);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input = same hash", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(await hashAudio(a)).toBe(await hashAudio(b));
  });

  it("differs for different input", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(await hashAudio(a)).not.toBe(await hashAudio(b));
  });

  it("accepts ArrayBuffer", async () => {
    const buf = new Uint8Array([5, 6, 7]).buffer;
    const h = await hashAudio(buf);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects non-bytes input", async () => {
    await expect(hashAudio(42)).rejects.toThrow();
    await expect(hashAudio("string")).rejects.toThrow();
  });
});

describe("mockTranscribe()", () => {
  it("returns Telugu by default for lang=te", () => {
    const result = mockTranscribe({ lang: "te", audio_sha256: "0".repeat(64) });
    expect(result.ok).toBe(true);
    expect(result.text).toMatch(/Vasavi Vista/);
    expect(result.lang).toBe("te");
    expect(result.provider).toBe("mock");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it("returns Hindi for lang=hi", () => {
    const result = mockTranscribe({ lang: "hi", audio_sha256: "f".repeat(64) });
    expect(result.text).toMatch(/Vasavi Vista basement mein/);
    expect(result.lang).toBe("hi");
  });

  it("returns English for lang=en", () => {
    const result = mockTranscribe({ lang: "en", audio_sha256: "a".repeat(64) });
    expect(result.text).toMatch(/I am at Vasavi Vista/);
    expect(result.lang).toBe("en");
  });

  it("confidence varies with hash (deterministic)", () => {
    const a = mockTranscribe({ lang: "te", audio_sha256: "0".repeat(64) });
    const b = mockTranscribe({ lang: "te", audio_sha256: "f".repeat(64) });
    expect(a.confidence).not.toBe(b.confidence);
    // Same hash = same confidence (idempotent)
    const a2 = mockTranscribe({ lang: "te", audio_sha256: "0".repeat(64) });
    expect(a.confidence).toBe(a2.confidence);
  });
});

describe("transcribe() — public interface", () => {
  it("returns mock output when transport='mock'", async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const result = await transcribe(audio, { transport: "mock", lang: "te" });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.audio_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects unsupported language", async () => {
    const result = await transcribe(new Uint8Array([0]), { lang: "fr" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported language/);
  });

  it("rejects unknown provider", async () => {
    const result = await transcribe(new Uint8Array([0]), { provider: "foobar" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown provider/);
  });

  it("returns ok:false when no providers + no transport", async () => {
    const result = await transcribe(new Uint8Array([1, 2, 3]), { provider: "bhashini" });
    expect(result.ok).toBe(false);
    expect(result.provider_tried).toEqual([]);
  });

  it("calls efClient when provided", async () => {
    const calls = [];
    const efClient = {
      invoke: async (name, opts) => {
        calls.push({ name, opts });
        return {
          data: { ok: true, text: "from-EF", confidence: 0.9, lang: "te", provider: "bhashini", audio_sha256: "deadbeef" },
        };
      },
    };
    const audio = new Uint8Array([1, 2, 3]);
    const result = await transcribe(audio, {
      env: { BHASHINI_API_KEY: "x" },
      efClient,
    });
    expect(calls.length).toBe(1);
    expect(calls[0].name).toBe("voice_transcribe");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("from-EF");
  });

  it("delegates the full fallback chain to the EF when client has no keys over 'ef' transport", async () => {
    let sentOrder;
    const efClient = {
      invoke: async (name, opts) => {
        sentOrder = opts.body.provider_order;
        return {
          data: { ok: true, text: "mock fallback", confidence: 0.9, lang: "te", provider: "mock", audio_sha256: "deadbeef" },
        };
      },
    };
    const audio = new Uint8Array([1, 2, 3]);
    const result = await transcribe(audio, { lang: "te", transport: "ef", efClient });
    expect(sentOrder).toEqual(["bhashini", "aws", "mock"]);
    expect(result.ok).toBe(true);
    expect(result.text).toBe("mock fallback");
  });
});

describe("meetsAccuracyBar()", () => {
  it("returns true at threshold", () => {
    expect(meetsAccuracyBar({ ok: true, confidence: 0.85 })).toBe(true);
    expect(meetsAccuracyBar({ ok: true, confidence: 0.95 })).toBe(true);
  });
  it("returns false below threshold", () => {
    expect(meetsAccuracyBar({ ok: true, confidence: 0.5 })).toBe(false);
  });
  it("returns null when confidence missing or result failed", () => {
    expect(meetsAccuracyBar({ ok: false, error: "x" })).toBe(null);
    expect(meetsAccuracyBar({ ok: true })).toBe(null);
    expect(meetsAccuracyBar(null)).toBe(null);
  });
  it("respects custom threshold", () => {
    expect(meetsAccuracyBar({ ok: true, confidence: 0.9 }, 0.95)).toBe(false);
    expect(meetsAccuracyBar({ ok: true, confidence: 0.96 }, 0.95)).toBe(true);
  });
});
