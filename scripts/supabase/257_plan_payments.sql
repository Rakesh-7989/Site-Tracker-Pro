-- SiteTrack Pro — paid plan self-serve activation substrate.
--
-- Until now only the free trial was self-serve: existing-org upgrades were
-- staff-handled tickets (plan_upgrade_requests, migration 103) with no money
-- moving and no activation, and the Cashfree subscription EF had no UI caller.
-- This migration adds the money table for one-time Cashfree plan payments
-- (created by the cashfree-plan-link EF, settled by cashfree-webhook):
--
--   plan_payments: one row per Cashfree payment-link mint for an org's plan
--   purchase/renewal. The webhook marks it paid and then activates
--   (organizations.plan + subscriptions + billing_history) under service_role,
--   which the 254 plan-guard explicitly allows (auth.uid() IS NULL bypass).
--
-- Also extends payments.method with the gateway values so the
-- razorpay-webhook can post real settlement rows instead of only flipping
-- razorpay_status (which left invoices reading unpaid everywhere).
-- Idempotent. RLS: tenant read, service_role-only writes.

BEGIN;

-- ── 1. plan_payments ─────────────────────────────────────────────────────
create table if not exists public.plan_payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  plan          text not null check (plan in ('basic', 'pro', 'business')),
  period        text not null check (period in ('monthly', 'annual')),
  amount_paise  bigint not null check (amount_paise > 0),
  link_id       text not null unique,
  status        text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'cancelled')),
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_plan_payments_org on public.plan_payments(org_id);
create index if not exists idx_plan_payments_link on public.plan_payments(link_id);

alter table public.plan_payments enable row level security;

-- Read: members of the org (so the billing page can show pending state).
drop policy if exists plan_payments_read on public.plan_payments;
create policy plan_payments_read on public.plan_payments for select
  using (public.is_superadmin() or org_id = any(public.user_org_ids()));

-- Writes come from the plan-link EF + Cashfree webhook (service_role) —
-- direct writes are forbidden for tenant users (mirrors billing_history 25).
drop policy if exists plan_payments_no_write on public.plan_payments;
revoke insert, update, delete on public.plan_payments from authenticated;
revoke all on public.plan_payments from anon;

-- ── 2. payments.method: admit gateway settlement values ──────────────────
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('bank', 'cash', 'upi', 'cheque', 'other', 'razorpay', 'cashfree'));

-- ── 3. Self-verify ───────────────────────────────────────────────────────
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.plan_payments;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_method_check'
  ) THEN
    RAISE EXCEPTION 'migration 257 FAILED: payments_method_check missing';
  END IF;
  RAISE NOTICE 'migration 257 ok: plan_payments_rows=% + gateway methods live', n;
END $$;

COMMIT;
