// SiteTrack Pro — Sprint 2 (Session 30.3): voice transcription Edge Function.
//
// Cache-first transcription:
//   1. Receives { audio_sha256, lang, provider_order } from browser.
//   2. Looks up voice_transcripts cache → if hit, bumps attempts_count + returns.
//   3. Otherwise tries each provider in provider_order with retry/backoff.
//   4. On first success, writes a row to voice_transcripts + returns.
//
// Provider implementations are SHELLS in this commit. Real Bhashini + AWS
// wiring lands Sprint 2 mid-cycle once founder gets API access.
// See docs/architecture/SPRINT_2_ARCHITECTURE.md for the contract.

// deno-lint-ignore-file no-explicit-any

import { authenticate } from "../_shared/auth.ts";

interface TranscribeRequest {
  audio_sha256: string;
  audio_url?: string;                          // Supabase Storage URL of the clip
  lang: "te" | "hi" | "en" | "auto";
  provider_order: ("bhashini" | "aws" | "mock")[];
  org_id?: string;
  project_id?: string;
}

interface TranscribeResponse {
  ok: boolean;
  text?: string;
  confidence?: number;
  lang?: string;
  provider?: string;
  audio_sha256?: string;
  cached?: boolean;
  provider_tried?: string[];
  error?: string;
}

const ALLOWED_LANGS = new Set(["te", "hi", "en", "auto"]);
const ALLOWED_PROVIDERS = new Set(["bhashini", "aws", "mock"]);

function validate(req: TranscribeRequest): string | null {
  if (!req.audio_sha256 || !/^[0-9a-f]{64}$/.test(req.audio_sha256)) {
    return "audio_sha256 must be 64-char lowercase hex";
  }
  if (!ALLOWED_LANGS.has(req.lang)) return `unsupported lang: ${req.lang}`;
  if (!Array.isArray(req.provider_order) || req.provider_order.length === 0) {
    return "provider_order must be a non-empty array";
  }
  for (const p of req.provider_order) {
    if (!ALLOWED_PROVIDERS.has(p)) return `unknown provider: ${p}`;
  }
  return null;
}

// ── Provider shells (TODO Sprint 2 mid-cycle) ─────────────────────────────

async function transcribeBhashini(
  req: TranscribeRequest,
  env: Record<string, string>,
): Promise<{ ok: boolean; text?: string; confidence?: number; error?: string }> {
  if (!env.BHASHINI_API_KEY) {
    return { ok: false, error: "BHASHINI_API_KEY missing" };
  }
  // TODO: real Bhashini AI4Bharat endpoint call. Reference:
  //   POST https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/compute
  //   See https://bhashini.gov.in/ for the developer docs.
  return { ok: false, error: "Bhashini integration not implemented yet" };
}

async function transcribeAws(
  req: TranscribeRequest,
  env: Record<string, string>,
): Promise<{ ok: boolean; text?: string; confidence?: number; error?: string }> {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    return { ok: false, error: "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing" };
  }
  // TODO: real AWS Transcribe SDK call. Note Transcribe supports
  // hi-IN + en-IN, but NOT te (Telugu) at the time of writing — for
  // Telugu we must rely on Bhashini.
  return { ok: false, error: "AWS Transcribe integration not implemented yet" };
}

function transcribeMock(req: TranscribeRequest): { ok: true; text: string; confidence: number } {
  const cannedByLang: Record<string, string> = {
    te: "naynu ee-roju Vasavi Vista basement parking lo unna, slab pour ayindi",
    hi: "aaj Vasavi Vista basement mein slab pour ho gaya",
    en: "I am at Vasavi Vista basement parking today, the slab has been poured",
    auto: "naynu ee-roju Vasavi Vista basement parking lo unna, slab pour ayindi",
  };
  const confidenceSeed = parseInt(req.audio_sha256.slice(0, 4), 16) / 0xffff;
  const confidence = Math.round((0.85 + confidenceSeed * 0.1) * 1000) / 1000;
  return {
    ok: true,
    text: cannedByLang[req.lang] || cannedByLang.te,
    confidence,
  };
}

async function runProvider(
  provider: "bhashini" | "aws" | "mock",
  req: TranscribeRequest,
  env: Record<string, string>,
): Promise<{ ok: boolean; text?: string; confidence?: number; error?: string }> {
  if (provider === "mock") return transcribeMock(req);
  if (provider === "bhashini") return transcribeBhashini(req, env);
  if (provider === "aws") return transcribeAws(req, env);
  return { ok: false, error: `unknown provider ${provider}` };
}

Deno.serve(async (httpReq: Request) => {
  if (httpReq.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let req: TranscribeRequest;
  try {
    req = await httpReq.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid JSON" } satisfies TranscribeResponse,
      { status: 400 },
    );
  }
  const invalid = validate(req);
  if (invalid) {
    return Response.json(
      { ok: false, error: invalid } satisfies TranscribeResponse,
      { status: 400 },
    );
  }

  // ── Security gate (Phase 0.5 hardening) ──
  // Cache writes bound to a real user. Previously this EF accepted ANY
  // caller, enabling cache-poisoning (attacker submits a wrong transcript
  // for a shared audio SHA, future legitimate callers receive the wrong
  // text). We require any authenticated user; project_members check is
  // applied only when project_id is provided.
  const auth = await authenticate(httpReq, {
    ...(req.project_id ? { requireProjectId: req.project_id } : {}),
  });
  if (!auth.ok) return auth.response;

  const env = Deno.env.toObject();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing" } satisfies TranscribeResponse,
      { status: 500 },
    );
  }

  // ── Cache lookup ─────────────────────────────────────────────────────────
  const cacheUrl =
    `${supabaseUrl}/rest/v1/voice_transcripts?audio_sha256=eq.${encodeURIComponent(req.audio_sha256)}&limit=1`;
  const cacheRes = await fetch(cacheUrl, {
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    },
  });
  if (cacheRes.ok) {
    const rows: any[] = await cacheRes.json();
    if (rows && rows.length > 0) {
      const row = rows[0];
      // Bump cache hit count via the RPC (no client needed — REST endpoint).
      await fetch(`${supabaseUrl}/rest/v1/rpc/record_voice_cache_hit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ p_audio_sha256: req.audio_sha256 }),
      });
      return Response.json(
        {
          ok: true,
          text: row.transcript_text,
          confidence: Number(row.confidence),
          lang: row.language,
          provider: row.provider,
          audio_sha256: row.audio_sha256,
          cached: true,
        } satisfies TranscribeResponse,
      );
    }
  }

  // ── Provider chain ───────────────────────────────────────────────────────
  const tried: string[] = [];
  let last: { ok: boolean; text?: string; confidence?: number; error?: string; provider?: string } = {
    ok: false,
    error: "no providers attempted",
  };
  for (const provider of req.provider_order) {
    tried.push(provider);
    const res = await runProvider(provider, req, env);
    if (res.ok) {
      last = { ...res, provider };
      break;
    }
    last = { ...res, provider };
  }

  if (!last.ok) {
    return Response.json(
      {
        ok: false,
        error: last.error ?? "all providers failed",
        provider_tried: tried,
        audio_sha256: req.audio_sha256,
      } satisfies TranscribeResponse,
      { status: 502 },
    );
  }

  // ── Write cache row (best-effort) ────────────────────────────────────────
  const cacheRow = {
    audio_sha256: req.audio_sha256,
    language: req.lang === "auto" ? "te" : req.lang,
    transcript_text: last.text,
    confidence: last.confidence,
    provider: last.provider,
    org_id_first: req.org_id ?? null,
  };
  await fetch(`${supabaseUrl}/rest/v1/voice_transcripts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Prefer": "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify(cacheRow),
  });

  return Response.json(
    {
      ok: true,
      text: last.text,
      confidence: last.confidence,
      lang: cacheRow.language,
      provider: last.provider,
      audio_sha256: req.audio_sha256,
      cached: false,
      provider_tried: tried,
    } satisfies TranscribeResponse,
  );
});
