-- SiteTrack Pro — migration 255: admit 'received' to resend_delivery_events.event.
--
-- Migration 201 created resend_delivery_events with a CHECK that allows only
-- the Resend delivery/bounce family
-- ('sent','delivered','delivery_delayed','complained','bounced','opened',
-- 'clicked'). The resend-webhook Edge Function normalizes the full Resend
-- event names via normalizeResendEventName(), which maps 'email.received' →
-- 'received' — so any inbound email to hello@sitetrackpro.in (the Phase A
-- forwarder) violated the CHECK and the webhook returned 500 {"error":
-- "log-failed"} AFTER signature verification passed. Diagnosed live: PostgREST
-- 400 code 23514, constraint resend_delivery_events_event_check.
--
-- Fix: drop the original column CHECK and re-add it including 'received'.
-- The 'received' event is written ONLY by the verified-signed webhook under
-- the service_role key (no anon/authenticated insert path) — the event family
-- now mirrors the Resend webhook docs exactly.

BEGIN;

alter table public.resend_delivery_events
  drop constraint if exists resend_delivery_events_event_check;

alter table public.resend_delivery_events
  add constraint resend_delivery_events_event_check
  check (event in ('sent','delivered','delivery_delayed','complained','bounced','opened','clicked','received'));

-- Verification notice
do $$ declare
  cons text;
  src  text;
begin
  select pg_get_constraintdef(c.oid) into src
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'resend_delivery_events'
    and c.conname = 'resend_delivery_events_event_check';
  if src is null or src !~ 'received' then
    raise exception 'migration 255 FAILED: received missing from resend_delivery_events_event_check';
  end if;
  raise notice '255_resend_delivery_events_received: event check now allows received';
end $$;

COMMIT;