-- 245_accept_rpc_conflict_target.sql
-- plpgsql substitutes variables even inside ON CONFLICT index-inference
-- lists, so the OUT param `project_id` made `(project_id, org_id,
-- profile_id)` ambiguous. Qualify against the table.

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

  if not public.has_org_tier(v_org, 'admin') then
    raise exception 'only-the-partner-org-admin-can-accept' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.project_partner_orgs existing
    where existing.project_id = v_row.project_id
      and existing.org_id = v_org
      and existing.status = 'active'
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

  -- The earlier status UPDATE row-locks the link, so concurrent re-redemption
  -- serializes before this point; an explicit guard replaces ON CONFLICT
  -- (whose bare column list collided with the OUT params).
  if not exists (
    select 1
    from public.project_partner_members existing_member
    where existing_member.project_id = v_row.project_id
      and existing_member.org_id = v_org
      and existing_member.profile_id = auth.uid()
  ) then
    insert into public.project_partner_members
      (project_id, org_id, profile_id, role, added_by)
    values (v_row.project_id, v_org, auth.uid(), 'partner_manager', auth.uid());
  end if;

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
  raise notice '245 accept RPC on-conflict target table-qualified';
end $$;
