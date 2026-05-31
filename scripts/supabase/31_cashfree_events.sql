-- SiteTrack Pro — Cashfree webhook event dedup (Session 28).
-- Run AFTER 30_whatsapp_log.sql. Idempotent.
--
-- Cashfree retries webhooks on 5xx / timeout. Without dedup we'd double-credit
-- subscriptions + double-write billing_history on every retry. This table
-- records each event_id we've seen + the resulting status — the webhook EF
-- consults it before applying any state change.

create table if not exists cashfree_events (
  event_id        text primary key,                          -- cf_event_id from webhook payload
  org_id          uuid references organizations(id) on delete set null,
  subscription_id text,
  event_type      text not null,                             -- PAYMENT_SUCCESS, MANDATE_AUTH_OK, etc.
  signature       text,                                      -- received x-webhook-signature
  raw_payload     jsonb,
  applied_at      timestamptz default now(),
  result          text not null
    check (result in ('applied','duplicate','signature_mismatch','rejected')),
  failure_reason  text
);

create index if not exists idx_cf_events_org_time on cashfree_events(org_id, applied_at desc);
create index if not exists idx_cf_events_sub on cashfree_events(subscription_id);

alter table cashfree_events enable row level security;

-- Read-only for org members + super-admin (forensic visibility).
create policy cf_events_read on cashfree_events for select
  using (is_superadmin() or org_id = user_org_id());

-- Inserts come exclusively from the webhook EF using service_role; tenant
-- users cannot write here.
revoke insert, update, delete on cashfree_events from authenticated;

-- Helper RPC the EF calls instead of a raw INSERT. Returns the existing row
-- if the event_id was seen before (caller treats this as "duplicate, skip").
create or replace function record_cashfree_event(
  p_event_id text,
  p_org_id uuid,
  p_subscription_id text,
  p_event_type text,
  p_signature text,
  p_raw jsonb
) returns table(was_duplicate boolean, event_id text)
language plpgsql security definer as $$
declare existing record;
begin
  select * into existing from public.cashfree_events where event_id = p_event_id;
  if existing.event_id is not null then
    was_duplicate := true;
    event_id := existing.event_id;
    return next; return;
  end if;
  insert into public.cashfree_events(event_id, org_id, subscription_id, event_type, signature, raw_payload, result)
  values (p_event_id, p_org_id, p_subscription_id, p_event_type, p_signature, p_raw, 'applied');
  was_duplicate := false;
  event_id := p_event_id;
  return next;
end;
$$;

do $$ declare n int; begin
  select count(*) into n from cashfree_events;
  raise notice '31_cashfree_events: ready. % event(s) recorded.', n;
end $$;
