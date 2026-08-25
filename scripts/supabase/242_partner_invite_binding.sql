-- 242_partner_invite_binding.sql
-- Follow-up to 241: the HOST cannot look up another org's id (organizations
-- RLS is own-org-only by design), so an invite CODE cannot pre-bind the
-- partner firm. Bind at REDEMPTION instead:
--   - org_id becomes NULLABLE while status='invited' ("awaiting redemption")
--   - uniqueness applies only to BOUND links (project+org both known)
--   - accept_project_partner_invite() gains p_org_id so multi-org admins pick
--     which of their orgs redeems the code.

alter table public.project_partner_orgs alter column org_id drop not null;

drop index if exists uq_project_partner_orgs;
create unique index if not exists uq_ppo_bound_unique
  on public.project_partner_orgs(project_id, org_id)
  where org_id is not null;

-- One pending invite per (project, scope) is plenty — prevent code spam while
-- allowing several scopes to be offered simultaneously.
create unique index if not exists uq_ppo_pending_scope
  on public.project_partner_orgs(project_id, scope)
  where status = 'invited' and org_id is null;

create or replace function public.accept_project_partner_invite(p_code text, p_org_id uuid default null)
returns table (project_id uuid, org_id uuid, project_name text)
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_row   public.project_partner_orgs%rowtype;
  v_org   uuid := p_org_id;
  v_count int;
begin
  select * into v_row
  from public.project_partner_orgs
  where invite_code = p_code and status = 'invited'
  limit 1;

  if v_row.id is null then
    raise exception 'invalid-or-used-invite-code' using errcode = 'P0002';
  end if;

  -- Resolve the redeeming org when the caller belongs to exactly one;
  -- otherwise the caller MUST name it.
  if v_org is null then
    select count(*) into v_count
    from public.org_members m
    where m.profile_id = auth.uid() and m.status = 'active' and m.removed_at is null;
    if v_count > 1 then
      raise exception 'choose-which-org-redeems' using errcode = '22023';
    end if;
    select m.org_id into v_org
    from public.org_members m
    where m.profile_id = auth.uid() and m.status = 'active' and m.removed_at is null
    limit 1;
  end if;

  if v_org is null then
    raise exception 'no-active-org' using errcode = '22023';
  end if;

  -- Caller must be an ADMIN of the org they are binding.
  if not public.has_org_tier(v_org, 'admin') then
    raise exception 'only-the-partner-org-admin-can-accept' using errcode = '42501';
  end if;

  -- Already a partner on this project?
  if exists (
    select 1 from public.project_partner_orgs
    where project_id = v_row.project_id and org_id = v_org and status = 'active'
  ) then
    raise exception 'already-a-partner' using errcode = '23505';
  end if;

  update public.project_partner_orgs
  set status = 'active',
      accepted_at = now(),
      org_id = v_org,
      org_name_snapshot = coalesce(
        org_name_snapshot,
        (select o.name from public.organizations o where o.id = v_org)
      )
  where id = v_row.id;

  -- The accepting admin joins as the first partner member.
  insert into public.project_partner_members (project_id, org_id, profile_id, role, added_by)
  values (v_row.project_id, v_org, auth.uid(), 'partner_manager', auth.uid())
  on conflict (project_id, org_id, profile_id) do nothing;

  return query
  select v_row.project_id,
         v_org,
         (select p.name from public.projects p where p.id = v_row.project_id);
end;
$fn$;

grant execute on function public.accept_project_partner_invite(text, uuid) to authenticated;
revoke execute on function public.accept_project_partner_invite(text, uuid) from anon;

do $$
begin
  raise notice '242 partner invites: unbound-pending model live (bind-at-redemption)';
end $$;
