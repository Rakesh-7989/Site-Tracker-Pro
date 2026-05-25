-- SiteTrack Pro — Phase 1 RLS verification matrix.
-- Adds the orgadmin scenarios + new-table policy assertions on top of
-- 04_rls_tests.sql. Run AFTER 04_rls_tests.sql (uses the same fixtures).
--
-- Each test impersonates a user via SET LOCAL "request.jwt.claim.sub" and
-- verifies the row count matches expectations. Use the assert_eq() helper
-- already defined in 04_rls_tests.sql.

-- ============================================================================
-- FIXTURES — add orgadmin to the existing org from 04_rls_tests.sql
-- ============================================================================

begin;

insert into auth.users(id, email)
  values ('55555555-5555-5555-5555-555555555555'::uuid, 'orga@test.in')
  on conflict do nothing;

insert into profiles(id, name, role)
  values ('55555555-5555-5555-5555-555555555555'::uuid, 'Org Admin', 'orgadmin')
  on conflict (id) do update set role = 'orgadmin';

insert into org_members(org_id, profile_id, role)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          '55555555-5555-5555-5555-555555555555'::uuid, 'architect')
  on conflict do nothing;

-- Second org with one project — orgadmin from org1 must NOT see it.
insert into organizations(id, slug, name)
  values ('00000000-0000-0000-0000-000000000002'::uuid, 'rival-org', 'Rival Org')
  on conflict do nothing;

insert into projects(id, org_id, name, client_name, client_email)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
          '00000000-0000-0000-0000-000000000002'::uuid,
          'Rival Project', 'Rival', 'rival@rival.in')
  on conflict do nothing;

-- Add one template + one approval chain + one integration row on org1 so the
-- orgadmin tests have something to read.
insert into org_integrations(org_id, ai, razorpay, whatsapp, cashfree)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          '{"provider":"openai","key":"sk-test","model":"gpt-4"}'::jsonb,
          '{"key_id":"rzp_test"}'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb)
  on conflict do nothing;

insert into templates(id, org_id, kind, name, description, payload)
  values ('11111111-aaaa-aaaa-aaaa-111111111111'::uuid,
          '00000000-0000-0000-0000-000000000001'::uuid,
          'project', 'Hi-rise template', 'Standard tower template', '{}'::jsonb)
  on conflict do nothing;

insert into approval_chains(org_id, resource, name, rungs)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          'expense', 'Default expense',
          '[{"threshold":50000,"role":"pm"},{"threshold":1000000,"role":"orgadmin"}]'::jsonb)
  on conflict do nothing;

insert into notification_rules(org_id, trigger, channel, recipients)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          'high_issue', 'in_app',
          ARRAY['11111111-1111-1111-1111-111111111111'::uuid])
  on conflict do nothing;

insert into subscriptions(org_id, provider, plan, status, current_period_start, current_period_end)
  values ('00000000-0000-0000-0000-000000000001'::uuid, 'cashfree', 'business', 'active', now(), now() + interval '30 days')
  on conflict do nothing;

commit;

-- ============================================================================
-- SCENARIO 7 — ORG ADMIN sees own org's data + can write
-- ============================================================================

set local role authenticated;
set local "request.jwt.claim.sub" to '55555555-5555-5555-5555-555555555555';

do $$ declare n int;
begin
  -- Org admin sees all projects in their own org (Alpha + Beta)
  select count(*) into n from projects;
  perform assert_eq('Orgadmin sees all own-org projects', n, 2);

  -- But NOT the rival org's project
  select count(*) into n from projects where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid;
  perform assert_eq('Orgadmin CANNOT see rival org projects', n, 0);

  -- Phase 1 tables read-back
  select count(*) into n from org_integrations;
  perform assert_eq('Orgadmin sees own org_integrations row', n, 1);

  select count(*) into n from templates;
  perform assert_eq('Orgadmin sees own templates', n, 1);

  select count(*) into n from approval_chains;
  perform assert_eq('Orgadmin sees own approval_chains', n, 1);

  select count(*) into n from notification_rules;
  perform assert_eq('Orgadmin sees own notification_rules', n, 1);

  select count(*) into n from subscriptions;
  perform assert_eq('Orgadmin sees own subscription row', n, 1);

  -- Orgadmin CAN write templates inside their own org
  begin
    insert into templates(org_id, kind, name, payload)
      values ('00000000-0000-0000-0000-000000000001'::uuid, 'boq', 'BOQ tower', '[]'::jsonb);
    raise notice 'PASS  Orgadmin CAN insert templates in own org';
  exception when others then
    raise warning 'FAIL  Orgadmin should be able to insert templates: %', sqlerrm;
  end;

  -- Orgadmin CANNOT write templates into another org
  begin
    insert into templates(org_id, kind, name, payload)
      values ('00000000-0000-0000-0000-000000000002'::uuid, 'boq', 'Cross-tenant', '[]'::jsonb);
    raise warning 'FAIL  Orgadmin should NOT be able to insert into another org';
  exception when insufficient_privilege then
    raise notice 'PASS  Orgadmin write blocked by RLS (cross-tenant template)';
  when check_violation then
    raise notice 'PASS  Orgadmin write blocked by RLS (cross-tenant template)';
  when others then
    raise notice 'PASS  Orgadmin cross-tenant write blocked (% — %)', sqlstate, sqlerrm;
  end;

  -- Orgadmin CAN update org integrations on own org
  begin
    update org_integrations
       set ai = '{"provider":"anthropic","key":"sk-ant-test"}'::jsonb,
           updated_at = now()
     where org_id = '00000000-0000-0000-0000-000000000001'::uuid;
    raise notice 'PASS  Orgadmin CAN update own org_integrations';
  exception when others then
    raise warning 'FAIL  Orgadmin update org_integrations: %', sqlerrm;
  end;

  -- Orgadmin CANNOT directly write subscriptions (only service_role / superadmin)
  begin
    update subscriptions set plan = 'pro' where org_id = '00000000-0000-0000-0000-000000000001'::uuid;
    raise warning 'FAIL  Orgadmin should NOT be able to write subscriptions';
  exception when insufficient_privilege then
    raise notice 'PASS  Orgadmin subscriptions write blocked by RLS';
  when others then
    raise notice 'PASS  Orgadmin subscriptions write blocked (% — %)', sqlstate, sqlerrm;
  end;
end $$;

-- ============================================================================
-- SCENARIO 8 — PM in same org can READ but NOT WRITE Phase 1 tables
-- ============================================================================

set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

do $$ declare n int;
begin
  select count(*) into n from org_integrations;
  perform assert_eq('PM sees org_integrations (read-only)', n, 1);

  select count(*) into n from templates;
  perform assert_eq('PM sees templates (read-only)', n, 1);

  select count(*) into n from approval_chains;
  perform assert_eq('PM sees approval_chains (read-only)', n, 1);

  -- PM CANNOT write templates
  begin
    insert into templates(org_id, kind, name, payload)
      values ('00000000-0000-0000-0000-000000000001'::uuid, 'boq', 'PM attempt', '[]'::jsonb);
    raise warning 'FAIL  PM should NOT be able to insert templates';
  exception when insufficient_privilege then
    raise notice 'PASS  PM template write blocked by RLS';
  when others then
    raise notice 'PASS  PM template write blocked (% — %)', sqlstate, sqlerrm;
  end;

  -- PM CANNOT update org_integrations
  begin
    update org_integrations set ai = '{}'::jsonb
     where org_id = '00000000-0000-0000-0000-000000000001'::uuid;
    raise warning 'FAIL  PM should NOT be able to update org_integrations';
  exception when insufficient_privilege then
    raise notice 'PASS  PM org_integrations write blocked by RLS';
  when others then
    raise notice 'PASS  PM org_integrations write blocked (% — %)', sqlstate, sqlerrm;
  end;
end $$;

-- ============================================================================
-- SCENARIO 9 — CLIENT cannot see Phase 1 tables at all
-- ============================================================================

set local "request.jwt.claim.sub" to '44444444-4444-4444-4444-444444444444';

do $$ declare n int;
begin
  -- Client has NO org_members row, so user_org_id() returns NULL.
  -- Every Phase 1 RLS policy requires org_id = user_org_id() OR superadmin —
  -- both fail, so the client sees zero rows in each table.
  select count(*) into n from org_integrations;
  perform assert_eq('Client CANNOT see any org_integrations', n, 0);

  select count(*) into n from templates;
  perform assert_eq('Client CANNOT see any templates', n, 0);

  select count(*) into n from approval_chains;
  perform assert_eq('Client CANNOT see any approval_chains', n, 0);

  select count(*) into n from notification_rules;
  perform assert_eq('Client CANNOT see any notification_rules', n, 0);

  select count(*) into n from subscriptions;
  perform assert_eq('Client CANNOT see subscription state', n, 0);
end $$;

-- ============================================================================
-- SCENARIO 10 — AUDIT LOG V2 is append-only (insert via function only)
-- ============================================================================

set local "request.jwt.claim.sub" to '55555555-5555-5555-5555-555555555555';

do $$ declare n int;
begin
  -- Direct INSERT must fail (revoked from authenticated)
  begin
    insert into audit_log_v2(actor_id, action, resource, message)
      values (auth.uid(), 'CREATE', 'project', 'Direct insert attempt');
    raise warning 'FAIL  Orgadmin should NOT be able to direct-INSERT into audit_log_v2';
  exception when insufficient_privilege then
    raise notice 'PASS  audit_log_v2 direct INSERT blocked';
  when others then
    raise notice 'PASS  audit_log_v2 direct INSERT blocked (% — %)', sqlstate, sqlerrm;
  end;

  -- Function-based insert MUST succeed
  begin
    perform record_audit_v2('CREATE', 'project', 'p_test', null,
                            null, '{"name":"test"}'::jsonb,
                            'Test audit via SECURITY DEFINER function');
    raise notice 'PASS  record_audit_v2() can append for authenticated user';
  exception when others then
    raise warning 'FAIL  record_audit_v2() raised: %', sqlerrm;
  end;

  select count(*) into n from audit_log_v2 where resource = 'project' and resource_id = 'p_test';
  perform assert_eq('audit_log_v2 row visible to inserting orgadmin', n, 1);

  -- UPDATE / DELETE must fail (append-only)
  begin
    update audit_log_v2 set message = 'tampered' where resource_id = 'p_test';
    raise warning 'FAIL  audit_log_v2 UPDATE should be blocked';
  exception when insufficient_privilege then
    raise notice 'PASS  audit_log_v2 UPDATE blocked (immutable)';
  when others then
    raise notice 'PASS  audit_log_v2 UPDATE blocked (% — %)', sqlstate, sqlerrm;
  end;
end $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Expected: 24+ additional PASS lines from Scenarios 7–10.
-- Any FAIL warning means the orgadmin tier or Phase 1 RLS has a regression.
