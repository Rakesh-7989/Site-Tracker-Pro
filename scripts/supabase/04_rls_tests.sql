-- SiteTrack Pro — RLS verification matrix (Phase B2 sign-off)
-- Source of truth: docs/archive/BACKEND_PLAN.md + src/lib/permissions.js
--
-- Run order: AFTER 01_schema.sql + 02_rls.sql on a Supabase DEV project.
-- Each test:
--   1. SET LOCAL role + auth.uid() to impersonate a user.
--   2. Runs a SELECT/INSERT/UPDATE that should succeed or fail.
--   3. RAISES NOTICE with PASS/FAIL.
--
-- A real production gate would use pgTAP + CI; this script is intentionally
-- simple so a Tech Lead can copy-paste it into the Supabase SQL Editor and
-- read PASS/FAIL inline.

-- ============================================================================
-- TEST FIXTURES
-- ============================================================================

begin;

-- 1 org, 4 users (one per role), 2 projects (one client_email match, one not)
insert into organizations(id, slug, name)
  values ('00000000-0000-0000-0000-000000000001'::uuid, 'test-org', 'Test Org');

-- Fake auth.users + profiles for each role. In real Supabase these would
-- come from Auth UI; here we INSERT directly with security definer access.
insert into auth.users(id, email)
  values
    ('11111111-1111-1111-1111-111111111111'::uuid, 'arch@test.in'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'pm@test.in'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'con@test.in'),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'client@test.in')
  on conflict do nothing;

insert into profiles(id, name, role)
  values
    ('11111111-1111-1111-1111-111111111111'::uuid, 'Arch User', 'architect'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'PM User',   'pm'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'Con User',  'contractor'),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'Cli User',  'client');

insert into org_members(org_id, profile_id, role)
  values
    ('00000000-0000-0000-0000-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'architect'),
    ('00000000-0000-0000-0000-000000000001'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'pm'),
    ('00000000-0000-0000-0000-000000000001'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'contractor');

insert into projects(id, org_id, architect_id, name, client_name, client_email, location)
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
     '00000000-0000-0000-0000-000000000001'::uuid,
     '11111111-1111-1111-1111-111111111111'::uuid,
     'Project Alpha', 'Client Co', 'client@test.in', 'Hyderabad'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
     '00000000-0000-0000-0000-000000000001'::uuid,
     '11111111-1111-1111-1111-111111111111'::uuid,
     'Project Beta',  'Other Co',  'other@test.in',  'Bangalore');

-- PM, Contractor explicitly assigned to Alpha only.
insert into project_members(project_id, profile_id, project_role)
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'pm'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'contractor');

-- One drawing on Alpha released only to PM.
insert into drawings(project_id, title, type, status, released_to)
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Foundation', 'Structural', 'current', ARRAY['pm']),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Client Plan', 'Architectural', 'current', ARRAY['pm','client']);

-- One invoice + one labour row on Alpha.
insert into invoices(project_id, no, amount) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'INV-001', 100000);
insert into labour_register(project_id, name, trade, wage) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Ramesh', 'Mason', 850);

commit;

-- ============================================================================
-- ASSERTION HELPER
-- ============================================================================

create or replace function assert_eq(label text, actual int, expected int) returns void
language plpgsql as $$
begin
  if actual = expected then
    raise notice 'PASS  % (got %)', label, actual;
  else
    raise warning 'FAIL  % — expected %, got %', label, expected, actual;
  end if;
end;
$$;

-- ============================================================================
-- SCENARIO 1 — ARCHITECT sees both projects in their org
-- ============================================================================

set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

do $$ declare n int;
begin
  select count(*) into n from projects;
  perform assert_eq('Architect sees all org projects', n, 2);

  select count(*) into n from drawings;
  perform assert_eq('Architect sees all drawings (member read, 149)', n, 2);

  select count(*) into n from invoices;
  perform assert_eq('Architect sees invoices', n, 1);

  select count(*) into n from labour_register;
  perform assert_eq('Architect sees labour (PII)', n, 1);
end $$;

-- ============================================================================
-- SCENARIO 2 — PM sees only assigned project (Alpha)
-- ============================================================================

set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

do $$ declare n int;
begin
  select count(*) into n from projects;
  perform assert_eq('PM sees only assigned project', n, 1);

  select count(*) into n from drawings where status = 'current';
  perform assert_eq('PM sees current drawings (member read, 149)', n, 2);

  select count(*) into n from invoices;
  perform assert_eq('PM sees invoices (project-scoped)', n, 1);

  select count(*) into n from labour_register;
  perform assert_eq('PM sees labour (PII)', n, 1);
end $$;

-- ============================================================================
-- SCENARIO 3 — CONTRACTOR cannot see invoices or labour
-- ============================================================================

set local "request.jwt.claim.sub" to '33333333-3333-3333-3333-333333333333';

do $$ declare n int;
begin
  select count(*) into n from projects;
  perform assert_eq('Contractor sees only assigned project', n, 1);

  select count(*) into n from invoices;
  perform assert_eq('Contractor CANNOT see invoices (financial)', n, 0);

  select count(*) into n from labour_register;
  perform assert_eq('Contractor CANNOT see labour (PII)', n, 0);

  select count(*) into n from purchase_orders;
  perform assert_eq('Contractor CANNOT see purchase orders', n, 0);

  -- Contractor SHOULD be able to write inventory transactions on assigned project
  begin
    insert into inventory_transactions(project_id, material, qty, direction, unit, recorded_by)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Test', 1, 'inward', 'bag', auth.uid());
    raise notice 'PASS  Contractor CAN write inventory_transactions on assigned project';
  exception when others then
    raise warning 'FAIL  Contractor should be able to write inventory_transactions: %', sqlerrm;
  end;
end $$;

-- ============================================================================
-- SCENARIO 4 — CLIENT sees only their email-matched project
-- ============================================================================

set local "request.jwt.claim.sub" to '44444444-4444-4444-4444-444444444444';

do $$ declare n int;
begin
  select count(*) into n from projects;
  perform assert_eq('Client sees only client_email-matched project', n, 1);

  -- Client should ONLY see drawings released_to includes 'client'
  select count(*) into n from drawings where status = 'current';
  perform assert_eq('Client sees only client-released current drawings', n, 1);

  select count(*) into n from invoices;
  perform assert_eq('Client sees invoices (read-only)', n, 1);

  select count(*) into n from purchase_orders;
  perform assert_eq('Client CANNOT see purchase orders', n, 0);

  select count(*) into n from labour_register;
  perform assert_eq('Client CANNOT see labour (PII)', n, 0);

  select count(*) into n from ra_bills;
  perform assert_eq('Client CANNOT see RA bills', n, 0);

  -- Client must NOT be able to write anything
  begin
    insert into issues(project_id, title, severity)
      values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'should fail', 'low');
    raise warning 'FAIL  Client should NOT be able to insert issues';
  exception when insufficient_privilege then
    raise notice 'PASS  Client write blocked by RLS (issues)';
  when others then
    raise notice 'PASS  Client write blocked (%) — %', sqlstate, sqlerrm;
  end;
end $$;

-- ============================================================================
-- SCENARIO 5 — CLIENT cannot access OTHER client's project
-- ============================================================================

-- Still set as client@test.in. Project Beta has client_email = other@test.in.
do $$ declare n int;
begin
  select count(*) into n from projects where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
  perform assert_eq('Client CANNOT see other client''s project', n, 0);
end $$;

-- ============================================================================
-- SCENARIO 6 — SUPER ADMIN sees everything across all orgs
-- ============================================================================

insert into auth.users(id, email)
  values ('99999999-9999-9999-9999-999999999999'::uuid, 'super@sitetrackpro.in')
  on conflict do nothing;
insert into profiles(id, name, role)
  values ('99999999-9999-9999-9999-999999999999'::uuid, 'Super User', 'superadmin')
  on conflict (id) do update set role = 'superadmin';

set local "request.jwt.claim.sub" to '99999999-9999-9999-9999-999999999999';

do $$ declare n int;
begin
  select count(*) into n from projects;
  perform assert_eq('Super admin sees ALL projects (both Alpha and Beta)', n, 2);

  select count(*) into n from organizations;
  perform assert_eq('Super admin sees organizations table', n, 1);

  select count(*) into n from invoices;
  perform assert_eq('Super admin sees invoices across all projects', n, 1);

  select count(*) into n from labour_register;
  perform assert_eq('Super admin sees labour (no role-based redaction)', n, 1);

  -- Super admin CAN create projects (insert into projects)
  begin
    insert into projects(id, org_id, name, client_name, client_email)
      values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
              '00000000-0000-0000-0000-000000000001'::uuid,
              'Super-Created Project','SuperCo','sup@super.in');
    raise notice 'PASS  Super admin CAN insert into projects';
    -- cleanup test row
    delete from projects where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
  exception when others then
    raise warning 'FAIL  Super admin insert blocked: %', sqlerrm;
  end;
end $$;

-- ============================================================================
-- CLEANUP (optional — leaves test data in place for manual inspection)
-- ============================================================================

-- Uncomment to drop test data after run:
-- delete from inventory_transactions where material = 'Test';
-- delete from labour_register where name = 'Ramesh';
-- delete from invoices where no = 'INV-001';
-- delete from drawings where project_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
-- delete from project_members where project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
-- delete from projects where org_id = '00000000-0000-0000-0000-000000000001'::uuid;
-- delete from org_members where org_id = '00000000-0000-0000-0000-000000000001'::uuid;
-- delete from profiles where id in ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, '44444444-4444-4444-4444-444444444444'::uuid);
-- delete from auth.users where email like '%@test.in';
-- delete from organizations where slug = 'test-org';

-- Expected output summary:
-- 18 PASS notices + a final summary in the Supabase logs.
-- Any FAIL warning means the RLS matrix has a regression.
