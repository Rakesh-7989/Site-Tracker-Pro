-- SiteTrack Pro — Harden SECURITY DEFINER functions with SET search_path.
--
-- Audit finding: 9 foundational RLS helpers in 02_rls.sql and 03_rls_phase1.sql
-- were created WITHOUT SET search_path, making them vulnerable to search-path
-- hijack. An attacker who creates objects in a schema earlier in the
-- search_path can escalate privileges.
--
-- See docs/REWRITE_BUILD_PLAN.md §2.3a for the full audit.
-- Run after 116_rls_policy_fixes.sql. Idempotent.

-- ============================================================================
-- Fix functions from 02_rls.sql (foundation RLS helpers)
-- ============================================================================

alter function public.current_role_text() security definer set search_path = public;
alter function public.current_email() security definer set search_path = public;
alter function public.is_superadmin() security definer set search_path = public;
alter function public.log_activity(uuid, text, text, text) security definer set search_path = public;

-- user_project_ids() was redefined in 03_rls_phase1.sql, so we fix that
-- version (which is the current one).
alter function public.user_project_ids() security definer set search_path = public;

-- ============================================================================
-- Fix functions from 03_rls_phase1.sql
-- ============================================================================

alter function public.is_orgadmin() security definer set search_path = public;
alter function public.user_org_id() security definer set search_path = public;
alter function public.record_audit_v2(text, text, text, uuid, jsonb, jsonb, text) security definer set search_path = public;

-- ============================================================================
-- Verification
-- ============================================================================

do $$ declare
  r record;
  missing int := 0;
begin
  for r in
    select p.proname::text as func
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        'current_role_text','current_email','is_superadmin','log_activity',
        'user_project_ids','is_orgadmin','user_org_id','record_audit_v2'
      )
      and (p.proconfig is null or NOT ('search_path=public' = any(p.proconfig)))
  loop
    raise warning '117: % still missing search_path', r.func;
    missing := missing + 1;
  end loop;
  if missing = 0 then
    raise notice '117: all critical functions hardened with SET search_path = public';
  else
    raise exception '117: % functions still missing search_path', missing;
  end if;
end $$;
