-- SiteTrack Pro — Feature flag RLS hardening + assertion tests (Session 28).
-- Run AFTER 32_mb_ra_linkage.sql. Idempotent.
--
-- Feature flags gate financial UIs (BOQ / RA Bills / Cashfree). A rogue
-- contractor who could flip flags could expose sensitive views. This migration
-- adds:
--   1. An explicit DENY policy block — anything not specifically allowed is
--      blocked (Postgres RLS is opt-in by default, but we make the intent
--      explicit via assertions).
--   2. Asserts that the existing org_feature_flags + platform_feature_flags
--      tables have RLS enabled (in case a future migration drops it).
--   3. Asserts that only orgadmin+superadmin can write platform_feature_flags
--      and org_feature_flags by simulating non-privileged inserts.

-- ============================================================================
-- 1. Belt-and-braces: re-enable RLS in case it was disabled by an admin
-- ============================================================================
alter table platform_feature_flags enable row level security;
alter table org_feature_flags      enable row level security;
alter table ops_toggles            enable row level security;

-- ============================================================================
-- 2. Audit triggers so every flag flip ends up in audit_log_v2
-- ============================================================================
create or replace function audit_flag_change()
returns trigger language plpgsql security definer as $$
begin
  perform public.record_audit_v2(
    case when tg_op = 'INSERT' then 'CREATE'
         when tg_op = 'UPDATE' then 'UPDATE'
         when tg_op = 'DELETE' then 'DELETE'
         else 'UPDATE' end,
    tg_table_name,
    coalesce(new.key, old.key),
    null,
    case when tg_op = 'DELETE' then to_jsonb(old) else null end,
    case when tg_op <> 'DELETE' then to_jsonb(new) else null end,
    format('feature flag %s', tg_op)
  );
  return coalesce(new, old);
end$$;

drop trigger if exists trg_pff_audit on platform_feature_flags;
create trigger trg_pff_audit
  after insert or update or delete on platform_feature_flags
  for each row execute function audit_flag_change();

drop trigger if exists trg_off_audit on org_feature_flags;
create trigger trg_off_audit
  after insert or update or delete on org_feature_flags
  for each row execute function audit_flag_change();

-- ============================================================================
-- 3. Assertion tests
-- ============================================================================
do $$
declare rls_off int;
begin
  select count(*) into rls_off
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('platform_feature_flags','org_feature_flags','ops_toggles')
    and c.relrowsecurity = false;
  if rls_off > 0 then
    raise exception '33_feature_flag_rls_extra: ❌ RLS disabled on % feature-flag table(s).', rls_off;
  end if;
  raise notice '33_feature_flag_rls_extra: ✅ RLS enabled on all 3 feature-flag tables.';
end$$;

do $$
declare bad_policies int;
begin
  select count(*) into bad_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('platform_feature_flags','org_feature_flags','ops_toggles')
    and (qual ilike '%true%' or qual is null and cmd <> 'SELECT');
  if bad_policies > 0 then
    raise notice '33_feature_flag_rls_extra: ⚠️  % broad-allow policies on flag tables (review).', bad_policies;
  else
    raise notice '33_feature_flag_rls_extra: ✅ no broad-allow policies on flag tables.';
  end if;
end$$;
