-- Sprint 1 hotfix (Session 30.5) — set yearly_inr on plans + reset
-- monthly_inr so the signup tab plan picker shows the canonical Sprint 1
-- annual pricing (Pilot ₹29,999/yr · Pro ₹49,999/yr · Business ₹89,999/yr ·
-- Enterprise ₹2,49,999+/yr).
--
-- Pairs with frontend change in src/features/shell/index.jsx — prefer
-- yearly_inr when set, fall back to monthly_inr × 12.

BEGIN;

-- Pilot tier — design partner, first 5 only
update public.plans
  set monthly_inr = 0,                      -- annual-only tier; no monthly option
      yearly_inr  = 2999900,                -- ₹29,999/yr in paise
      tagline     = 'Design partner · first 5 only',
      name        = 'Pilot',
      recommended = false
  where id = 'basic';

-- Pro tier — 30% under Powerplay's verified ₹71,999/yr
update public.plans
  set monthly_inr = 0,                      -- annual-only
      yearly_inr  = 4999900,                -- ₹49,999/yr in paise
      tagline     = '30% under Powerplay',
      name        = 'Pro',
      recommended = true                    -- the default suggested tier
  where id = 'pro';

-- Business tier — 25% under Powerplay's verified ₹1,19,999/yr Pro+
update public.plans
  set monthly_inr = 0,                      -- annual-only
      yearly_inr  = 8999900,                -- ₹89,999/yr in paise
      tagline     = 'Multi-state + GSTN + handover',
      name        = 'Business',
      recommended = false
  where id = 'business';

-- Enterprise tier — sales-only, sales-controlled price
update public.plans
  set monthly_inr = 0,
      yearly_inr  = 24999900,               -- ₹2,49,999+/yr starting in paise
      tagline     = 'Custom limits + on-prem mirror',
      name        = 'Enterprise',
      recommended = false
  where id = 'enterprise';

COMMIT;
