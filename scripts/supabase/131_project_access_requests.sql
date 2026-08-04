-- 131_project_access_requests.sql — project-level access request/approval flow.
--
-- When an org member is not assigned to a project but wants access, they
-- create a request. The org admin (any active admin of the project's org)
-- can approve or reject it.
--
-- IDEMPOTENT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  UNIQUE (project_id, requester_id)
);

ALTER TABLE public.project_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS par_select_self_or_admin ON public.project_access_requests;
CREATE POLICY par_select_self_or_admin ON public.project_access_requests
  FOR SELECT
  USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.projects p ON p.org_id = om.org_id
      WHERE p.id = project_access_requests.project_id
        AND om.profile_id = auth.uid()
        AND om.role = 'admin'
        AND om.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS par_insert_self ON public.project_access_requests;
CREATE POLICY par_insert_self ON public.project_access_requests
  FOR INSERT
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS par_update_admin ON public.project_access_requests;
CREATE POLICY par_update_admin ON public.project_access_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.projects p ON p.org_id = om.org_id
      WHERE p.id = project_access_requests.project_id
        AND om.profile_id = auth.uid()
        AND om.role = 'admin'
        AND om.removed_at IS NULL
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.project_access_requests TO authenticated;
REVOKE ALL ON public.project_access_requests FROM anon;

-- RPC: request access (creates or reactivates a pending request)
CREATE OR REPLACE FUNCTION public.request_project_access(p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not-authenticated'; END IF;

  INSERT INTO public.project_access_requests (project_id, requester_id, status)
  VALUES (p_project_id, auth.uid(), 'pending')
  ON CONFLICT (project_id, requester_id)
  DO UPDATE SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
  WHERE project_access_requests.status IN ('rejected', 'approved');

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_project_access(uuid) TO authenticated;

-- RPC: approve a request and add the user as a project member
CREATE OR REPLACE FUNCTION public.approve_project_access(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_requester_id uuid;
BEGIN
  SELECT project_id, requester_id INTO v_project_id, v_requester_id
  FROM public.project_access_requests
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'request-not-found-or-not-pending'; END IF;

  IF NOT (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.projects p ON p.org_id = om.org_id
      WHERE p.id = v_project_id
        AND om.profile_id = auth.uid()
        AND om.role = 'admin'
        AND om.removed_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'permission-denied';
  END IF;

  -- Add as a project member. Map the identity role to a valid project-tier
  -- role (mirrors PROJECT_ROLE_FOR_IDENTITY in src/app/projectMemberQueries.ts)
  -- so trigger 155 (enforce_project_role_by_type) never rejects an approval.
  -- Fallback 'client' covers unknown/missing profiles.
  INSERT INTO public.project_members (project_id, profile_id, role, assigned_by)
  SELECT v_project_id, v_requester_id, COALESCE(
    (SELECT CASE role
       WHEN 'pm' THEN 'pm'
       WHEN 'architect' THEN 'architect'
       WHEN 'senior_architect' THEN 'architect'
       WHEN 'junior_architect' THEN 'architect'
       WHEN 'design_architect_interior' THEN 'architect'
       WHEN 'design_head' THEN 'architect'
       WHEN 'consultant_head' THEN 'architect'
       WHEN 'mep_consultant' THEN 'architect'
       WHEN 'structural_consultant' THEN 'architect'
       WHEN 'consultant' THEN 'architect'
       WHEN 'designer' THEN 'architect'
       WHEN 'site_engineer' THEN 'architect'
       WHEN 'contractor' THEN 'contractor'
       WHEN 'sub_contractor' THEN 'contractor'
       WHEN 'vendor' THEN 'contractor'
       WHEN 'client' THEN 'client'
       WHEN 'site_inspector' THEN 'client'
       WHEN 'superadmin' THEN 'pm'
       WHEN 'orgadmin' THEN 'pm'
       WHEN 'promoter' THEN 'pm'
       WHEN 'project_admin' THEN 'pm'
       WHEN 'prospector' THEN 'pm'
       ELSE 'client'
     END
     FROM public.profiles WHERE id = v_requester_id),
    'client'
  ), auth.uid()
  ON CONFLICT (project_id, profile_id) DO NOTHING;

  UPDATE public.project_access_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_request_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_project_access(uuid) TO authenticated;

-- RPC: reject a request
CREATE OR REPLACE FUNCTION public.reject_project_access(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      JOIN public.projects p ON p.org_id = om.org_id
      WHERE p.id = (SELECT project_id FROM public.project_access_requests WHERE id = p_request_id)
        AND om.profile_id = auth.uid()
        AND om.role = 'admin'
        AND om.removed_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'permission-denied';
  END IF;

  UPDATE public.project_access_requests
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_project_access(uuid) TO authenticated;

COMMIT;
