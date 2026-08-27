-- Sprint 2 (Session 30.3) — DPR messages + delivery log.
--
-- The supervisor's WhatsApp Daily Progress Report flow ships in Sprint 2.
-- This migration creates the canonical message table + the per-attempt
-- delivery log used for retry tracking + SLO measurement.
--
-- Schema choices:
-- - `dpr_messages.client_token` is the idempotency key. Mobile client
--   generates a UUID before send; if the EF is called twice with the
--   same client_token, the EF returns the original result. Matches the
--   cashfree_events pattern (migration 31).
-- - `dpr_delivery_log` is append-only: each retry attempt writes a new
--   row. The latest row by `attempt_number` is the current status.
-- - Anchor URL (BuildNow Telangana badge) lives on the message row so
--   re-renders of the WhatsApp template don't need a join.
--
-- See docs/architecture/SPRINT_2_ARCHITECTURE.md for the full interface contract.

BEGIN;

-- ── Messages: the canonical DPR submitted by a supervisor ──────────────────
create table if not exists dpr_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  client_token uuid not null,                  -- idempotency key from mobile
  supervisor_user_id uuid references profiles(id) on delete set null,
  promoter_phone_e164 text not null,           -- '+919876543210'
  language text not null default 'te' check (language in ('te','hi','en')),
  -- Voice + transcript
  voice_audio_url text,                        -- Supabase Storage URL
  voice_audio_sha256 text,                     -- matches voice_transcripts PK
  transcript_text text,
  transcript_confidence numeric(4,3) check (transcript_confidence is null or (transcript_confidence >= 0 and transcript_confidence <= 1)),
  transcript_provider text check (transcript_provider in (null, 'bhashini','aws','mock','manual')),
  -- Photo + geotag
  photo_url text,
  photo_taken_at timestamptz,
  photo_lat numeric(9,6),
  photo_lon numeric(9,6),
  photo_accuracy_metres int,
  -- BuildNow anchor
  buildnow_anchor_url text,
  buildnow_anchor_hash text,                   -- sha256 of canonical payload
  buildnow_synced_at timestamptz,
  -- Lifecycle
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','read','failed')),
  failure_reason text,
  meta_message_id text,                        -- Meta Cloud API message ID after send
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpr_messages_client_token_unique unique (org_id, client_token)
);

comment on table dpr_messages is
  'Sprint 2: canonical DPR record. One row per supervisor-sent message; client_token is the idempotency key.';
comment on column dpr_messages.transcript_provider is
  'Which voice-transcription provider produced the transcript; matches voice_transcripts.provider';

create index if not exists idx_dpr_messages_org_created on dpr_messages (org_id, created_at desc);
create index if not exists idx_dpr_messages_project on dpr_messages (project_id, created_at desc);
create index if not exists idx_dpr_messages_status on dpr_messages (status) where status in ('queued','sending','failed');

-- ── Delivery log: per-attempt audit ────────────────────────────────────────
create table if not exists dpr_delivery_log (
  id uuid primary key default gen_random_uuid(),
  dpr_message_id uuid not null references dpr_messages(id) on delete cascade,
  attempt_number int not null check (attempt_number >= 1 and attempt_number <= 5),
  attempted_at timestamptz not null default now(),
  outcome text not null check (outcome in ('success','retry','failed')),
  duration_ms int,                             -- wall-time of the attempt
  status_code int,                             -- HTTP status from Meta
  error_code text,                             -- application-level error from response body
  error_detail text,
  meta_response jsonb,                         -- redacted Meta response for audit
  constraint dpr_delivery_attempt_unique unique (dpr_message_id, attempt_number)
);

comment on table dpr_delivery_log is
  'Sprint 2: append-only per-retry log. Latest row by attempt_number = current status.';

create index if not exists idx_dpr_delivery_log_message on dpr_delivery_log (dpr_message_id, attempt_number);
create index if not exists idx_dpr_delivery_log_outcome on dpr_delivery_log (outcome, attempted_at desc);

-- ── Trigger: keep dpr_messages.updated_at fresh ────────────────────────────
create or replace function trg_dpr_messages_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_dpr_messages_updated_at on dpr_messages;
create trigger trg_dpr_messages_updated_at
  before update on dpr_messages
  for each row execute function trg_dpr_messages_touch_updated_at();

-- ── RLS: org-scoped ────────────────────────────────────────────────────────
alter table dpr_messages enable row level security;
alter table dpr_delivery_log enable row level security;

drop policy if exists dpr_messages_read on dpr_messages;
create policy dpr_messages_read on dpr_messages
  for select to authenticated
  using (
    org_id = (select org_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists dpr_messages_insert on dpr_messages;
create policy dpr_messages_insert on dpr_messages
  for insert to authenticated
  with check (
    org_id = (select org_id from profiles where id = auth.uid())
  );

drop policy if exists dpr_messages_update on dpr_messages;
create policy dpr_messages_update on dpr_messages
  for update to authenticated
  using (
    org_id = (select org_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists dpr_delivery_log_read on dpr_delivery_log;
create policy dpr_delivery_log_read on dpr_delivery_log
  for select to authenticated
  using (
    exists (
      select 1 from dpr_messages m
      where m.id = dpr_delivery_log.dpr_message_id
      and m.org_id = (select org_id from profiles where id = auth.uid())
    )
    or exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  );

-- The Edge Function writes delivery log rows via service-role; no insert
-- policy needed for authenticated users.

-- ── SLO helper: success rate over a time window ────────────────────────────
create or replace function dpr_delivery_slo_window(
  p_org_id uuid,
  p_window_start timestamptz default (now() - interval '24 hours'),
  p_window_end timestamptz default now()
)
returns table (
  total int,
  delivered int,
  failed int,
  in_flight int,
  success_pct numeric
)
language sql stable as $$
  select
    count(*)::int as total,
    count(*) filter (where status in ('delivered','read'))::int as delivered,
    count(*) filter (where status = 'failed')::int as failed,
    count(*) filter (where status in ('queued','sending'))::int as in_flight,
    case
      when count(*) = 0 then null
      else round(100.0 * count(*) filter (where status in ('delivered','read')) / count(*), 1)
    end as success_pct
  from dpr_messages
  where org_id = p_org_id
  and created_at >= p_window_start
  and created_at <= p_window_end;
$$;

comment on function dpr_delivery_slo_window(uuid, timestamptz, timestamptz) is
  'Sprint 2: rolling DPR delivery SLO snapshot for an org. Used by the status page + ops dashboard.';

COMMIT;
