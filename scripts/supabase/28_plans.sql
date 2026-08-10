-- SiteTrack Pro — Plans table (replaces hard-coded enum).
-- Run AFTER 27_audit_anchors.sql. Idempotent.
--
-- Seeds the 4 production plans (free / pro / business / custom). organizations.plan
-- is currently a CHECK-constrained text; this gives us a proper FK target so the
-- Pricing screen + Cashfree EF can lookup amount / feature_caps without hard-coding.

create table if not exists plans (
  id            text primary key
    check (id in ('basic','pro','business','custom','free','enterprise')),
  name          text not null,
  tagline       text,
  monthly_inr   bigint not null default 0,                  -- in paise
  yearly_inr    bigint,                                     -- in paise
  feature_caps  jsonb not null default '{}'::jsonb,         -- {projects_max, users_max, storage_gb, ...}
  features_md   text,                                       -- markdown bullet list for pricing card
  recommended   boolean default false,
  status        text default 'active' check (status in ('active','grandfathered','retired','hidden')),
  display_order int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_plans_status on plans(status, display_order);

-- ============================================================================
-- Seed the 4 current production plans (matches docs/PRICING.md).
-- on conflict do nothing — re-running this file never overwrites prices.
-- ============================================================================
insert into plans (id, name, tagline, monthly_inr, yearly_inr, feature_caps, recommended, display_order)
values
  ('basic',    'Free Trial',    '14 days, no card', 0,         0,
    '{"projects_max": 1, "users_max": 5, "storage_gb": 1}'::jsonb,    false, 0),
  ('pro',      'Pro',           'Solo builders',     99900,     999000,
    '{"projects_max": 5, "users_max": 25, "storage_gb": 20}'::jsonb,  false, 10),
  ('business', 'Business',      'Growing firms',     299900,    2999000,
    '{"projects_max": 25, "users_max": 100, "storage_gb": 200, "rera_filing": true}'::jsonb, true, 20),
  ('custom',   'Enterprise',    'Unlimited',         799900,    7999000,
    '{"projects_max": null, "users_max": null, "storage_gb": null, "sso": true, "audit_export": true}'::jsonb, false, 30)
on conflict (id) do nothing;

-- ============================================================================
-- Backfill: make organizations.plan an FK target for future enforcement.
-- We do NOT add the FK constraint yet (would break legacy rows) — done in a
-- later migration once we audit the existing plan strings.
-- ============================================================================
create index if not exists idx_organizations_plan on organizations(plan);

alter table plans enable row level security;
drop policy if exists plans_read on plans;
create policy plans_read on plans for select using (true);   -- public — pricing page reads
drop policy if exists plans_write on plans;
create policy plans_write on plans for all
  using (is_superadmin())
  with check (is_superadmin());

do $$ declare n int; begin
  select count(*) into n from plans where status = 'active';
  raise notice '28_plans: ready. % active plan(s).', n;
end $$;