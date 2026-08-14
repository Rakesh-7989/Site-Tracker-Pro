-- SiteTrack Pro — missing authenticated table grants (2026-08-15).
--
-- Root cause: 18 tables had RLS enabled with policies, but the `authenticated`
-- role was never GRANTed table-level DML. Postgres checks table grants BEFORE
-- row-level security, so PostgREST returned "permission denied for table X"
-- for every direct query, even though a policy would have allowed the row.
-- (Migration 24 created the feature-flag tables with policies but no grants;
-- the same gap silently affected 15 more tables across blocks/floors/units/
-- permits/submittals/measurement_book/delegations/activity_log/branding/
-- digest/DPR/material_prices/staff_invites.)
--
-- Fix: grant exactly the operations each table's existing RLS policies
-- permit (SELECT-only tables get SELECT; tables with write policies get full
-- DML). RLS remains the row-level gate — these grants only restore the
-- table-level access the policies were already designed for. Mirrors the
-- grant pattern used across migrations 72–78, 131, 137–179.
--
-- IDEMPOTENT. Safe to re-run.

BEGIN;

-- ── Full DML: tables with write policies ───────────────────────────────────
grant select, insert, update, delete on public.blocks             to authenticated;
grant select, insert, update, delete on public.branding           to authenticated;
grant select, insert, update, delete on public.delegations        to authenticated;
grant select, insert, update, delete on public.digest_subscriptions to authenticated;
grant select, insert, update, delete on public.floors             to authenticated;
grant select, insert, update, delete on public.material_prices    to authenticated;
grant select, insert, update, delete on public.ops_toggles        to authenticated;
grant select, insert, update, delete on public.org_feature_flags  to authenticated;
grant select, insert, update, delete on public.permits            to authenticated;
grant select, insert, update, delete on public.platform_feature_flags to authenticated;
grant select, insert, update, delete on public.staff_invites      to authenticated;
grant select, insert, update, delete on public.submittals         to authenticated;
grant select, insert, update, delete on public.units              to authenticated;

-- ── Partial DML: tables with specific write policies ──────────────────────
-- dpr_messages: insert + update policies (no delete policy) → select/insert/update
grant select, insert, update on public.dpr_messages to authenticated;
-- measurement_book: mb_insert (ALL) + mb_verify_update (UPDATE) → select/insert/update
grant select, insert, update on public.measurement_book to authenticated;

-- ── SELECT-only: tables with only read policies ───────────────────────────
grant select on public.activity_log to authenticated;
grant select on public.digest_dispatches to authenticated;
grant select on public.dpr_delivery_log to authenticated;

-- Revoke anon (consistent with the rest of the schema — no anon surface here).
revoke all on public.activity_log from anon;
revoke all on public.blocks from anon;
revoke all on public.branding from anon;
revoke all on public.delegations from anon;
revoke all on public.digest_dispatches from anon;
revoke all on public.digest_subscriptions from anon;
revoke all on public.dpr_delivery_log from anon;
revoke all on public.dpr_messages from anon;
revoke all on public.floors from anon;
revoke all on public.material_prices from anon;
revoke all on public.measurement_book from anon;
revoke all on public.ops_toggles from anon;
revoke all on public.org_feature_flags from anon;
revoke all on public.permits from anon;
revoke all on public.platform_feature_flags from anon;
revoke all on public.staff_invites from anon;
revoke all on public.submittals from anon;
revoke all on public.units from anon;

COMMIT;
