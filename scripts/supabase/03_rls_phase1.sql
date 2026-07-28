-- SiteTrack Pro — Phase 1 RLS additions (orgadmin tier + new tables)
-- Run AFTER 01_schema.sql + 02_rls.sql.
-- Adds:
--   1. The `orgadmin` role to the profiles.role CHECK constraint.
--   2. is_orgadmin() + user_org_id() helper functions.
--   3. Tables for templates / approval_chains / org_integrations /
--      notification_rules / audit_log_v2 (the immutable one).
--   4. RLS policies for every new table, plus orgadmin-scoped overlays on the
--      existing project tables (so the builder-firm owner can manage everything
--      WITHIN their own org but not across tenants).
--   5. New 02_rls.sql policies are NOT overwritten — every policy in this file
--      uses a unique name so they coexist with the original ones.

-- ============================================================================
-- 1. Extend the role enum to include orgadmin
-- ============================================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('superadmin','orgadmin','architect','pm','contractor','client'));

-- ============================================================================
-- 2. Helper functions
-- ============================================================================

create or replace function is_orgadmin() returns boolean
language sql stable security definer as $$
  select current_role_text() = 'orgadmin'
$$;

create or replace function user_org_id() returns uuid
language sql stable security definer as $$
  -- Org membership lookup. Falls back to NULL for superadmin / unattached users.
  select org_id from public.org_members
    where profile_id = auth.uid()
    order by joined_at asc
    limit 1
$$;

-- Update user_project_ids() to ALSO grant orgadmin visibility into all org
-- projects (mirrors the JS visibleProjectsForUser logic).
create or replace function user_project_ids() returns setof uuid
language sql stable security definer as $$
  -- Superadmins: every project
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
  -- ORG ADMINS see all projects in their org (regardless of membership rows)
  select p.id from public.projects p
    where current_role_text() = 'orgadmin'
      and p.org_id in (select org_id from public.org_members where profile_id = auth.uid())
  union
  -- Clients see projects matching their email
  select p.id from public.projects p
    where current_role_text() = 'client'
      and p.client_email = current_email()
$$;

-- ============================================================================
-- 3. New tables for Phase 1
-- ============================================================================

-- Org-level integration credentials (WhatsApp / AI / Razorpay / Cashfree).
create table if not exists org_integrations (
  org_id uuid primary key references organizations(id) on delete cascade,
  ai jsonb default '{}'::jsonb,
  razorpay jsonb default '{}'::jsonb,
  whatsapp jsonb default '{}'::jsonb,
  cashfree jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id)
);

-- Org-scoped templates (project / boq / checklist).
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('project','boq','checklist')),
  name text not null,
  description text,
  payload jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_templates_org_kind on templates(org_id, kind);

-- Configurable approval chains keyed by org + resource.
create table if not exists approval_chains (
  org_id uuid not null references organizations(id) on delete cascade,
  resource text not null check (resource in (
    'expense','po','ra_bill','change_order','invoice','drawing_release'
  )),
  name text not null,
  rungs jsonb not null,             -- [{threshold, role, requireSig, requireComment}]
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id),
  primary key (org_id, resource)
);

-- Org-level notification rules.
create table if not exists notification_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  trigger text not null,
  channel text not null check (channel in ('in_app','email','whatsapp')),
  recipients uuid[] not null default '{}',
  enabled boolean default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_notif_rules_org on notification_rules(org_id);

-- Immutable audit log (mirrors recordAudit() shape — append-only).
create table if not exists audit_log_v2 (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  actor_id uuid references profiles(id),
  actor_name text,
  actor_role text,
  action text not null check (action in (
    'CREATE','UPDATE','DELETE','APPROVE','REJECT','RELEASE','UPLOAD','LOGIN',
    'IMPERSONATE','EXPORT','PAYMENT','DELEGATE'
  )),
  resource text not null,
  resource_id text,
  before jsonb,
  after jsonb,
  message text,
  ts timestamptz default now()
);
create index if not exists idx_audit_org_ts on audit_log_v2(org_id, ts desc);
create index if not exists idx_audit_project_ts on audit_log_v2(project_id, ts desc);

-- Subscription state — written by Cashfree webhook (Session 15 part 2).
create table if not exists subscriptions (
  org_id uuid primary key references organizations(id) on delete cascade,
  provider text not null default 'cashfree' check (provider in ('cashfree','razorpay','manual')),
  external_id text,                 -- Cashfree subscription_id
  plan text not null check (plan in ('basic','pro','business','custom')),
  status text not null default 'pending'
    check (status in ('pending','active','past_due','cancelled','trial')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  updated_at timestamptz default now()
);

-- ============================================================================
-- 4. Enable RLS on new tables
-- ============================================================================

alter table org_integrations    enable row level security;
alter table templates           enable row level security;
alter table approval_chains     enable row level security;
alter table notification_rules  enable row level security;
alter table audit_log_v2        enable row level security;
alter table subscriptions       enable row level security;

-- ============================================================================
-- 5. Policies for new tables
--    Pattern: orgadmin or superadmin can do anything inside their own org;
--    other roles can READ if they're part of the org, but can NOT write.
-- ============================================================================

-- Org integrations -----------------------------------------------------------
create policy org_integrations_read on org_integrations for select
  using (is_superadmin() or org_id = user_org_id());

create policy org_integrations_write on org_integrations for all
  using ((is_orgadmin() and org_id = user_org_id()) or is_superadmin())
  with check ((is_orgadmin() and org_id = user_org_id()) or is_superadmin());

-- Templates ------------------------------------------------------------------
create policy templates_read on templates for select
  using (is_superadmin() or org_id = user_org_id());

create policy templates_write on templates for all
  using ((is_orgadmin() and org_id = user_org_id()) or is_superadmin())
  with check ((is_orgadmin() and org_id = user_org_id()) or is_superadmin());

-- Approval chains ------------------------------------------------------------
create policy approval_chains_read on approval_chains for select
  using (is_superadmin() or org_id = user_org_id());

create policy approval_chains_write on approval_chains for all
  using ((is_orgadmin() and org_id = user_org_id()) or is_superadmin())
  with check ((is_orgadmin() and org_id = user_org_id()) or is_superadmin());

-- Notification rules ---------------------------------------------------------
create policy notification_rules_read on notification_rules for select
  using (is_superadmin() or org_id = user_org_id());

create policy notification_rules_write on notification_rules for all
  using ((is_orgadmin() and org_id = user_org_id()) or is_superadmin())
  with check ((is_orgadmin() and org_id = user_org_id()) or is_superadmin());

-- Audit log v2 — APPEND-ONLY -------------------------------------------------
-- Reads: anyone in the org (orgadmin sees everything, others scoped). Writes
-- go through a SECURITY DEFINER function only — direct INSERT/UPDATE/DELETE
-- is revoked.
create policy audit_log_v2_read_org on audit_log_v2 for select
  using (
    is_superadmin()
    or org_id = user_org_id()
    -- Project-level audit visibility for project members
    or project_id in (select user_project_ids())
  );

revoke insert, update, delete on audit_log_v2 from authenticated;

create or replace function record_audit_v2(
  p_action text,
  p_resource text,
  p_resource_id text,
  p_project_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_message text
) returns void
language plpgsql security definer as $$
declare v_profile public.profiles%rowtype;
        v_org uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'record_audit_v2 requires authenticated user';
  end if;
  select om.org_id into v_org from public.org_members om
    where om.profile_id = v_profile.id order by om.joined_at asc limit 1;
  insert into public.audit_log_v2(
    org_id, project_id, actor_id, actor_name, actor_role,
    action, resource, resource_id, before, after, message
  ) values (
    v_org, p_project_id, v_profile.id, v_profile.name, v_profile.role,
    p_action, p_resource, p_resource_id, p_before, p_after, p_message
  );
end;
$$;

-- Subscriptions --------------------------------------------------------------
create policy subscriptions_read on subscriptions for select
  using (is_superadmin() or org_id = user_org_id());

-- Only superadmin can directly edit subscriptions; the Cashfree webhook
-- handler uses service_role which bypasses RLS, so this is safe.
create policy subscriptions_write on subscriptions for all
  using (is_superadmin())
  with check (is_superadmin());

-- ============================================================================
-- 6. Org-admin overlays on EXISTING tables
--    Org admins can do everything an architect can — within their own org.
-- ============================================================================

create policy orgadmin_create_project on projects for insert
  with check (is_orgadmin()
              and org_id = user_org_id());

create policy orgadmin_update_project on projects for update
  using (is_orgadmin() and org_id = user_org_id());

-- Org admins can write to org_members (invite + role change inside their org).
create policy orgadmin_org_members on org_members for all
  using (is_orgadmin() and org_id = user_org_id())
  with check (is_orgadmin() and org_id = user_org_id());

-- Allow orgadmin to do everything an architect does on per-project tables.
create policy orgadmin_milestones on milestones for all
  using (is_orgadmin() and project_id in (select user_project_ids()))
  with check (is_orgadmin() and project_id in (select user_project_ids()));

create policy orgadmin_tasks on tasks for all
  using (is_orgadmin() and project_id in (select user_project_ids()))
  with check (is_orgadmin() and project_id in (select user_project_ids()));

create policy orgadmin_drawings on drawings for all
  using (is_orgadmin() and project_id in (select user_project_ids()))
  with check (is_orgadmin() and project_id in (select user_project_ids()));

create policy orgadmin_pos on purchase_orders for all
  using (is_orgadmin() and project_id in (select user_project_ids()))
  with check (is_orgadmin() and project_id in (select user_project_ids()));

create policy orgadmin_invoices on invoices for all
  using (is_orgadmin() and project_id in (select user_project_ids()))
  with check (is_orgadmin() and project_id in (select user_project_ids()));

create policy orgadmin_ra_bills on ra_bills for all
  using (is_orgadmin() and project_id in (select user_project_ids()))
  with check (is_orgadmin() and project_id in (select user_project_ids()));

create policy orgadmin_labour on labour_register for all
  using (is_orgadmin() and project_id in (select user_project_ids()))
  with check (is_orgadmin() and project_id in (select user_project_ids()));

-- ============================================================================
-- DONE — verify with 05_rls_phase1_tests.sql
-- ============================================================================
