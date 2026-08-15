-- SiteTrack Pro — P-E signup payment + temp-password substrate.
-- Run AFTER 194_org_billing_period.sql. Idempotent.
--
-- Context (P-E deep-dive, Lead decision):
--   * The Cashfree signup payment link (cashfree-checkout) is PAID via the
--     platform's own Cashfree account, but the cashfree-webhook Edge Function
--     only understands SUBSCRIPTION lifecycle events (event.data.subscription.
--     subscription_id). Cashfree POSTs payment-link events with type
--     "PAYMENT_LINK_EVENT" + data.link_id / link_status — the webhook 400s
--     ("No subscription_id in event"), so signups are NEVER marked paid and
--     billing_history is never written. Migration 104's staff-only
--     mark_signup_paid RPC is not a gateway path.
--   * This migration adds the two columns P-E needs:
--       1. signup_requests.paid_amount_paise — the actual gateway charge the
--          webhook records (so review_signup_request can seed billing_history
--          with the true amount when the org is created).
--       2. profiles.must_change_password — the forced-password-change flag for
--          temp-password users (approved signup applicants sign in with a
--          generated password and must pick their own on first login).
--   * clear_my_must_change_password() RPC lets the signed-in user clear their
--     own flag after a successful password change (SECURITY DEFINER, self-only
--     — mirrors complete_my_profile).

do $$
begin
  -- Gateway-paid amount (paise) recorded by cashfree-webhook.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'signup_requests'
      and column_name = 'paid_amount_paise'
  ) then
    alter table public.signup_requests add column paid_amount_paise bigint;
    raise notice '195_signup_payment_password: added signup_requests.paid_amount_paise';
  end if;

  -- Forced-password-change flag for temp-password users (P-E).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'must_change_password'
  ) then
    alter table public.profiles add column must_change_password boolean not null default false;
    raise notice '195_signup_payment_password: added profiles.must_change_password';
  end if;
end $$;

-- Self-service: the signed-in user clears their own forced-password flag once
-- they have changed their password (auth.updatePassword already ran client-side
-- before this RPC; the flag is the "you must change it" gate only).
create or replace function public.clear_my_must_change_password()
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  update public.profiles set must_change_password = false
  where id = auth.uid();
  return found;
end $$;

grant execute on function public.clear_my_must_change_password() to authenticated;

do $$ declare n int; m int; begin
  select count(*) into n from public.signup_requests where paid_amount_paise is not null;
  select count(*) into m from public.profiles where must_change_password;
  raise notice '195_signup_payment_password: % signup(s) with a gateway amount, % profile(s) flagged must-change.', n, m;
end $$;
