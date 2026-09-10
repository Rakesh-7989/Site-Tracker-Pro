-- SiteTrack Pro — security hardening: orgs view leaks every org's plan/MRR.
--
-- The `orgs` view (migration 135) is owner by `postgres` and does NOT set
-- `security_invoker`, so it runs its SELECT with the view owner's privileges
-- and BYPASSES row-level security on the underlying tables. The view grants
-- SELECT to `authenticated`, which means ANY signed-in user could list every
-- organization's plan, subscription status and MRR (a cross-tenant leak
-- confirmed live 2026-09-10).
--
-- Fix: flip the view to `security_invoker = true` so Postgres evaluates RLS
-- (and the ACLs) of `organizations` / `subscriptions` / `billing_history` as
-- the CALLING user. Org members then see only their own org (the LEFT JOINs
-- turn filtered rows into NULLs, not errors); superadmins keep full visibility
-- via the existing superadmin-policy arms.
--
-- Because the invoked tables are now access-checked per caller, `billing_history`
-- also needs a SELECT grant for `authenticated` (it previously had none — only
-- postgres/service_role). RLS policy `billing_read` still gates which rows are
-- visible; this grant is strictly additive.
--
-- Idempotent. No data change; ACL + view-option only.

BEGIN;

-- ── 1. orgs view: run as the caller so RLS applies ─────────────────────────
-- The PostgreSQL server 14+ accepts the reloption; older servers error, so
-- apply via a guarded DO block is unnecessary here (project is PG 17).
ALTER VIEW public.orgs SET (security_invoker = true);

-- ── 2. required read grant so the security_invoker view doesn't abort ──────
grant select on public.billing_history to authenticated;

-- ── 3. Self-verify ─────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'orgs'
      AND reloptions::text LIKE '%security_invoker=%'
  ) THEN
    RAISE EXCEPTION 'migration 258 FAILED: orgs view security_invoker not set';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'billing_history'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'migration 258 FAILED: billing_history SELECT grant missing for authenticated';
  END IF;
  RAISE NOTICE 'migration 258 ok: orgs security_invoker + billing_history authenticated SELECT live';
END $$;

COMMIT;