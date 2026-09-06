-- SiteTrack Pro — SEC-P0-2: organization plan/billing_period self-upgrade guard.
--
-- Closes the privilege-escalation hole opened by migration 247. 247 granted
-- column-scoped UPDATE(name, contact_email, segment, segments,
-- enabled_modules, billing_period, plan, org_type) to `authenticated` with a
-- row-scoped policy (superadmin OR org-tier admin) so the onboarding wizard
-- could save. The row scoping is correct per-row, but `plan` +
-- `billing_period` in the self-serve column list means any org admin can
-- `SET plan = 'enterprise'` via a direct PostgREST call and sail past
-- QuotaGate / Cashfree. Plan changes must flow through the subscription
-- lifecycle (Cashfree webhook / superadmin), never self-serve.
--
-- Fix: one BEFORE UPDATE OF plan, billing_period trigger that mirrors the
-- billing authority exactly. A no-op echo (onboarding re-saving the current
-- values) always passes; an actual change requires superadmin. Backend
-- reconciliation (service_role / postgres / cron — no auth JWT) bypasses,
-- because is_superadmin() is auth.uid()-based and would read FALSE there.
-- Idempotent. Follows the migration 223 lifecycle-guard style.

BEGIN;

create or replace function public.guard_organization_plan_change()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan
     or new.billing_period is distinct from old.billing_period then
    -- Backend reconciliation (webhooks, cron, RPCs as service_role/postgres)
    -- carries no auth JWT — allow it through.
    if auth.uid() is null then
      return new;
    end if;
    if public.is_superadmin() then
      return new;
    end if;
    raise exception 'organization_plan: plan/billing_period changes require superadmin (SEC-P0-2)';
  end if;
  return new;
end;
$$;

alter function public.guard_organization_plan_change()
  set search_path = public, extensions, pg_temp;

drop trigger if exists trg_organizations_plan_guard on public.organizations;
create trigger trg_organizations_plan_guard
  before update of plan, billing_period on public.organizations
  for each row execute function public.guard_organization_plan_change();

comment on function public.guard_organization_plan_change() is
  'SEC-P0-2: plan/billing_period changes require superadmin (or backend service_role); onboarding echo of unchanged values always passes.';

DO $$
DECLARE
  v_fn text;
  v_trg record;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'guard_organization_plan_change';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'migration 254 FAILED: guard_organization_plan_change() missing';
  END IF;

  SELECT * INTO v_trg FROM pg_trigger
  WHERE tgrelid = 'public.organizations'::regclass
    AND tgname = 'trg_organizations_plan_guard';
  IF v_trg IS NULL THEN
    RAISE EXCEPTION 'migration 254 FAILED: trg_organizations_plan_guard missing';
  END IF;

  RAISE NOTICE 'migration 254 ok: organization plan/billing_period guard live';
END $$;

COMMIT;
