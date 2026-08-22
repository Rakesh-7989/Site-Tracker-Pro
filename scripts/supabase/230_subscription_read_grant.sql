-- SiteTrack Pro — subscriptions SELECT grant for authenticated (UX audit fix).
--
-- The live table had NO grant to `authenticated` (only postgres/service_role),
-- so every client read of /rest/v1/subscriptions returned 403 permission-
-- denied on every page load — even for org admins the RLS policy explicitly
-- wanted to allow (`subscriptions_read`: is_superadmin() OR has_org_tier
-- ('admin')). Consequences: constant console errors in production and the
-- trial-countdown pill never rendering for exactly its intended audience.
--
-- Client code already treats a failed subscription read as null and falls back
-- to organizations.plan (planCapsQueries.getPlanCaps), so granting SELECT is
-- purely additive: RLS remains the real gate (admins/superadmin see rows,
-- members still get an empty result — no 403).

BEGIN;

grant select on public.subscriptions to authenticated;

COMMIT;
