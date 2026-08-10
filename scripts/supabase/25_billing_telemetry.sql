-- SiteTrack Pro — Billing history + usage metrics.
-- Run AFTER 24_feature_flags.sql. Idempotent.
--
-- billing_history is the system of record for charged amounts (one row per
-- successful charge from Cashfree webhook). subscriptions tracks the *state*;
-- this tracks the *events*. usage_metrics is per-org per-day metering for
-- internal dashboards and overage billing.

-- ============================================================================
-- 1. Billing history
-- ============================================================================
create table if not exists billing_history (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  provider        text not null default 'cashfree' check (provider in ('cashfree','razorpay','manual','credit_note')),
  external_id     text,                                     -- gateway payment_id
  subscription_id text,                                     -- gateway subscription_id (denormalized)
  amount          bigint not null,                          -- paise
  currency        text default 'INR',
  gst             bigint default 0,
  status          text not null
    check (status in ('initiated','succeeded','failed','refunded','disputed','chargeback')),
  failure_reason  text,
  paid_at         timestamptz,
  invoice_url     text,
  receipt_no      text,
  payload         jsonb,                                    -- raw gateway event for forensic
  created_at      timestamptz default now()
);

create index if not exists idx_billing_org_paid on billing_history(org_id, paid_at desc);
create index if not exists idx_billing_status on billing_history(status);
create index if not exists idx_billing_external on billing_history(provider, external_id) where external_id is not null;

alter table billing_history enable row level security;

drop policy if exists billing_read on billing_history;
create policy billing_read on billing_history for select
  using (
    is_superadmin()
    or (org_id = user_org_id() and current_role_text() in ('orgadmin','org_finance','superadmin'))
  );

-- Inserts come from the Cashfree webhook EF (service_role) — direct insert
-- is forbidden for tenant users.
revoke insert, update, delete on billing_history from authenticated;

-- ============================================================================
-- 2. Usage metrics (per org per day)
-- ============================================================================
create table if not exists usage_metrics (
  org_id     uuid not null references organizations(id) on delete cascade,
  day        date not null,
  metric     text not null,                                 -- active_users / projects_open / api_calls / storage_mb
  value      bigint not null default 0,
  updated_at timestamptz default now(),
  primary key (org_id, day, metric)
);

create index if not exists idx_usage_day on usage_metrics(day);
create index if not exists idx_usage_org_metric on usage_metrics(org_id, metric, day desc);

alter table usage_metrics enable row level security;

drop policy if exists usage_read on usage_metrics;
create policy usage_read on usage_metrics for select
  using (is_superadmin() or org_id = user_org_id());

-- Cron / EF only.
revoke insert, update, delete on usage_metrics from authenticated;

do $$ declare a int; b int; begin
  select count(*) into a from billing_history;
  select count(*) into b from usage_metrics;
  raise notice '25_billing_telemetry: billing_history=%, usage_metrics=%', a, b;
end $$;