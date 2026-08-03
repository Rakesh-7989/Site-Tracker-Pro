-- SiteTrack Pro — Canonical `orgs` convenience view.
-- Run AFTER 134_org_segment.sql. Idempotent.
--
-- Background: the frontend queries a table/view named `orgs` in four places
-- (platformUsageQueries, platformBillingQueries, platformSupportQueries,
-- HandoverPacketView) but NO migration in this repo defined it — it existed
-- only as an out-of-band object in the live database. This migration makes the
-- repo self-contained by canonicalizing it from real tables:
--
--   platformUsageQueries  : select("id", { count: "exact", head: true })
--   platformBillingQueries: select("id, name, plan, status, mrr")
--   platformSupportQueries: select("id, name")
--   HandoverPacketView    : select("id,name")
--
-- Column notes:
--   status — subscription state (subscriptions.org_id is the PK → 1:1 with org).
--   mrr    — most recent *succeeded* Cashfree charge, converted paise → INR.
--            (billing_history is the system of record for charged amounts;
--            plans.monthly_inr and legacy seed.demo.ts pricing disagree, so we
--            prefer actual charges over catalog price.)

DROP VIEW IF EXISTS public.orgs;
CREATE VIEW public.orgs AS
SELECT
  o.id,
  o.slug,
  o.name,
  o.plan,
  s.status,
  COALESCE(mrr.latest_charge_inr, 0) AS mrr,
  o.created_at
FROM public.organizations o
LEFT JOIN public.subscriptions s ON s.org_id = o.id
LEFT JOIN LATERAL (
  SELECT bh.amount::numeric / 100.0 AS latest_charge_inr
  FROM public.billing_history bh
  WHERE bh.org_id = o.id
    AND bh.status = 'succeeded'
    AND bh.paid_at IS NOT NULL
  ORDER BY bh.paid_at DESC
  LIMIT 1
) mrr ON true;

GRANT SELECT ON public.orgs TO authenticated;
GRANT SELECT ON public.orgs TO service_role;

do $$ declare n int; begin
  select count(*) into n from public.orgs;
  raise notice '135_orgs_view: ready. % org row(s) visible via orgs view.', n;
end $$;
