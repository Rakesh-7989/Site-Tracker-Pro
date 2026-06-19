-- SiteTrack Pro - plan role defaults (2026-06-19).
--
-- Stores the customer-visible standard role catalog per plan inside
-- plans.feature_caps so admin screens, support reports, and future server-side
-- checks have the same contract as src/auth/planRoleMatrix.ts.
--
-- RBAC permissions remain in src/auth/permissions-matrix.ts. These arrays are
-- role availability defaults for org/member UI and sales-plan promises.

BEGIN;

UPDATE public.plans
SET feature_caps = feature_caps || jsonb_build_object(
  'role_matrix_version', '2026-06-19-v1',
  'default_identity_roles', jsonb_build_array(
    'orgadmin', 'promoter', 'pm', 'architect', 'site_engineer',
    'contractor', 'sub_contractor', 'client'
  ),
  'default_org_roles', jsonb_build_array(
    'admin', 'pm', 'architect', 'contractor', 'client'
  ),
  'default_project_roles', jsonb_build_array(
    'architect', 'site_engineer', 'pm', 'contractor', 'sub_contractor',
    'client', 'promoter'
  )
), updated_at = now()
WHERE id IN ('free', 'basic');

UPDATE public.plans
SET feature_caps = feature_caps || jsonb_build_object(
  'role_matrix_version', '2026-06-19-v1',
  'default_identity_roles', jsonb_build_array(
    'orgadmin', 'promoter', 'pm', 'architect', 'site_engineer',
    'contractor', 'sub_contractor', 'client',
    'project_admin', 'senior_architect', 'junior_architect',
    'design_architect_interior', 'mep_consultant', 'structural_consultant',
    'consultant', 'designer', 'vendor'
  ),
  'default_org_roles', jsonb_build_array(
    'admin', 'pm', 'architect', 'contractor', 'client', 'vendor'
  ),
  'default_project_roles', jsonb_build_array(
    'architect', 'site_engineer', 'pm', 'contractor', 'sub_contractor',
    'client', 'promoter', 'project_admin', 'senior_architect',
    'junior_architect', 'design_architect_interior', 'mep_consultant',
    'structural_consultant', 'consultant', 'designer'
  )
), updated_at = now()
WHERE id = 'pro';

UPDATE public.plans
SET feature_caps = feature_caps || jsonb_build_object(
  'role_matrix_version', '2026-06-19-v1',
  'default_identity_roles', jsonb_build_array(
    'orgadmin', 'promoter', 'pm', 'architect', 'site_engineer',
    'contractor', 'sub_contractor', 'client',
    'project_admin', 'senior_architect', 'junior_architect',
    'design_architect_interior', 'mep_consultant', 'structural_consultant',
    'consultant', 'designer', 'vendor', 'prospector', 'design_head',
    'consultant_head', 'site_inspector'
  ),
  'default_org_roles', jsonb_build_array(
    'admin', 'pm', 'architect', 'contractor', 'client', 'vendor'
  ),
  'default_project_roles', jsonb_build_array(
    'architect', 'site_engineer', 'pm', 'contractor', 'sub_contractor',
    'client', 'promoter', 'project_admin', 'senior_architect',
    'junior_architect', 'design_architect_interior', 'mep_consultant',
    'structural_consultant', 'consultant', 'designer', 'design_head',
    'consultant_head', 'site_inspector'
  )
), updated_at = now()
WHERE id = 'business';

UPDATE public.plans
SET feature_caps = feature_caps || jsonb_build_object(
  'role_matrix_version', '2026-06-19-v1',
  'default_identity_roles', jsonb_build_array(
    'orgadmin', 'promoter', 'project_admin', 'prospector', 'pm',
    'architect', 'senior_architect', 'junior_architect',
    'design_architect_interior', 'design_head', 'consultant_head',
    'mep_consultant', 'structural_consultant', 'consultant', 'designer',
    'site_engineer', 'contractor', 'sub_contractor', 'vendor', 'client',
    'site_inspector'
  ),
  'default_org_roles', jsonb_build_array(
    'admin', 'pm', 'architect', 'contractor', 'client', 'vendor'
  ),
  'default_project_roles', jsonb_build_array(
    'architect', 'senior_architect', 'junior_architect',
    'design_architect_interior', 'design_head', 'consultant_head',
    'designer', 'consultant', 'mep_consultant', 'structural_consultant',
    'site_engineer', 'site_inspector', 'pm', 'project_admin',
    'contractor', 'sub_contractor', 'client', 'promoter'
  )
), updated_at = now()
WHERE id IN ('enterprise', 'custom');

DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT id,
           jsonb_array_length(COALESCE(feature_caps->'default_identity_roles', '[]'::jsonb)) AS identity_roles,
           jsonb_array_length(COALESCE(feature_caps->'default_project_roles', '[]'::jsonb)) AS project_roles
    FROM public.plans
    WHERE id IN ('basic', 'pro', 'business', 'enterprise', 'custom')
    ORDER BY display_order
  LOOP
    RAISE NOTICE '112_plan_role_defaults: % identity_roles=% project_roles=%',
      r.id, r.identity_roles, r.project_roles;
  END LOOP;
END $$;

COMMIT;
