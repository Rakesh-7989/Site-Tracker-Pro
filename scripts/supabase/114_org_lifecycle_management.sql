-- SiteTrack Pro — Org lifecycle management for super admin panel (Session 30+).
--
-- R&D gap: Owner/staff could only hard-delete orgs (DPDP erasure) with NO reason
-- capture and NO subscription management. This migration adds:
--   1. 'paused' subscription status (admin-initiated pause)
--   2. is_staff_org_admin() helper — superadmin/owner/head/orgs-granted staff
--   3. admin_delete_org(p_org, p_reason) — delete with audit trail
--   4. admin_set_subscription_status(p_org, p_status, p_reason) — sub management
--   5. get_org_subscription(p_org) — read subscription (for admin panel refresh)
--
-- All actions are written to audit_log_v2 with actor, reason, before/after.
-- IDEMPOTENT.

BEGIN;

-- ── 1. Extend audit_log_v2 action CHECK to include lifecycle actions ─────────
ALTER TABLE public.audit_log_v2 DROP CONSTRAINT IF EXISTS audit_log_v2_action_check;
ALTER TABLE public.audit_log_v2 ADD CONSTRAINT audit_log_v2_action_check
  CHECK (action IN (
    'CREATE','UPDATE','DELETE','APPROVE','REJECT','RELEASE','UPLOAD','LOGIN',
    'IMPERSONATE','EXPORT','PAYMENT','DELEGATE','SUSPEND','REACTIVATE'
  ));

-- ── 2. Add 'paused' to subscriptions.status CHECK ───────────────────────────
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending','active','past_due','cancelled','trial','paused'));

-- ── 3. Helper: is caller authorized for admin org management? ────────────────
CREATE OR REPLACE FUNCTION public.is_staff_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role = 'superadmin'
        OR staff_tier IN ('owner', 'head')
        OR (staff_tier = 'member' AND EXISTS (
          SELECT 1 FROM public.staff_area_grants
          WHERE staff_id = auth.uid() AND area = 'orgs'
        ))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_org_admin() TO authenticated;

-- ── 4. Admin: delete org with reason + audit trail ──────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_org(p_org uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_actor_name text;
  v_actor_role text;
BEGIN
  IF NOT public.is_staff_org_admin() THEN
    RAISE EXCEPTION 'Only platform staff can delete organizations';
  END IF;

  -- Resolve org name
  SELECT name INTO v_name FROM public.organizations WHERE id = p_org;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization not found');
  END IF;

  -- Resolve actor name (nullable)
  SELECT name, role INTO v_actor_name, v_actor_role
    FROM public.profiles WHERE id = auth.uid();

  -- Write audit log BEFORE deletion (so org_id foreign key still resolves)
  INSERT INTO public.audit_log_v2(
    org_id, actor_id, actor_name, actor_role,
    action, resource, resource_id, message, after
  ) VALUES (
    p_org, auth.uid(), v_actor_name, v_actor_role,
    'DELETE', 'organization', p_org::text,
    COALESCE(v_actor_name, 'A staff member') || ' deleted organization "' || v_name || '": ' || COALESCE(p_reason, 'no reason given'),
    jsonb_build_object('reason', p_reason, 'deleted_name', v_name)
  );

  -- Hard-delete (cascades to all child data)
  DELETE FROM public.organizations WHERE id = p_org;

  RETURN jsonb_build_object('ok', true, 'deleted', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_org(uuid, text) TO authenticated;

-- ── 5. Admin: update subscription status with reason + audit trail ──────────
CREATE OR REPLACE FUNCTION public.admin_set_subscription_status(
  p_org uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name text;
  v_org_plan text;
  v_old_status text;
  v_actor_name text;
  v_actor_role text;
  v_action text;
BEGIN
  IF NOT public.is_staff_org_admin() THEN
    RAISE EXCEPTION 'Only platform staff can manage subscriptions';
  END IF;

  IF p_status NOT IN ('active', 'paused', 'cancelled', 'past_due') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid status: ' || p_status);
  END IF;

  SELECT o.name, o.plan, s.status, p.name, p.role
    INTO v_org_name, v_org_plan, v_old_status, v_actor_name, v_actor_role
    FROM public.organizations o
    LEFT JOIN public.subscriptions s ON s.org_id = o.id
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = p_org;

  IF v_org_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'organization not found');
  END IF;

  -- Map target status to audit action
  v_action := CASE p_status
    WHEN 'active'   THEN 'REACTIVATE'
    WHEN 'paused'   THEN 'SUSPEND'
    WHEN 'cancelled' THEN 'DELETE'
    WHEN 'past_due'  THEN 'SUSPEND'
    ELSE 'UPDATE'
  END;

  -- Upsert subscription row (include plan + provider for first-time insert, both NOT NULL)
  INSERT INTO public.subscriptions(org_id, plan, provider, status, updated_at)
    VALUES (p_org, COALESCE(v_org_plan, 'basic'), 'admin', p_status, now())
    ON CONFLICT (org_id)
    DO UPDATE SET status = p_status, updated_at = now();

  -- Write audit log
  INSERT INTO public.audit_log_v2(
    org_id, actor_id, actor_name, actor_role,
    action, resource, resource_id, message,
    before, after
  ) VALUES (
    p_org, auth.uid(), v_actor_name, v_actor_role,
    v_action, 'subscription', p_org::text,
    COALESCE(v_actor_name, 'A staff member') || ' changed subscription status ' ||
      COALESCE(v_old_status, '(none)') || ' → ' || p_status ||
      ' for "' || v_org_name || '": ' || COALESCE(p_reason, 'no reason given'),
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'org', v_org_name,
    'from', v_old_status,
    'to', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_subscription_status(uuid, text, text) TO authenticated;

-- ── 6. Read-only: get subscription for admin panel refresh ──────────────────
CREATE OR REPLACE FUNCTION public.get_org_subscription(p_org uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'status', s.status,
    'plan', s.plan,
    'provider', s.provider,
    'currentPeriodEnd', s.current_period_end,
    'trialEndsAt', s.trial_ends_at
  )
  FROM public.subscriptions s
  WHERE s.org_id = p_org
    AND public.is_staff_org_admin();
$$;

GRANT EXECUTE ON FUNCTION public.get_org_subscription(uuid) TO authenticated;

COMMIT;
