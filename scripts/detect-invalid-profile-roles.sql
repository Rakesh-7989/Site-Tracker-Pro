-- Detect profiles with roles that violate profiles_role_check.
--
-- Run from Supabase SQL Editor or via:
--   psql "$SUPABASE_DB_URL" -f scripts/detect-invalid-profile-roles.sql
--
-- If rows are returned, update them to the closest valid role:
--   UPDATE profiles SET role = 'client' WHERE role IS NULL OR role NOT IN (...);
-- Or handle each case individually.

SELECT id, name, role, created_at
FROM profiles
WHERE role IS NULL
   OR role NOT IN (
    'superadmin','orgadmin','promoter','project_admin','prospector','pm',
    'architect','senior_architect','junior_architect','design_architect_interior',
    'design_head','consultant_head','mep_consultant','structural_consultant',
    'consultant','designer','site_engineer','site_inspector',
    'contractor','sub_contractor','vendor','client'
  )
ORDER BY created_at DESC;
