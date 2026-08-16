-- SiteTrack Pro — migration 201: resend_delivery_events (2026-08-16).
-- Append-only delivery/bounce log fed by the resend-webhook Edge Function.
--
-- The EF verifies the Svix signature with RESEND_WEBHOOK_SECRET before writing;
-- this table is service_role-write only (no anon/authenticated insert path), so
-- forged webhooks are blocked twice (signature + RLS). Read is superadmin-only
-- via the is_superadmin() gate (mirrors platform_users 184 posture).

BEGIN;

create table if not exists public.resend_delivery_events (
  id         uuid primary key default gen_random_uuid(),
  event      text not null check (event in ('sent','delivered','delivery_delayed','complained','bounced','opened','clicked')),
  raw_event  text not null,
  message_id text,
  to_email   text,
  subject    text,
  tags       jsonb not null default '[]'::jsonb,
  payload    jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_resend_delivery_events_event on public.resend_delivery_events(event);
create index if not exists idx_resend_delivery_events_message on public.resend_delivery_events(message_id);
create index if not exists idx_resend_delivery_events_to on public.resend_delivery_events(to_email);
create index if not exists idx_resend_delivery_events_received on public.resend_delivery_events(received_at desc);

alter table public.resend_delivery_events enable row level security;

-- Write: service_role only (the EF holds the service role key).
drop policy if exists resend_delivery_events_insert on public.resend_delivery_events;
create policy resend_delivery_events_insert on public.resend_delivery_events
  for insert to service_role with check (true);

-- Read: superadmin only.
drop policy if exists resend_delivery_events_read on public.resend_delivery_events;
create policy resend_delivery_events_read on public.resend_delivery_events
  for select to authenticated
  using (public.is_superadmin());

-- Grants: service_role can write, superadmin (via RLS) can read.
revoke all on public.resend_delivery_events from anon;
grant insert on public.resend_delivery_events to service_role;
grant select on public.resend_delivery_events to authenticated;

-- Verification notice
do $$ declare
  tbl int; idx int;
begin
  select count(*) into tbl from information_schema.tables where table_schema = 'public' and table_name = 'resend_delivery_events';
  select count(*) into idx from pg_indexes where schemaname = 'public' and tablename = 'resend_delivery_events';
  raise notice '201_resend_delivery_events: table=%, indexes=%', tbl, idx;
end $$;

COMMIT;