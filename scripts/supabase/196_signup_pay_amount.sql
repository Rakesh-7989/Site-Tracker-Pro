-- 196_signup_pay_amount.sql — pay-page amount correctness (P-F sweep).
--
-- Bug: the public /pay page derived the amount from the FRONTEND PLAN_TIERS
-- (src/features/marketing/plans.ts, basic/pro/business only). That had two
-- real consequences:
--   1. A `custom`-plan signup rendered ₹0 / an amount-less UPI QR (PLAN_TIERS
--      has no `custom` entry, but the DB `plans` table does — ₹7,999/mo or
--      ₹79,990/yr).
--   2. Any recorded charge (signup_requests.paid_amount_paise, migration 195)
--      and the DB plan price were ignored, so the UPI QR amount could drift
--      from the Cashfree link amount.
--
-- Fix: recreate get_signup_for_pay to also return `plan_amount_inr` (DB plans
-- yearly_inr incl. 18% GST, the same math cashfree-checkout uses) and the
-- stored `paid_amount_paise`. The frontend prefers the recorded paise, then
-- the DB plan amount, then the legacy PLAN_TIERS fallback. CREATE OR REPLACE
-- cannot add RETURN TABLE columns, so DROP + CREATE (anon/authenticated grants
-- re-added below; no dependent views/RPCs reference this function).

drop function if exists public.get_signup_for_pay(uuid);

create or replace function public.get_signup_for_pay(p_request uuid)
  returns table(
    firm_name text,
    plan text,
    email text,
    payment_status text,
    plan_amount_inr numeric,
    paid_amount_paise bigint
  )
  language sql stable security definer set search_path = public as $$
  select s.firm_name,
         s.plan,
         s.email,
         s.payment_status,
         round((p.yearly_inr::numeric / 100.0) * 1.18) as plan_amount_inr,
         s.paid_amount_paise
  from public.signup_requests s
  left join public.plans p on p.id = s.plan
  where s.id = p_request
$$;

grant execute on function public.get_signup_for_pay(uuid) to authenticated, anon;
