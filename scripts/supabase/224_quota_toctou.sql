-- SiteTrack Pro — DB-001: quota enforcement transaction-safe (TOCTOU fix).
--
-- Migrations 35 + 97 enforce plan quotas with BEFORE INSERT row triggers that
-- do a check-then-act:
--     cap := coalesce(plan_cap(projects_max), plan_cap(projects_ceiling));
--     select count(*) into cnt from projects where org_id = ... and archived_at is null;
--     if cnt >= cap then raise 'plan-limit-exceeded';
--
-- Under Postgres READ COMMITTED, two concurrent INSERTs for the SAME org both
-- read the same pre-insert count (neither sees the other's uncommitted row),
-- both pass the check, and both commit → the org ends up over its cap. Classic
-- TOCTOU / check-then-act race (DB-001).
--
-- Fix: serialize per org + resource with a TRANSACTION-scoped advisory lock
-- acquired BEFORE the count. `pg_advisory_xact_lock` is held until the
-- transaction ends (commit/rollback), so a concurrent insert for the same org
-- blocks on the lock, then re-counts after the first transaction resolves and
-- correctly rejects. A per-resource key means project creation and member
-- invites never serialize against each other.
--
-- Key is exposed as `quota_lock_key(org_id, resource)` so the live RLS matrix
-- (`scripts/test-quota-toctou.mjs`) can deterministically prove the trigger
-- blocks on exactly the same lock.
--
-- Idempotent: CREATE OR REPLACE keeps trigger OIDs attached. Runs after
-- 97_project_ceiling.sql (the coalesce cap source). No schema change.

BEGIN;

-- Deterministic lock key (bigint) for an org+resource quota. The literal
-- prefix + resource + org id must stay byte-identical for the trigger and the
-- test to agree on the same advisory lock.
create or replace function public.quota_lock_key(p_org_id uuid, p_resource text)
returns bigint
language sql
immutable
as $$
  select hashtextextended('stp:quota:' || p_resource || ':' || p_org_id::text, 0);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Project count limit — transaction-safe
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.check_project_limit() returns trigger
language plpgsql as $$
declare cap int; cnt int;
begin
  -- Hard max = explicit projects_max, else the safety ceiling.
  cap := coalesce(public.plan_cap(new.org_id, 'projects_max'),
                  public.plan_cap(new.org_id, 'projects_ceiling'));
  if cap is null then return new; end if;          -- truly unlimited
  -- DB-001: serialize per-org project inserts before counting (no race).
  perform pg_advisory_xact_lock(public.quota_lock_key(new.org_id, 'projects'));
  select count(*) into cnt from public.projects
    where org_id = new.org_id and archived_at is null;
  if cnt >= cap then
    raise exception 'plan-limit-exceeded: % project(s) of %', cnt, cap
      using errcode = 'P0001',
            hint = format('Upgrade your plan in Org Admin → Billing to add more projects.');
  end if;
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- User (org_members) count limit — transaction-safe
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.check_user_limit() returns trigger
language plpgsql as $$
declare cap int; cnt int;
begin
  cap := public.plan_cap(new.org_id, 'users_max');
  if cap is null then return new; end if;
  -- DB-001: serialize per-org member invites before counting (no race).
  perform pg_advisory_xact_lock(public.quota_lock_key(new.org_id, 'users'));
  select count(*) into cnt from public.org_members where org_id = new.org_id;
  if cnt >= cap then
    raise exception 'plan-limit-exceeded: % member(s) of %', cnt, cap
      using errcode = 'P0001',
            hint = format('Upgrade your plan in Org Admin → Billing to add more members.');
  end if;
  return new;
end;
$$;

DO $$
DECLARE
  v_proj text; v_user text; v_key text; v_trg_proj record; v_trg_user record;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_proj FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'check_project_limit';
  SELECT pg_get_functiondef(p.oid) INTO v_user FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'check_user_limit';
  SELECT pg_get_functiondef(p.oid) INTO v_key FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'quota_lock_key';
  IF v_proj IS NULL OR v_user IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'migration 224 FAILED: quota functions missing';
  END IF;
  IF position('pg_advisory_xact_lock' in v_proj) = 0 OR position('quota_lock_key' in v_proj) = 0 THEN
    RAISE EXCEPTION 'migration 224 FAILED: check_project_limit not serialized';
  END IF;
  IF position('pg_advisory_xact_lock' in v_user) = 0 OR position('quota_lock_key' in v_user) = 0 THEN
    RAISE EXCEPTION 'migration 224 FAILED: check_user_limit not serialized';
  END IF;
  SELECT * INTO v_trg_proj FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass AND tgname = 'trg_check_project_limit';
  SELECT * INTO v_trg_user FROM pg_trigger
    WHERE tgrelid = 'public.org_members'::regclass AND tgname = 'trg_check_user_limit';
  IF v_trg_proj IS NULL OR v_trg_user IS NULL THEN
    RAISE EXCEPTION 'migration 224 FAILED: quota triggers missing';
  END IF;
  RAISE NOTICE 'migration 224 ok: quota checks serialized per-org (advisory locks)';
END $$;

COMMIT;
