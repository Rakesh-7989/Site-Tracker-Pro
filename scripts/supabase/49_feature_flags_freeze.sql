-- Sprint 1 (Session 30.2) — Feature Freeze: staff_only_features table.
--
-- Companion to src/lib/featureFlags.js#STUB_VIEWS. The hard-coded JS set is
-- the runtime gate; this table is the AUDIT TRAIL — every entry has a
-- reason + the migration that flipped it staff-only + (when un-frozen) the
-- migration that flipped it back.
--
-- To FLIP a view back to public, write a follow-up migration that:
--   1. UPDATEs the row to set un_frozen_at + un_frozen_in_migration.
--   2. Removes the id from STUB_VIEWS in src/lib/featureFlags.js in the
--      same commit.
-- Don't delete rows — keep the history.
--
-- See docs/planning/FEATURE_FREEZE.md for the policy.

BEGIN;

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists staff_only_features (
  view_id text primary key,
  reason text not null,
  frozen_at timestamptz not null default now(),
  frozen_in_migration text not null,
  un_frozen_at timestamptz,
  un_frozen_in_migration text,
  un_frozen_reason text
);

comment on table staff_only_features is
  'Sprint 1 freeze list. JS source of truth is src/lib/featureFlags.js#STUB_VIEWS; this table is the audit trail.';

-- ── Profiles: is_staff flag ────────────────────────────────────────────────
-- Add column if not present. Default false. Superadmin grants it.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='is_staff'
  ) then
    alter table profiles add column is_staff boolean not null default false;
    comment on column profiles.is_staff is
      'Sprint 1 feature freeze — true means the user can see staff-only stubs (RERA/GSTN mocks). Granted only by superadmin.';
  end if;
end$$;

-- ── Seed: 15 frozen views, all from the Sprint 1 audit ─────────────────────
insert into staff_only_features (view_id, reason, frozen_in_migration) values
  ('compliance',         'RERA-TG / KA / MH edge functions return SCAFFOLD or fake "KA-${ts}" acks. No real filing.', '49_feature_flags_freeze.sql'),
  ('forecast',           'LLM cost forecast needs customer-supplied Anthropic/OpenAI key. Demo-only without it.',       '49_feature_flags_freeze.sql'),
  ('material-prices',    'All 6 commodity-vendor adapters are mocks. Numbers shown are not live data.',                 '49_feature_flags_freeze.sql'),
  ('ar-overlay',         'Camera+AR overlay flagged beta; needs real-device testing before pilot exposure.',            '49_feature_flags_freeze.sql'),
  ('kiosk-labour',       'Mantra MFS100 biometric driver + tablet provisioning not wired. Sprint 3 deliverable.',       '49_feature_flags_freeze.sql'),
  ('kiosk-site',         'Site-wall display config not validated on a real 65" panel.',                                 '49_feature_flags_freeze.sql'),
  ('delegations',        'Persistence broken — TABLE_BY_KEY map in lib/supabase.js does not include delegations key.',  '49_feature_flags_freeze.sql'),
  ('snapshot',           'Persistence broken — same TABLE_BY_KEY hole. localStorage-only.',                             '49_feature_flags_freeze.sql'),
  ('admin-audit-log',    'Audit log v2 reads use the broken persistence path; multi-tenant claim does not hold.',       '49_feature_flags_freeze.sql'),
  ('admin-branding',     'Branding overrides localStorage-only; logo+colour will not survive a browser switch.',        '49_feature_flags_freeze.sql'),
  ('org-templates',      'Persistence broken — templates do not sync across org members.',                              '49_feature_flags_freeze.sql'),
  ('org-approvals',      'Approval chains localStorage-only; two org admins see different chains.',                     '49_feature_flags_freeze.sql'),
  ('org-notifications',  'Notification rules localStorage-only.',                                                       '49_feature_flags_freeze.sql'),
  ('org-integrations',   'GSTN e-invoice integration defaults to mock mode (GSTN_USE_MOCK=true).',                      '49_feature_flags_freeze.sql'),
  ('org-features',       'Surfaces the broken flag cascade and exposes stubs implicitly.',                              '49_feature_flags_freeze.sql'),
  ('org-onboarding',     'Onboarding wizard writes flags through the broken persistence path.',                         '49_feature_flags_freeze.sql')
on conflict (view_id) do nothing;

-- ── RPC: list_staff_only_features() ────────────────────────────────────────
-- Read-only helper for ops + smoke test parity check between this table
-- and the JS STUB_VIEWS set. Returns ACTIVE freezes only.
create or replace function list_staff_only_features()
returns table (view_id text, reason text, frozen_at timestamptz)
language sql stable as $$
  select view_id, reason, frozen_at
  from staff_only_features
  where un_frozen_at is null
  order by view_id;
$$;

comment on function list_staff_only_features() is
  'Sprint 1: returns the active freeze list. Smoke test should compare this to STUB_VIEWS in src/lib/featureFlags.js.';

-- ── RLS — anyone authenticated can read (it's not sensitive), superadmin can write
alter table staff_only_features enable row level security;
drop policy if exists staff_only_read on staff_only_features;
create policy staff_only_read on staff_only_features
  for select to authenticated using (true);
drop policy if exists staff_only_write on staff_only_features;
create policy staff_only_write on staff_only_features
  for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'superadmin')
  );

COMMIT;
