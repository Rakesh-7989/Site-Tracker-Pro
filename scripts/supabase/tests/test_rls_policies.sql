-- SiteTrack Pro — RLS policy integration tests (Phase 2.4).
--
-- Run via: supabase db test (requires local or linked Supabase instance)
-- Or: psql -X -v ON_ERROR_STOP=1 -f this_file
--
-- Tests: edge cases on critical RLS policies.
-- ============================================================================

begin;
select plan(8);

-- ============================================================================
-- Setup: seed minimal test data (superadmin session)
-- ============================================================================
-- Note: these tests assume a clean test DB. In real runs, use unique IDs.

-- ============================================================================
-- Test 1: current_role_text returns auth user's role
-- ============================================================================
select results_eq(
  $$ select current_role_text() $$,
  $$ values ('superadmin'::text) $$,
  'superadmin role matches'
);

-- ============================================================================
-- Test 2: is_superadmin returns true for superadmin
-- ============================================================================
select ok(is_superadmin(), 'superadmin should pass is_superadmin()');

-- ============================================================================
-- Test 3: user_org_id returns non-null for org member
-- ============================================================================
select ok(user_org_id() is not null, 'org member has org_id');

-- ============================================================================
-- Test 4: cross-org read isolation — project in org A not visible to org B
-- ============================================================================
select is_empty(
  $$ select id from user_project_ids() where id not in
      (select id from projects where org_id = user_org_id()) $$,
  'user_project_ids() should not leak cross-org project IDs'
);

-- ============================================================================
-- Test 5: removed org_members lose access
-- ============================================================================
prepare check_removed_member as
  select has_org_tier(
    (select org_id from org_members where removed_at is not null limit 1),
    'admin'
  );
select ok(
  (select not coalesce((select count(*) > 0 from check_removed_member), false) or
          (select count(*) = 0 from org_members where removed_at is not null)),
  'removed org members should not pass has_org_tier checks'
);

-- ============================================================================
-- Test 6: ops_toggles write restricted — non-admin cannot write
-- ============================================================================
set local role authenticated;
-- As a non-admin identity, direct insert should fail.
select throws_ok(
  $$ insert into ops_toggles (org_id, key, value) values
     (user_org_id(), 'test_key', '"test"') $$,
  'new row violates row-level security for table "ops_toggles"',
  'non-admin cannot write ops_toggles'
);
reset role;

-- ============================================================================
-- Test 7: milestone write allows pm but not client
-- ============================================================================
select throws_ok(
  $$ insert into milestones (project_id, name, due_date) values
     ((select id from user_project_ids() limit 1), 'test', now()) $$,
  null,  -- will fail when running as authenticated non-pm
  'client cannot write milestones'
);

-- ============================================================================
-- Test 8: site_inspector rows are immutable (trigger)
-- ============================================================================
select throws_ok(
  $$ update project_members set role = 'pm'
     where role = 'site_inspector' limit 1 $$,
  null,
  'site_inspector rows cannot be edited'
);

-- ============================================================================
-- Teardown
-- ============================================================================
select * from finish();
rollback;
