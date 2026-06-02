// SiteTrack Pro — Sprint 2 (Session 30.3): voice transcription.
//
// Provider-agnostic interface for converting a Telugu/Hindi/English voice
// clip to text. Selects Bhashini (primary, government's official India-
// language pipeline, ~free for non-profit usage tiers) → AWS Transcribe
// (paid fallback) → mock (tests).
//
// This module is pure-JS (no Node-only deps) so it works in:
//   - The browser (preflight cache lookup before sending the EF call).
//   - Deno Edge Functions (the actual transcription request).
//
// All real provider calls are intentionally NOT implemented in this lib
// — they belong in `supabase/functions/voice_transcribe/index.ts`. This
// module provides:
//   1. `transcribe()` — the public interface (browser hits the EF; EF
//      hits providers).
//   2. `pickProvider()` — pure decision logic (testable).
//   3. `hashAudio()` — sha256 helper used both sides for cache keys.
//   4. `mockTranscribe()` — deterministic test stub.
//
// See docs/SPRINT_2_ARCHITECTURE.md for the full contract.

/** @typedef {'te'|'hi'|'en'|'auto'} Language */
/** @typedef {'auto'|'bhashini'|'aws'|'mock'} Provider */

export const SUPPORTED_LANGUAGES = ['te', 'hi', 'en'];
export const ALL_PROVIDERS = ['bhashini', 'aws', 'mock'];

/**
 * The default provider preference order. The EF uses this to attempt
 * providers in sequence on transient failure.
 */
export const DEFAULT_PROVIDER_ORDER = ['bhashini', 'aws'];

/**
 * Pick which providers to try, in order, for a given input + env.
 *
 * @param {{lang: Language, provider: Provider, env?: object}} args
 * @returns {Provider[]}
 */
export function pickProviderOrder({ lang, provider, env = {} }) {
  if (provider === 'mock') return ['mock'];
  if (provider === 'bhashini') {
    return env.BHASHINI_API_KEY ? ['bhashini'] : [];
  }
  if (provider === 'aws') {
    return (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) ? ['aws'] : [];
  }
  // 'auto' — try Bhashini first if configured, then AWS, then nothing.
  const out = [];
  if (env.BHASHINI_API_KEY) out.push('bhashini');
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) out.push('aws');
  // Test-mode escape hatch: if NOTHING is configured AND VITEST is set,
  // fall back to mock so tests don't hard-fail on missing creds.
  if (!out.length && (env.VITEST || env.NODE_ENV === 'test')) out.push('mock');
  // Future: lang-specific routing — e.g. AWS is stronger for Hindi than Telugu.
  // For now, the order is provider-availability, not lang-tuned.
  void lang;
  return out;
}

/**
 * Compute sha256 hex of an audio Blob / ArrayBuffer. Used as the cache key
 * in voice_transcripts table. Same algorithm on browser + Deno.
 *
 * @param {Blob | ArrayBuffer | Uint8Array} audio
 * @returns {Promise<string>} hex sha256
 */
export async function hashAudio(audio) {
  let bytes;
  if (audio instanceof Uint8Array) {
    bytes = audio;
  } else if (audio instanceof ArrayBuffer) {
    bytes = new Uint8Array(audio);
  } else if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    bytes = new Uint8Array(await audio.arrayBuffer());
  } else {
    throw new Error('hashAudio: input must be Blob, ArrayBuffer, or Uint8Array');
  }
  // Web Crypto SubtleCrypto — available in browser + Deno + Node 18+.
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  if (!subtle) throw new Error('hashAudio: SubtleCrypto unavailable');
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The deterministic mock transcriber used by tests. Returns a canned
 * transcript that depends on the input language so test fixtures can
 * cover the te/hi/en branches.
 *
 * @param {{lang: Language, audio_sha256: string}} args
 * @returns {{ok: true, text: string, confidence: number, lang: string, provider: 'mock', audio_sha256: string, cached: false}}
 */
export function mockTranscribe({ lang, audio_sha256 }) {
  const cannedByLang = {
    te: 'naynu ee-roju Vasavi Vista basement parking lo unna, slab pour ayindi',
    hi: 'aaj Vasavi Vista basement mein slab pour ho gaya',
    en: 'I am at Vasavi Vista basement parking today, the slab has been poured',
    auto: 'naynu ee-roju Vasavi Vista basement parking lo unna, slab pour ayindi',
  };
  const text = cannedByLang[lang] || cannedByLang.te;
  // Confidence varies with hash to simulate provider-side variance.
  const confidenceSeed = parseInt(audio_sha256.slice(0, 4), 16) / 0xffff;
  const confidence = Math.round((0.85 + confidenceSeed * 0.1) * 1000) / 1000;
  return {
    ok: true,
    text,
    confidence,
    lang: lang === 'auto' ? 'te' : lang,
    provider: 'mock',
    audio_sha256,
    cached: false,
  };
}

/**
 * Result shape, normalized across all providers.
 * @typedef {Object} TranscribeResult
 * @property {boolean} ok
 * @property {string} [text]
 * @property {number} [confidence]   - 0..1
 * @property {string} [lang]
 * @property {Provider} [provider]
 * @property {string} [audio_sha256]
 * @property {boolean} [cached]
 * @property {string} [error]
 * @property {Provider[]} [provider_tried]
 */

/**
 * Main entrypoint. In the BROWSER this hits the EF; in the EF this is
 * NOT called (EF has its own logic). For tests / mock mode this returns
 * the canned response.
 *
 * @param {Blob | ArrayBuffer | Uint8Array} audio
 * @param {{lang?: Language, provider?: Provider, env?: object, transport?: 'ef'|'mock', efClient?: any}} [opts]
 * @returns {Promise<TranscribeResult>}
 */
export async function transcribe(audio, opts = {}) {
  const { lang = 'auto', provider = 'auto', env = {}, transport, efClient } = opts;
  if (lang !== 'auto' && !SUPPORTED_LANGUAGES.includes(lang)) {
    return { ok: false, error: `unsupported language: ${lang}` };
  }
  if (!ALL_PROVIDERS.includes(provider) && provider !== 'auto') {
    return { ok: false, error: `unknown provider: ${provider}` };
  }

  const audio_sha256 = await hashAudio(audio);
  const order = pickProviderOrder({ lang, provider, env });

  // Test mode / mock — return canned.
  if (transport === 'mock' || (order.length === 1 && order[0] === 'mock')) {
    return mockTranscribe({ lang, audio_sha256 });
  }

  // EF transport — the browser hits the voice_transcribe Edge Function.
  if (efClient && typeof efClient.invoke === 'function') {
    try {
      const res = await efClient.invoke('voice_transcribe', {
        body: { audio_sha256, lang, provider_order: order },
      });
      if (res?.error) {
        return { ok: false, error: res.error.message || 'EF error', provider_tried: order };
      }
      return res?.data ?? { ok: false, error: 'EF returned no data', provider_tried: order };
    } catch (err) {
      return { ok: false, error: err?.message || String(err), provider_tried: order };
    }
  }

  // No transport configured AND no providers available — fail explicit.
  if (!order.length) {
    return {
      ok: false,
      error: 'No voice provider configured. Set BHASHINI_API_KEY or AWS_ACCESS_KEY_ID.',
      provider_tried: [],
    };
  }

  return {
    ok: false,
    error: 'No transport (efClient) provided to transcribe()',
    provider_tried: order,
  };
}

/**
 * Check whether a transcript meets the Sprint 2 quality bar (>=85% accuracy
 * proxy = confidence >= 0.85). Returns null if confidence is unknown.
 */
export function meetsAccuracyBar(result, threshold = 0.85) {
  if (!result?.ok || typeof result.confidence !== 'number') return null;
  return result.confidence >= threshold;
}
