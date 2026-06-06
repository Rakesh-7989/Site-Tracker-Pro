-- SiteTrack Pro — superadmin org-plan control + Enterprise tier (2026-06-06).
--
-- Phase 1 of "superadmin grants Enterprise + per-org role/feature customization":
--   1. Extend organizations.plan CHECK to allow 'enterprise' + 'free'
--      (was basic/pro/business/custom only — couldn't store 'enterprise').
--   2. Ensure an 'enterprise' plan row exists, flagged as the customization
--      unlock via feature_caps.custom_roles = true (soft gate, Phase 2 reads it).
--   3. set_org_plan(p_org, p_plan) RPC — SUPERADMIN-ONLY — so the founder can
--      grant/revoke a plan (incl. Enterprise) directly from /admin/orgs.
--
-- IDEMPOTENT. The per-org role + capability customization itself already exists
-- (migrations 69 role_capability_overrides + 70 org_roles) and is org-isolated,
-- so this changes nothing for other orgs.

BEGIN;

-- ── 1. allow 'enterprise' + 'free' on organizations.plan ─────────────────────
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('basic','pro','business','custom','free','enterprise'));

-- ── 2. ensure an Enterprise plan row exists + flags customization unlock ──────
INSERT INTO public.plans (id, name, tagline, monthly_inr, yearly_inr, feature_caps, recommended, display_order)
VALUES ('enterprise', 'Enterprise', 'Custom roles, SSO & dedicated support', 0, 0,
        '{"users_max": null, "projects_max": null, "custom_roles": true}'::jsonb, false, 40)
ON CONFLICT (id) DO UPDATE
  SET name = 'Enterprise',
      feature_caps = public.plans.feature_caps || '{"custom_roles": true}'::jsonb,
      updated_at = now();

-- The legacy 'custom' tier (seeded as "Enterprise", ₹79,999) also unlocks
-- customization so existing custom-plan orgs aren't downgraded.
UPDATE public.plans
   SET feature_caps = feature_caps || '{"custom_roles": true}'::jsonb, updated_at = now()
 WHERE id = 'custom';

-- ── 3. set_org_plan RPC (superadmin only) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_org_plan(p_org uuid, p_plan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text; v_name text;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'only a superadmin can change an organization plan';
  END IF;
  -- Validate against the real plans table — whatever tiers exist are valid.
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown plan: ' || p_plan);
  END IF;
  SELECT plan, name INTO v_old, v_name FROM public.organizations WHERE id = p_org;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization not found');
  END IF;
  UPDATE public.organizations SET plan = p_plan WHERE id = p_org;
  RETURN jsonb_build_object('ok', true, 'org', v_name, 'from', v_old, 'to', p_plan);
END $$;

GRANT EXECUTE ON FUNCTION public.set_org_plan(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.set_org_plan(uuid, text) IS
  'Superadmin-only: change an org''s plan (incl. granting Enterprise). Validates against the plans table.';

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.plans WHERE (feature_caps->>'custom_roles')::boolean IS TRUE;
  RAISE NOTICE '95_org_plan_admin: % plan(s) unlock custom roles (enterprise/custom).', n;
END $$;

COMMIT;
