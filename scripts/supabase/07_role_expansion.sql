-- SiteTrack Pro — v2 Phase B: expand profiles.role enum
-- Run AFTER 06_project_types.sql.
-- Idempotent — safe to re-run.
--
-- Extends the profiles.role check constraint to include the 12 new v2 roles
-- per docs/ROLE_MODEL_V2.md. v1 roles continue to work — strict superset.

-- ============================================================================
-- 1. Drop + recreate the role check constraint
-- ============================================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in (
    -- v1 (6)
    'superadmin', 'orgadmin', 'architect', 'pm', 'contractor', 'client',
    -- v2 org additions
    'project_admin', 'prospector',
    -- v2 construction-discipline additions
    'project_head', 'mep_consultant', 'site_engineer',
    'civil_engineer', 'site_inspector',
    -- v2 design / consultant additions
    'interior_designer', 'design_architect_interior', 'designer', 'consultant',
    -- v2 contractor sub-tier
    'sub_contractor'
  ));

-- ============================================================================
-- 2. RLS overlays: new roles should READ project tables they're assigned to
-- ============================================================================

-- All new project-team roles get the same project-scoped READ that the
-- existing v1 roles have. We re-use user_project_ids() — it already returns
-- the project rows the caller can see based on project_members + role rules.
-- No new policy needed; the existing read_projects / read_milestones /
-- read_tasks / etc. policies already cover them because they check
-- `project_id in (select user_project_ids())` not a role list.

-- However, the WRITE policies in 02_rls.sql DO check role lists. Extend them
-- to include the new construction-discipline roles for the writes their
-- PERMS table allows.

-- Updates: site_engineer + project_head + civil_engineer + mep_consultant
-- can insert site updates on their assigned projects.
drop policy if exists write_updates on site_updates;
create policy write_updates on site_updates for insert
  with check (
    current_role_text() in (
      'architect','pm','contractor','project_admin','project_head',
      'site_engineer','civil_engineer','mep_consultant','site_inspector',
      'interior_designer','design_architect_interior','designer','sub_contractor'
    )
    and project_id in (select user_project_ids())
  );

-- Issues: same expansion
drop policy if exists write_issues on issues;
create policy write_issues on issues for insert
  with check (
    current_role_text() in (
      'architect','pm','contractor','project_admin','project_head',
      'site_engineer','civil_engineer','mep_consultant','site_inspector',
      'interior_designer','design_architect_interior','sub_contractor'
    )
    and project_id in (select user_project_ids())
  );

-- Inventory + materials: only execution roles
drop policy if exists write_inventory on inventory_transactions;
create policy write_inventory on inventory_transactions for all
  using (
    current_role_text() in (
      'architect','pm','contractor','project_admin','project_head',
      'site_engineer','sub_contractor','interior_designer'
    )
    and project_id in (select user_project_ids())
  );

-- BOQ: only architect / pm / project_admin / project_head / design_architect can edit
drop policy if exists write_boq on boq_items;
create policy write_boq on boq_items for all
  using (
    current_role_text() in (
      'architect','pm','project_admin','project_head','design_architect_interior'
    )
    and project_id in (select user_project_ids())
  );

-- Drawings: architect family only writes (read policy already covers consumers)
drop policy if exists write_drawings_architect on drawings;
create policy write_drawings_architect on drawings for all
  using (
    current_role_text() in (
      'architect','project_admin','project_head','design_architect_interior'
    )
    and project_id in (select user_project_ids())
  );

-- ============================================================================
-- 3. Migration sanity
-- ============================================================================
do $$ declare invalid_roles text; begin
  select string_agg(distinct role, ', ') into invalid_roles
  from public.profiles
  where role not in (
    'superadmin','orgadmin','architect','pm','contractor','client',
    'project_admin','prospector','project_head','mep_consultant',
    'site_engineer','civil_engineer','site_inspector',
    'interior_designer','design_architect_interior','designer','consultant',
    'sub_contractor'
  );
  if invalid_roles is not null then
    raise exception '07_role_expansion: invalid roles in profiles: %', invalid_roles;
  end if;
  raise notice '07_role_expansion: all profile roles valid. Role distribution: %', (
    select string_agg(role || ':' || cnt::text, ', ' order by role)
    from (select role, count(*) as cnt from profiles group by role) s
  );
end $$;
