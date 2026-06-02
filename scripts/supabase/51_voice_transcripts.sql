-- Sprint 2 (Session 30.3) — Voice transcripts cache.
--
-- Bhashini + AWS Transcribe both bill per-second. If a supervisor re-sends
-- the same voice note (deduped by audio_sha256), we should return the
-- cached transcript instead of re-billing the provider.
--
-- audio_sha256 is computed on the raw audio bytes BEFORE upload — the
-- client computes it, sends in the EF call, EF checks cache, if miss it
-- transcribes + writes the row. Same audio file submitted by 5 different
-- supervisors costs 1 transcription.
--
-- Used by:
--   - src/lib/voiceTranscribe.js (browser-side cache check before EF call)
--   - supabase/functions/voice_transcribe (EF-side cache hit + write)

BEGIN;

create table if not exists voice_transcripts (
  audio_sha256 text primary key,                 -- hex sha256 of audio bytes
  language text not null check (language in ('te','hi','en','auto')),
  transcript_text text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  provider text not null check (provider in ('bhashini','aws','manual','mock')),
  duration_ms int,                               -- audio clip length
  -- Telemetry for ops
  org_id_first uuid references organizations(id) on delete set null,
  attempts_count int not null default 1,         -- incremented on cache hit
  created_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now()
);

comment on table voice_transcripts is
  'Sprint 2: cache of voice transcriptions keyed by audio_sha256. Identical audio = identical transcript, no re-billing.';
comment on column voice_transcripts.attempts_count is
  'How many times this transcript has been served from cache. Helps prioritize which audio clips are worth manual review.';

create index if not exists idx_voice_transcripts_lang on voice_transcripts (language);
create index if not exists idx_voice_transcripts_provider on voice_transcripts (provider);
create index if not exists idx_voice_transcripts_low_confidence on voice_transcripts (confidence) where confidence < 0.80;

-- ── Stats helper ───────────────────────────────────────────────────────────
create or replace function voice_transcripts_stats(p_org_id uuid)
returns table (
  language text,
  provider text,
  avg_confidence numeric,
  total_transcripts int,
  total_cache_hits int,
  low_confidence_count int
)
language sql stable as $$
  select
    language,
    provider,
    round(avg(confidence), 3) as avg_confidence,
    count(*)::int as total_transcripts,
    sum(attempts_count - 1)::int as total_cache_hits,
    count(*) filter (where confidence < 0.80)::int as low_confidence_count
  from voice_transcripts
  where org_id_first = p_org_id or org_id_first is null
  group by language, provider
  order by language, provider;
$$;

comment on function voice_transcripts_stats(uuid) is
  'Sprint 2: per-org transcription stats. Used by ops to track Bhashini vs AWS quality drift.';

-- ── Cache hit / increment helper RPC ───────────────────────────────────────
create or replace function record_voice_cache_hit(p_audio_sha256 text)
returns void
language sql security definer as $$
  update voice_transcripts
  set attempts_count = attempts_count + 1,
      last_hit_at = now()
  where audio_sha256 = p_audio_sha256;
$$;

comment on function record_voice_cache_hit(text) is
  'Called by voice_transcribe EF on cache hit to bump telemetry.';

-- ── RLS: everyone authenticated can read (cache is shared) ─────────────────
alter table voice_transcripts enable row level security;
drop policy if exists voice_transcripts_read on voice_transcripts;
create policy voice_transcripts_read on voice_transcripts
  for select to authenticated using (true);

-- Writes only via service-role (Edge Function) — no insert/update policy.

COMMIT;
