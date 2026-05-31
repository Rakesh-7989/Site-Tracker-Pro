-- SiteTrack Pro — Phase 2 migration assertions (09 – 28).
-- Run AFTER all phase 2 files. Reports pass/fail for each new table + index.
-- Non-fatal — failures raise NOTICE so the rest of the test run still completes.

do $$
declare
  expected_tables text[] := array[
    -- 09
    'blocks','floors','units',
    -- 10
    'measurement_book',
    -- 11
    'material_prices',
    -- 12
    'delegations',
    -- 13
    'daily_snapshots',
    -- 14
    'compliance',
    -- 15
    'forecast',
    -- 16
    'rfi','change_orders','inspections','safety',
    -- 17
    'punch','submittals','permits',
    -- 18
    'checklist_items',
    -- 19
    'messages','comments','notifications',
    -- 20
    'teams','attendance','worklogs',
    -- 21
    'equipment','diary','expenses',
    -- 22
    'estimate',
    -- 23
    'branding',
    -- 24
    'platform_feature_flags','org_feature_flags','ops_toggles',
    -- 25
    'billing_history','usage_metrics',
    -- 26
    'share_tokens',
    -- 27
    'audit_anchors',
    -- 28
    'plans'
  ];
  t text;
  missing int := 0;
  present int := 0;
begin
  foreach t in array expected_tables loop
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) then
      present := present + 1;
    else
      missing := missing + 1;
      raise notice '29_phase2_tests: MISSING table public.%', t;
    end if;
  end loop;
  raise notice '29_phase2_tests: tables present=%, missing=% (expected=%)',
    present, missing, array_length(expected_tables, 1);
  if missing > 0 then
    raise notice '29_phase2_tests: ❌ % table(s) missing — run 09-28 in order.', missing;
  else
    raise notice '29_phase2_tests: ✅ all phase-2 tables present.';
  end if;
end $$;

-- RLS assertion
do $$
declare
  expected_tables text[] := array[
    'blocks','floors','units','measurement_book','material_prices','delegations',
    'daily_snapshots','compliance','forecast','rfi','change_orders','inspections',
    'safety','punch','submittals','permits','checklist_items','messages','comments',
    'notifications','teams','attendance','worklogs','equipment','diary','expenses',
    'estimate','branding','platform_feature_flags','org_feature_flags','ops_toggles',
    'billing_history','usage_metrics','share_tokens','audit_anchors','plans'
  ];
  t text;
  rls_off int := 0;
begin
  foreach t in array expected_tables loop
    if exists (select 1 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = t and c.relrowsecurity = false) then
      rls_off := rls_off + 1;
      raise notice '29_phase2_tests: ⚠️  RLS disabled on public.%', t;
    end if;
  end loop;
  if rls_off = 0 then
    raise notice '29_phase2_tests: ✅ RLS enabled on every phase-2 table.';
  end if;
end $$;

-- Append-only assertion — these tables should have INSERT/UPDATE/DELETE
-- restrictions to enforce immutability.
do $$
declare
  immutable_tables text[] := array[
    'daily_snapshots',     -- frozen EOD
    'forecast',            -- snapshot of model output
    'messages',            -- comms are immutable after send
    'billing_history',     -- gateway events
    'usage_metrics'        -- cron-only
  ];
  t text;
  perms int;
begin
  foreach t in array immutable_tables loop
    select count(*) into perms
    from information_schema.table_privileges
    where table_schema = 'public' and table_name = t
      and grantee = 'authenticated' and privilege_type in ('UPDATE','DELETE');
    if perms > 0 then
      raise notice '29_phase2_tests: ⚠️  % has UPDATE/DELETE for authenticated — expected revoked.', t;
    end if;
  end loop;
  raise notice '29_phase2_tests: immutability check complete.';
end $$;
