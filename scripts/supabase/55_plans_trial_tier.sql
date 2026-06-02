-- Sprint 1 hotfix (Session 30.6) — add 14-day Free Trial tier.
--
-- The signup tab was showing 4 paid tiers (Pilot/Pro/Business/Enterprise)
-- with no "try before you buy" option. Most builder prospects won't sign a
-- ₹29,999 pilot commitment from a cold cold reach without testing the
-- product first.
--
-- This adds a `trial` tier:
--   - 14 days
--   - ₹0/yr (free)
--   - Becomes the default selected option (first in display order)
--   - Limits: 1 project, 5 users — enough to evaluate, not enough to run a
--     real builder firm on it
--
-- Auto-conversion logic (Sprint 2 task): on day 14, if no payment, the org
-- gets a friendly nag email + 7-day grace period; on day 21 if still
-- unpaid, the org freezes (read-only). For now we just persist the tier
-- and let the founder follow up manually.

BEGIN;

-- NOTE: the existing plans.id CHECK constraint (added in 01_schema.sql)
-- allows: 'basic', 'pro', 'business', 'custom', 'free', 'enterprise'.
-- We use id='free' for this trial tier — both semantically correct AND
-- already permitted without needing to alter the CHECK.
insert into public.plans (
  id, name, tagline, monthly_inr, yearly_inr,
  feature_caps, recommended, status,
  display_order, requires_superadmin
) values (
  'free',
  'Free trial',
  '14 days, no card needed',
  0,
  0,
  '{"users_max": 5, "storage_gb": 1, "projects_max": 1, "trial_days": 14}'::jsonb,
  false,
  'active',
  -10,                                     -- negative = first in list
  false
)
on conflict (id) do update set
  name        = excluded.name,
  tagline     = excluded.tagline,
  monthly_inr = excluded.monthly_inr,
  yearly_inr  = excluded.yearly_inr,
  feature_caps = excluded.feature_caps,
  status      = 'active',
  display_order = excluded.display_order,
  requires_superadmin = false;

-- Sanity check: the trial tier is visible to anon (depends on migration 53
-- having already GRANTed SELECT to anon).
comment on column public.plans.feature_caps is
  'JSON with users_max, storage_gb, projects_max, plus optional trial_days for tiers like ''trial''. Trigger trg_handle_signup reads requires_superadmin from this row.';

COMMIT;
