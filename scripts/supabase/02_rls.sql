-- SiteTrack Pro — Row Level Security policies (Phase B2)
-- Source of truth: docs/archive/BACKEND_PLAN.md
--
-- Run after 01_schema.sql. Test with the matrix in scripts/supabase/04_rls_tests.sql.

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

create or replace function current_role_text() returns text
language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function current_email() returns text
language sql stable security definer as $$
  select email from auth.users where id = auth.uid()
$$;

create or replace function user_project_ids() returns setof uuid
language sql stable security definer as $$
  -- Super admins see every project across every org (no org filter)
  select p.id from public.projects p
    where current_role_text() = 'superadmin'
  union
  -- Project members directly assigned
  select project_id from public.project_members where profile_id = auth.uid()
  union
  -- Architects see all projects in their orgs
  select p.id from public.projects p
    where current_role_text() = 'architect'
      and p.org_id in (select org_id from public.org_members where profile_id = auth.uid())
  union
  -- Clients see projects matching their email
  select p.id from public.projects p
    where current_role_text() = 'client'
      and p.client_email = current_email()
$$;

create or replace function is_superadmin() returns boolean
language sql stable security definer as $$
  select current_role_text() = 'superadmin'
$$;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

alter table profiles enable row level security;
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table milestones enable row level security;
alter table tasks enable row level security;
alter table site_updates enable row level security;
alter table issues enable row level security;
alter table drawings enable row level security;
alter table materials enable row level security;
alter table inventory_transactions enable row level security;
alter table boq_items enable row level security;
alter table vendors enable row level security;
alter table purchase_orders enable row level security;
alter table invoices enable row level security;
alter table ra_bills enable row level security;
alter table labour_register enable row level security;
alter table activity_log enable row level security;
alter table attachments enable row level security;

-- ============================================================================
-- READ POLICIES — project-scoped (idempotent via DROP IF EXISTS)
-- ============================================================================

drop policy if exists read_projects on projects;
create policy read_projects on projects for select
  using (id in (select user_project_ids()));

drop policy if exists read_milestones on milestones;
create policy read_milestones on milestones for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_tasks on tasks;
create policy read_tasks on tasks for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_updates on site_updates;
create policy read_updates on site_updates for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_issues on issues;
create policy read_issues on issues for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_materials on materials;
create policy read_materials on materials for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_inventory on inventory_transactions;
create policy read_inventory on inventory_transactions for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_boq on boq_items;
create policy read_boq on boq_items for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_pos on purchase_orders;
create policy read_pos on purchase_orders for select
  using (project_id in (select user_project_ids())
         and current_role_text() != 'client');

drop policy if exists read_invoices on invoices;
create policy read_invoices on invoices for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_ra_bills on ra_bills;
create policy read_ra_bills on ra_bills for select
  using (project_id in (select user_project_ids())
         and current_role_text() != 'client');

drop policy if exists read_labour on labour_register;
create policy read_labour on labour_register for select
  using (project_id in (select user_project_ids())
         and current_role_text() in ('architect','pm'));

drop policy if exists read_activity on activity_log;
create policy read_activity on activity_log for select
  using (project_id in (select user_project_ids()));

drop policy if exists read_attachments on attachments;
create policy read_attachments on attachments for select
  using (project_id in (select user_project_ids()));

-- ============================================================================
-- DRAWING READ — released_current rule (mirrors App.jsx isReleasedCurrentDrawing)
-- ============================================================================

drop policy if exists read_drawings_architect on drawings;
create policy read_drawings_architect on drawings for select
  using (current_role_text() = 'architect'
         and project_id in (select user_project_ids()));

drop policy if exists read_drawings_role on drawings;
create policy read_drawings_role on drawings for select
  using (status = 'current'
         and current_role_text() = any (released_to)
         and project_id in (select user_project_ids()));

-- ============================================================================
-- WRITE POLICIES — role-gated (idempotent via DROP IF EXISTS)
-- ============================================================================

drop policy if exists create_project_architect on projects;
create policy create_project_architect on projects for insert
  with check (current_role_text() = 'architect' or is_superadmin());

drop policy if exists update_project_architect on projects;
create policy update_project_architect on projects for update
  using ((current_role_text() = 'architect' and id in (select user_project_ids()))
         or is_superadmin());

-- Super admin admin-only tables ----------------------------------------------
drop policy if exists admin_orgs on organizations;
create policy admin_orgs on organizations for all
  using (is_superadmin())
  with check (is_superadmin());

drop policy if exists admin_org_members on org_members;
create policy admin_org_members on org_members for all
  using (is_superadmin() or profile_id = auth.uid())
  with check (is_superadmin());

drop policy if exists admin_profiles_read on profiles;
create policy admin_profiles_read on profiles for select
  using (is_superadmin() or id = auth.uid() or exists (
    select 1 from project_members pm
    where pm.profile_id = profiles.id and pm.project_id in (select user_project_ids())
  ));

drop policy if exists write_milestones on milestones;
create policy write_milestones on milestones for all
  using (current_role_text() in ('architect','pm')
         and project_id in (select user_project_ids()));

drop policy if exists write_tasks on tasks;
create policy write_tasks on tasks for all
  using (current_role_text() in ('architect','pm','contractor')
         and project_id in (select user_project_ids()));

drop policy if exists write_updates on site_updates;
create policy write_updates on site_updates for insert
  with check (current_role_text() in ('architect','pm','contractor')
              and project_id in (select user_project_ids()));

drop policy if exists write_issues on issues;
create policy write_issues on issues for insert
  with check (current_role_text() in ('architect','pm','contractor')
              and project_id in (select user_project_ids()));

drop policy if exists resolve_issues on issues;
create policy resolve_issues on issues for update
  using (current_role_text() in ('architect','pm')
         and project_id in (select user_project_ids()));

drop policy if exists write_drawings_architect on drawings;
create policy write_drawings_architect on drawings for all
  using (current_role_text() = 'architect'
         and project_id in (select user_project_ids()));

drop policy if exists write_inventory on inventory_transactions;
create policy write_inventory on inventory_transactions for all
  using (current_role_text() in ('architect','pm','contractor')
         and project_id in (select user_project_ids()));

drop policy if exists write_boq on boq_items;
create policy write_boq on boq_items for all
  using (current_role_text() in ('architect','pm')
         and project_id in (select user_project_ids()));

drop policy if exists write_pos on purchase_orders;
create policy write_pos on purchase_orders for all
  using (current_role_text() in ('architect','pm')
         and project_id in (select user_project_ids()));

drop policy if exists write_invoices on invoices;
create policy write_invoices on invoices for all
  using (current_role_text() = 'architect'
         and project_id in (select user_project_ids()));

drop policy if exists write_ra_bills on ra_bills;
create policy write_ra_bills on ra_bills for all
  using (current_role_text() in ('architect','contractor')
         and project_id in (select user_project_ids()));

drop policy if exists write_labour on labour_register;
create policy write_labour on labour_register for all
  using (current_role_text() in ('architect','pm')
         and project_id in (select user_project_ids()));

-- ============================================================================
-- ACTIVITY LOG — append-only, inserts via SECURITY DEFINER function only
-- ============================================================================

revoke insert, update, delete on activity_log from authenticated;

create or replace function log_activity(
  p_project_id uuid, p_type text, p_action text, p_detail text
) returns void
language plpgsql security definer as $$
declare v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  insert into public.activity_log(project_id, type, action, detail, by_profile_id, by_name, by_role)
    values (p_project_id, p_type, p_action, p_detail, v_profile.id, v_profile.name, v_profile.role);
end;
$$;