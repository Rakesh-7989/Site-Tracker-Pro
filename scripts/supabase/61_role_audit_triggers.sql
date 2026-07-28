-- SiteTrack Pro — role-change audit triggers (Session 30.13, Phase 2).
--
-- R&D audit gap #5C: role changes were SILENT. When Ramesh was promoted
-- architect → project_admin, or added/removed from a project, NO row was
-- written to audit_log_v2. For a product whose #1 proof point is "every
-- action is logged", that's a hole.
--
-- This migration adds AFTER INSERT/UPDATE/DELETE triggers on org_members
-- and project_members that record the change to audit_log_v2.
--
-- Design notes:
--   - The trigger function is SECURITY DEFINER + inserts DIRECTLY into
--     audit_log_v2 (it does NOT call record_audit_v2, which raises when
--     auth.uid() is null — service-role / cron changes have no auth.uid).
--   - actor_id is auth.uid() when present, else NULL (system change).
--   - action maps to the allowed audit CHECK values: CREATE / UPDATE / DELETE.
--   - before/after capture only the role (the field that matters for access).
--   - Test-user provisioning sets session_replication_role='replica',
--     which disables these triggers — so fixtures don't spam the audit log.
--
-- IDEMPOTENT.

BEGIN;

-- ── Helper: resolve actor profile fields (nullable) ─────────────────────────
CREATE OR REPLACE FUNCTION public.audit_member_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id     uuid := auth.uid();
  v_actor_name   text;
  v_actor_role   text;
  v_org_id       uuid;
  v_project_id   uuid;
  v_resource     text;
  v_action       text;
  v_before       jsonb;
  v_after        jsonb;
  v_resource_id  text;
BEGIN
  -- Resolve actor display fields if we have an authenticated user.
  IF v_actor_id IS NOT NULL THEN
    SELECT name, role INTO v_actor_name, v_actor_role
    FROM public.profiles WHERE id = v_actor_id;
  END IF;

  IF TG_TABLE_NAME = 'org_members' THEN
    v_resource := 'org_member';
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.org_id;  v_resource_id := OLD.profile_id::text;
    ELSE
      v_org_id := NEW.org_id;  v_resource_id := NEW.profile_id::text;
    END IF;
  ELSE  -- project_members
    v_resource := 'project_member';
    IF TG_OP = 'DELETE' THEN
      v_project_id := OLD.project_id;  v_resource_id := OLD.profile_id::text;
    ELSE
      v_project_id := NEW.project_id;  v_resource_id := NEW.profile_id::text;
    END IF;
    -- Derive org_id from the project for org-scoped audit reads.
    SELECT org_id INTO v_org_id FROM public.projects
      WHERE id = COALESCE(v_project_id);
  END IF;

  -- Map operation + decide whether to log.
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_before := NULL;
    v_after  := jsonb_build_object('role', NEW.role);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log when the role actually changed OR a soft-delete happened.
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      v_action := 'UPDATE';
      v_before := jsonb_build_object('role', OLD.role);
      v_after  := jsonb_build_object('role', NEW.role);
    ELSIF (TG_TABLE_NAME = 'org_members' AND OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL)
       OR (TG_TABLE_NAME = 'project_members' AND OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL) THEN
      v_action := 'DELETE';   -- soft-delete logged as a removal
      v_before := jsonb_build_object('role', OLD.role, 'removed_at', NULL);
      v_after  := jsonb_build_object('role', NEW.role, 'removed_at', NEW.removed_at);
    ELSE
      RETURN NEW;  -- no meaningful change; skip
    END IF;
  ELSE  -- DELETE (hard)
    v_action := 'DELETE';
    v_before := jsonb_build_object('role', OLD.role);
    v_after  := NULL;
  END IF;

  -- Skip audit insert when the org is being cascade-deleted (org row gone)
  IF v_org_id IS NULL OR EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_id) THEN
    INSERT INTO public.audit_log_v2(
      org_id, project_id, actor_id, actor_name, actor_role,
      action, resource, resource_id, before, after, message
    ) VALUES (
      v_org_id, v_project_id, v_actor_id, v_actor_name, v_actor_role,
      v_action, v_resource, v_resource_id, v_before, v_after,
      format('%s %s role', v_action, v_resource)
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ── org_members triggers ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_org_member_role ON public.org_members;
CREATE TRIGGER trg_audit_org_member_role
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_role_change();

-- ── project_members triggers ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_project_member_role ON public.project_members;
CREATE TRIGGER trg_audit_project_member_role
  AFTER INSERT OR UPDATE OR DELETE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_role_change();

COMMIT;
