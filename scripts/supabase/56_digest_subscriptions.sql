-- Sprint 2/3 foundation (Session 30.9) — promoter daily WhatsApp digest.
--
-- Per docs/business/POSITIONING.md proof point #2: "BuildNow Telangana + 7am
-- WhatsApp digest. You don't log in. Ever." This table tracks which
-- (org, project, promoter_phone) triplets are subscribed to the daily
-- digest, what timezone they prefer, and what the last sent digest
-- looked like.
--
-- The cron Edge Function (promoter_digest_cron) reads this table at
-- the top of each hour, finds subscriptions whose local time is 07:00,
-- and sends a WhatsApp summary built by _shared/digest_renderer.ts.
--
-- Idempotency: a unique (subscription_id, sent_for_date) constraint on
-- the dispatch log prevents double-sends if the cron runs twice.

BEGIN;

-- ── Subscriptions ──────────────────────────────────────────────────────────
create table if not exists digest_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  promoter_phone_e164 text not null,            -- '+919876543210'
  promoter_name text,                            -- friendly addressing
  language text not null default 'en' check (language in ('te','hi','en')),
  -- Schedule
  timezone text not null default 'Asia/Kolkata',
  hour_local int not null default 7 check (hour_local >= 0 and hour_local <= 23),
  -- Lifecycle
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  paused_until date,                             -- e.g. site shutdown during Diwali
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digest_subscriptions_unique_per_promoter
    unique (org_id, project_id, promoter_phone_e164)
);

comment on table digest_subscriptions is
  'Sprint 3 (Session 30.9): one row per (project, promoter) that receives the daily 7am WhatsApp digest. Cron reads this table hourly + matches local hour to hour_local.';

create index if not exists idx_digest_subs_org on digest_subscriptions (org_id);
create index if not exists idx_digest_subs_active_hour on digest_subscriptions (hour_local, status) where status = 'active';

-- Touch updated_at on UPDATE
create or replace function trg_digest_subs_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end$$;

drop trigger if exists trg_digest_subs_updated_at on digest_subscriptions;
create trigger trg_digest_subs_updated_at
  before update on digest_subscriptions
  for each row execute function trg_digest_subs_touch();

-- ── Dispatch log (per send) ────────────────────────────────────────────────
create table if not exists digest_dispatches (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references digest_subscriptions(id) on delete cascade,
  sent_for_date date not null,                   -- the date being summarized
  dispatched_at timestamptz not null default now(),
  -- Outcome
  outcome text not null check (outcome in ('queued','sent','failed','skipped')),
  meta_message_id text,                          -- Meta Cloud API message id on success
  failure_reason text,
  -- Payload snapshot (so we can replay / show "what we said")
  rendered_payload jsonb,
  constraint digest_dispatches_unique_per_day
    unique (subscription_id, sent_for_date)
);

comment on table digest_dispatches is
  'Sprint 3: append-only log of every daily digest attempt. Composite unique (subscription_id, sent_for_date) is the idempotency guarantee — cron firing twice for the same date is safe.';

create index if not exists idx_digest_dispatch_outcome on digest_dispatches (outcome, dispatched_at desc);
create index if not exists idx_digest_dispatch_sub on digest_dispatches (subscription_id, sent_for_date desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table digest_subscriptions enable row level security;
alter table digest_dispatches enable row level security;

drop policy if exists digest_subs_read on digest_subscriptions;
create policy digest_subs_read on digest_subscriptions
  for select to authenticated
  using (
    org_id = (select org_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists digest_subs_write on digest_subscriptions;
create policy digest_subs_write on digest_subscriptions
  for all to authenticated
  using (
    org_id = (select org_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  )
  with check (
    org_id = (select org_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists digest_dispatch_read on digest_dispatches;
create policy digest_dispatch_read on digest_dispatches
  for select to authenticated
  using (
    exists (
      select 1 from digest_subscriptions s
      where s.id = digest_dispatches.subscription_id
      and s.org_id = (select org_id from profiles where id = auth.uid())
    )
    or exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  );

-- ── Helpers ────────────────────────────────────────────────────────────────

-- Subscriptions due to send right now (called by the cron EF every hour).
-- Uses each subscription's timezone to compute "is it 07:00 in their
-- local time right now?".
create or replace function digest_subscriptions_due(p_now timestamptz default now())
returns table (
  subscription_id uuid,
  org_id uuid,
  project_id uuid,
  promoter_phone_e164 text,
  promoter_name text,
  language text,
  sent_for_date date
)
language sql stable as $$
  select
    s.id as subscription_id,
    s.org_id,
    s.project_id,
    s.promoter_phone_e164,
    s.promoter_name,
    s.language,
    (p_now at time zone s.timezone)::date - interval '1 day' as sent_for_date
  from digest_subscriptions s
  where s.status = 'active'
    and (s.paused_until is null or s.paused_until < (p_now at time zone s.timezone)::date)
    and extract(hour from p_now at time zone s.timezone)::int = s.hour_local
    and not exists (
      select 1 from digest_dispatches d
      where d.subscription_id = s.id
        and d.sent_for_date = (p_now at time zone s.timezone)::date - interval '1 day'
    );
$$;

comment on function digest_subscriptions_due(timestamptz) is
  'Sprint 3: subscriptions whose local clock just hit their preferred hour AND no dispatch row exists yet for yesterday. Cron EF calls this once per top-of-hour run.';

-- Helper to register a digest subscription from the org admin UI
-- (Sprint 3 deliverable). Validates phone shape + dedupes.
create or replace function subscribe_to_daily_digest(
  p_project_id uuid,
  p_promoter_phone_e164 text,
  p_promoter_name text default null,
  p_language text default 'en',
  p_hour_local int default 7
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org_id uuid;
  v_sub_id uuid;
begin
  if not p_promoter_phone_e164 ~ '^\+\d{10,15}$' then
    raise exception 'promoter_phone_e164 must be in E.164 format (+XXXXXXXXXXX)';
  end if;

  select org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_id % not found', p_project_id;
  end if;

  insert into digest_subscriptions (
    org_id, project_id, promoter_phone_e164, promoter_name, language, hour_local
  ) values (
    v_org_id, p_project_id, p_promoter_phone_e164, p_promoter_name, p_language, p_hour_local
  )
  on conflict (org_id, project_id, promoter_phone_e164) do update set
    promoter_name = coalesce(excluded.promoter_name, digest_subscriptions.promoter_name),
    language = excluded.language,
    hour_local = excluded.hour_local,
    status = 'active',
    paused_until = null
  returning id into v_sub_id;

  return v_sub_id;
end$$;

comment on function subscribe_to_daily_digest(uuid, text, text, text, int) is
  'Sprint 3: org-admin RPC to subscribe a promoter to the daily 7am digest. Idempotent via UNIQUE (org_id, project_id, promoter_phone_e164).';

COMMIT;
