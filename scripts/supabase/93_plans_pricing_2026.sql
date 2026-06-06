-- SiteTrack Pro — plans pricing refresh (2026-06, go-live pricing).
--
-- Sets the public pricing the v3 landing/signup show (src/features/marketing/
-- plans.ts) on the DB `plans` table too, so legacy + any DB-driven display agree
-- (fixes the v3↔DB price drift). Monthly + annual ("2 months free" ≈ 17% off).
-- All amounts in PAISE (bigint). IDEMPOTENT (plain UPDATEs).
--
--   Basic    ₹7,999/mo   · ₹79,990/yr   (save ₹15,998 / 17%)
--   Pro      ₹19,999/mo  · ₹1,99,990/yr (save ₹39,998 / 17%)   ← recommended
--   Business ₹43,333/mo  · ₹4,33,330/yr (save ₹86,666 / 17%)

BEGIN;

-- Basic — restore monthly pricing + name (mig 54 had made it annual-only "Pilot").
UPDATE public.plans
   SET name        = 'Basic',
       tagline     = 'Small contractors getting organised',
       monthly_inr = 799900,        -- ₹7,999
       yearly_inr  = 7999000,       -- ₹79,990
       recommended = false,
       feature_caps = feature_caps || '{"users_max": 5, "projects_max": 3}'::jsonb,
       updated_at  = now()
 WHERE id = 'basic';

-- Pro — the recommended tier.
UPDATE public.plans
   SET name        = 'Pro',
       tagline     = 'Growing firms running multiple sites',
       monthly_inr = 1999900,       -- ₹19,999
       yearly_inr  = 19999000,      -- ₹1,99,990
       recommended = true,
       feature_caps = feature_caps || '{"users_max": 20, "projects_max": null}'::jsonb,
       updated_at  = now()
 WHERE id = 'pro';

-- Business.
UPDATE public.plans
   SET name        = 'Business',
       tagline     = 'Established builders who need control',
       monthly_inr = 4333300,       -- ₹43,333
       yearly_inr  = 43333000,      -- ₹4,33,330
       recommended = false,
       feature_caps = feature_caps || '{"users_max": 100, "projects_max": null}'::jsonb,
       updated_at  = now()
 WHERE id = 'business';

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name, monthly_inr, yearly_inr FROM public.plans
            WHERE id IN ('basic','pro','business') ORDER BY monthly_inr LOOP
    RAISE NOTICE '93_plans: % (%) — ₹%/mo · ₹%/yr',
      r.id, r.name, (r.monthly_inr/100), (r.yearly_inr/100);
  END LOOP;
END $$;

COMMIT;
