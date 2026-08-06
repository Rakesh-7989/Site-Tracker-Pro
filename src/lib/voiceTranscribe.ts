import { isProviderAllowed } from './budgetMode';

type Language = 'te' | 'hi' | 'en' | 'auto';
type Provider = 'auto' | 'bhashini' | 'aws' | 'mock';

export const SUPPORTED_LANGUAGES: readonly string[] = ['te', 'hi', 'en'];
export const ALL_PROVIDERS: readonly string[] = ['bhashini', 'aws', 'mock'];
export const DEFAULT_PROVIDER_ORDER: readonly string[] = ['bhashini', 'aws'];

/** Full fallback chain sent to the EF so it can try real providers then mock. */
export const FULL_PROVIDER_ORDER: readonly string[] = ['bhashini', 'aws', 'mock'];

export function pickProviderOrder({ lang, provider, env = {} }: { lang: Language; provider: Provider; env?: Record<string, any> }): Provider[] {
  const awsAllowed = isProviderAllowed('aws', env).allowed;
  if (provider === 'mock') return ['mock'];
  if (provider === 'bhashini') {
    return env.BHASHINI_API_KEY ? ['bhashini'] : [];
  }
  if (provider === 'aws') {
    if (!awsAllowed) return [];
    return (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) ? ['aws'] : [];
  }
  const out: Provider[] = [];
  if (env.BHASHINI_API_KEY) out.push('bhashini');
  if (awsAllowed && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    out.push('aws');
  }
  if (!out.length && (env.VITEST || env.NODE_ENV === 'test')) out.push('mock');
  void lang;
  return out;
}

export async function hashAudio(audio: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  let bytes: Uint8Array;
  if (audio instanceof Uint8Array) {
    bytes = audio;
  } else if (audio instanceof ArrayBuffer) {
    bytes = new Uint8Array(audio);
  } else if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    bytes = new Uint8Array(await audio.arrayBuffer());
  } else {
    throw new Error('hashAudio: input must be Blob, ArrayBuffer, or Uint8Array');
  }
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  if (!subtle) throw new Error('hashAudio: SubtleCrypto unavailable');
  const digest = await subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function mockTranscribe({ lang, audio_sha256 }: { lang: Language; audio_sha256: string }): {
  ok: true; text: string; confidence: number; lang: string; provider: 'mock'; audio_sha256: string; cached: false;
} {
  const cannedByLang: Record<string, string> = {
    te: 'naynu ee-roju Vasavi Vista basement parking lo unna, slab pour ayindi',
    hi: 'aaj Vasavi Vista basement mein slab pour ho gaya',
    en: 'I am at Vasavi Vista basement parking today, the slab has been poured',
    auto: 'naynu ee-roju Vasavi Vista basement parking lo unna, slab pour ayindi',
  };
  const text = cannedByLang[lang] || cannedByLang.te;
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

interface TranscribeResult {
  ok: boolean;
  text?: string;
  confidence?: number;
  lang?: string;
  provider?: Provider;
  audio_sha256?: string;
  cached?: boolean;
  error?: string;
  provider_tried?: Provider[];
}

export async function transcribe(
  audio: Blob | ArrayBuffer | Uint8Array,
  opts: { lang?: Language; provider?: Provider; env?: Record<string, any>; transport?: 'ef' | 'mock'; efClient?: any } = {},
): Promise<TranscribeResult> {
  const { lang = 'auto', provider = 'auto', env = {}, transport, efClient } = opts;
  if (lang !== 'auto' && !SUPPORTED_LANGUAGES.includes(lang)) {
    return { ok: false, error: `unsupported language: ${lang}` };
  }
  if (!ALL_PROVIDERS.includes(provider) && provider !== 'auto') {
    return { ok: false, error: `unknown provider: ${provider}` };
  }

  const audio_sha256 = await hashAudio(audio);
  const order = pickProviderOrder({ lang, provider, env });

  if (transport === 'mock' || (order.length === 1 && order[0] === 'mock')) {
    return mockTranscribe({ lang, audio_sha256 });
  }

  if (efClient && typeof efClient.invoke === 'function') {
    try {
      // When the client has no provider keys, we can't pick a non-empty
      // order locally — but over the 'ef' transport the Edge Function holds
      // the real keys, so delegate the whole fallback chain to it.
      const planOrder = order.length ? order : (transport === 'ef' ? [...FULL_PROVIDER_ORDER] : order);
      const res = await efClient.invoke('voice_transcribe', {
        body: { audio_sha256, lang, provider_order: planOrder },
      });
      if (res?.error) {
        return { ok: false, error: res.error.message || 'EF error', provider_tried: order };
      }
      return res?.data ?? { ok: false, error: 'EF returned no data', provider_tried: order };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err), provider_tried: order };
    }
  }

  if (!order.length) {
    const awsBlocked = !isProviderAllowed('aws', env).allowed;
    return {
      ok: false,
      error: awsBlocked
        ? 'No voice provider configured. Set BHASHINI_API_KEY. (AWS is blocked by BUDGET_MODE=zero-spend.)'
        : 'No voice provider configured. Set BHASHINI_API_KEY or AWS_ACCESS_KEY_ID.',
      provider_tried: [],
    };
  }

  return {
    ok: false,
    error: 'No transport (efClient) provided to transcribe()',
    provider_tried: order,
  };
}

export function meetsAccuracyBar(result: TranscribeResult | null | undefined, threshold = 0.85): boolean | null {
  if (!result?.ok || typeof result.confidence !== 'number') return null;
  return result.confidence >= threshold;
}
