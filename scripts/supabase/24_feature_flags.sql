-- SiteTrack Pro — Feature flag storage (platform + org + ops toggles).
-- Run AFTER 23_branding.sql. Idempotent.
--
-- Mirrors src/lib/orgFeatureFlags.js + INIT_PLATFORM_FEATURE_FLAGS +
-- INIT_ORG_FEATURE_FLAGS + INIT_OPS_TOGGLES seeds.
--
-- Resolution order at runtime (in lib/orgFeatureFlags.js):
--   platform_feature_flags.enabled  (kill switch — Super Admin)
--   org_feature_flags.enabled       (per-org override — Org Admin)
--   FEATURE_CATALOG default         (in code)
--   AND-ed with plan gate

-- ============================================================================
-- 1. Platform-level kill switches
-- ============================================================================
create table if not exists platform_feature_flags (
  key         text primary key,
  enabled     boolean default true,
  rollout     numeric(5,2) default 100 check (rollout between 0 and 100),
  note        text,
  -- Bug-fix Session 27.1: was `references admin_users(id)` but admin_users is
  -- a localStorage-only seed (INIT_ADMIN_USERS) — no Postgres table. The
  -- platform-admin profile lives in profiles with role='superadmin'.
  updated_by  uuid references profiles(id),
  updated_at  timestamptz default now()
);

alter table platform_feature_flags enable row level security;
create policy pff_read on platform_feature_flags for select using (true);
create policy pff_write on platform_feature_flags for all
  using (is_superadmin())
  with check (is_superadmin());

-- ============================================================================
-- 2. Per-org overrides
-- ============================================================================
create table if not exists org_feature_flags (
  org_id      uuid not null references organizations(id) on delete cascade,
  key         text not null,
  enabled     boolean not null,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz default now(),
  primary key (org_id, key)
);
create index if not exists idx_off_org on org_feature_flags(org_id);

alter table org_feature_flags enable row level security;
create policy off_read on org_feature_flags for select
  using (is_superadmin() or org_id = user_org_id());
create policy off_write on org_feature_flags for all
  using (is_superadmin() or (is_orgadmin() and org_id = user_org_id()))
  with check (is_superadmin() or (is_orgadmin() and org_id = user_org_id()));

-- ============================================================================
-- 3. Per-org operational state (onboarding flags, kiosk mode prefs, etc.)
-- ============================================================================
create table if not exists ops_toggles (
  org_id      uuid not null references organizations(id) on delete cascade,
  key         text not null,
  value       jsonb not null default 'true'::jsonb,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz default now(),
  primary key (org_id, key)
);
create index if not exists idx_ops_toggles_org on ops_toggles(org_id);

alter table ops_toggles enable row level security;
create policy ops_read on ops_toggles for select
  using (is_superadmin() or org_id = user_org_id());
create policy ops_write on ops_toggles for all
  using (is_superadmin() or (is_orgadmin() and org_id = user_org_id())
         or (org_id = user_org_id()))                       -- any org member can flip simple state keys
  with check (is_superadmin() or org_id = user_org_id());

do $$ declare a int; b int; c int; begin
  select count(*) into a from platform_feature_flags;
  select count(*) into b from org_feature_flags;
  select count(*) into c from ops_toggles;
  raise notice '24_feature_flags: platform=%, org=%, ops=%', a, b, c;
end $$;
