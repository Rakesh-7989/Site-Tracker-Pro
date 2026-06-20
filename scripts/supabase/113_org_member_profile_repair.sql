-- SiteTrack Pro -- repair missing profiles before org membership (2026-06-20).
--
-- Some early auth users exist without public.profiles rows. Approval creates an
-- org_members row for the applicant; without a profile row the FK fails. Repair
-- that invariant in the database so all invite/approval paths remain durable.

begin;

create or replace function public.ensure_profile_for_org_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
begin
  if new.profile_id is null then
    return new;
  end if;

  if exists (select 1 from public.profiles where id = new.profile_id) then
    return new;
  end if;

  select
    email,
    nullif(trim(coalesce(raw_user_meta_data->>'name', '')), '')
  into v_email, v_name
  from auth.users
  where id = new.profile_id;

  if v_email is not null then
    insert into public.profiles(id, name, role)
    values (new.profile_id, coalesce(v_name, split_part(v_email, '@', 1), 'SiteTrack user'), 'client')
    on conflict (id) do nothing;
  end if;

  return new;
end
$$;

drop trigger if exists trg_ensure_profile_for_org_member on public.org_members;
create trigger trg_ensure_profile_for_org_member
  before insert or update of profile_id on public.org_members
  for each row execute function public.ensure_profile_for_org_member();

comment on function public.ensure_profile_for_org_member() is
  'Repairs legacy auth users missing profiles before org_members FK checks.';

commit;
