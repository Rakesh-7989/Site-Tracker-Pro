-- Sprint 1 hotfix (Session 30.5) — anon GRANT on public.plans so the LoginScreen
-- signup tab can show real plan tiers instead of falling back to retired
-- ₹999/2,999/7,999 monthly cards.
--
-- Root cause: migration 02_rls.sql enabled RLS on `plans` and added a
-- "plans_read FOR SELECT TO PUBLIC USING (true)" policy, but never GRANTed
-- SELECT on the table to the anon role. PostgreSQL requires BOTH the table-
-- level GRANT AND a permissive RLS policy. Without the GRANT, anon sees
-- 0 rows even with a USING(true) policy.
--
-- Reproduce (pre-fix):
--   set role anon;
--   select * from public.plans;        -- ERROR: permission denied for table plans
--
-- After this migration:
--   set role anon;
--   select * from public.plans;        -- 3 rows: Pilot / Pro / Business
--
-- Symptom this fixes: signup tab plan picker showing "Free trial / Pro
-- ₹999 / Business ₹2,999" hardcoded fallback instead of the Sprint 1
-- repriced Pilot ₹29,999 / Pro ₹49,999 / Business ₹89,999 tiers.

BEGIN;

grant select on public.plans to anon, authenticated;

comment on table public.plans is
  'Sprint 1 fix (53): anon + authenticated have SELECT so the LoginScreen signup-tab plan picker can fetch via fetchPublicPlans().';

COMMIT;
