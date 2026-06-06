-- SiteTrack Pro — plans pricing refine (2026-06, "slightly premium" reposition).
--
-- Founder decision: keep a premium feel but come DOWN from the first cut to
-- anchor Pro at Powerplay Pro+ parity (₹1,19,999/yr), Business slightly above.
-- Supersedes migration 93. Monthly + annual ("2 months free" ≈ 17% off).
-- All amounts in PAISE (bigint). IDEMPOTENT.
--
--   Basic    ₹5,999/mo   · ₹59,990/yr   (save ₹11,998 / 17%)
--   Pro      ₹11,999/mo  · ₹1,19,990/yr (save ₹23,998 / 17%)  ← ≈ Powerplay Pro+ parity, recommended
--   Business ₹19,999/mo  · ₹1,99,990/yr (save ₹39,998 / 17%)  ← slightly premium

BEGIN;

UPDATE public.plans
   SET name = 'Basic', tagline = 'Small contractors getting organised',
       monthly_inr = 599900, yearly_inr = 5999000, recommended = false, updated_at = now()
 WHERE id = 'basic';

UPDATE public.plans
   SET name = 'Pro', tagline = 'Growing firms running multiple sites',
       monthly_inr = 1199900, yearly_inr = 11999000, recommended = true, updated_at = now()
 WHERE id = 'pro';

UPDATE public.plans
   SET name = 'Business', tagline = 'Established builders who need control',
       monthly_inr = 1999900, yearly_inr = 19999000, recommended = false, updated_at = now()
 WHERE id = 'business';

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name, monthly_inr, yearly_inr FROM public.plans
            WHERE id IN ('basic','pro','business') ORDER BY monthly_inr LOOP
    RAISE NOTICE '94_plans: % (%) — ₹%/mo · ₹%/yr',
      r.id, r.name, (r.monthly_inr/100), (r.yearly_inr/100);
  END LOOP;
END $$;

COMMIT;
