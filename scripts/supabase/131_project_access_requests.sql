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

  -- Add as project member with their identity role (or 'client' as fallback)
  INSERT INTO public.project_members (project_id, profile_id, role, assigned_by)
  SELECT v_project_id, v_requester_id, COALESCE(
    (SELECT role FROM public.profiles WHERE id = v_requester_id),
    'client'
  ), auth.uid()
  ON CONFLICT (project_id, profile_id, role) DO NOTHING;

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
