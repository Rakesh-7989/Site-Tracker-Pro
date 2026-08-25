-- 246_partner_read_arm.sql
-- C1 completion:
--  1) user_project_ids() gains an ACTIVE-PARTNER union arm so every child
--     table already gated by it (drawings, DPRs, calendar, storage folders…)
--     becomes readable to partner-org members. Host "assigned-only" semantics
--     are unchanged (the arm only matches rows of project_partner_orgs).
--  2) audit_project_partner_change() now emits audit-legal actions
--     (CREATE/UPDATE/DELETE — the audit_log_v2_action_check vocabulary),
--     with the partner detail carried in `message` as before.

create or replace function public.user_project_ids()
returns setof uuid
language sql
stable security definer
set search_path = 'public'
as $fn$
  -- Superadmins: every project
  SELECT p.id FROM public.projects p
    WHERE public.is_superadmin()
  UNION
  -- Directly assigned project members (active, not removed)
  SELECT project_id FROM public.project_members
    WHERE profile_id = auth.uid() AND removed_at IS NULL
  UNION
  -- Org-tier admins see all projects in their orgs (role='admin' OR is_admin),
  -- matching the app's memberProjectScope isOrgWide rule for any identity role.
  SELECT p.id FROM public.projects p
    WHERE EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = p.org_id
        AND om.profile_id = auth.uid()
        AND om.status = 'active'
        AND om.removed_at IS NULL
        AND (om.role = 'admin' OR om.is_admin)
    )
  UNION
  -- Clients see projects matching their email
  SELECT p.id FROM public.projects p
    WHERE current_role_text() = 'client'
      AND p.client_email = current_email()
  UNION
  -- Cross-org partners (241): members of an ACTIVE partner org read the
  -- shared project. Org-level gate first — revocation blinds instantly.
  SELECT ppo.project_id FROM public.project_partner_orgs ppo
    WHERE ppo.status = 'active'
      AND ppo.org_id = ANY(public.user_org_ids())
$fn$;

create or replace function public.audit_project_partner_change()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
  v_org     uuid := coalesce(new.org_id, old.org_id);
  v_host    uuid;
begin
  select p.org_id into v_host from public.projects p where p.id = v_project;

  insert into public.audit_log_v2
    (org_id, project_id, actor_id, actor_name, actor_role, action, resource, resource_id, message, after, ts)
  values
    (v_host, v_project, auth.uid(),
     coalesce((select name from public.profiles where id = auth.uid()), 'system'),
     'partner_admin',
     case tg_op when 'INSERT' then 'CREATE' when 'UPDATE' then 'UPDATE' else 'DELETE' end,
     'project_partner_org',
     coalesce(new.id, old.id)::text,
     format('Partner org %s %s (scope=%s, status=%s)',
            v_org,
            case tg_op when 'INSERT' then 'invited' when 'UPDATE' then 'updated' else 'revoked' end,
            coalesce(new.scope, old.scope),
            coalesce(new.status, old.status)),
     case when tg_op = 'DELETE' then null else to_jsonb(new) end,
     now());
  return coalesce(new, old);
end;
$fn$;

do $$
begin
  raise notice '246 partner read arm in user_project_ids + audit-legal actions';
end $$;
