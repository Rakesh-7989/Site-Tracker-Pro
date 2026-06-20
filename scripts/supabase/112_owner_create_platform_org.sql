-- SiteTrack Pro -- owner-created platform organizations (2026-06-20).
--
-- The platform Organizations screen needs an owner-only "New organization"
-- action. Direct table INSERT through PostgREST is brittle under RLS, so expose
-- a narrow SECURITY DEFINER RPC that validates the caller and creates one org.

begin;

create or replace function public.create_platform_org(p_name text, p_plan text default 'basic')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_plan text := nullif(trim(coalesce(p_plan, 'basic')), '');
  v_slug text;
  v_org public.organizations%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.profiles
     where id = v_uid
       and role = 'superadmin'
       and coalesce(is_staff, false) = true
       and staff_tier = 'owner'
  ) then
    raise exception 'only the owner can create organizations' using errcode = '42501';
  end if;

  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'Organization name is required.');
  end if;

  if not exists (select 1 from public.plans where id = v_plan) then
    return jsonb_build_object('ok', false, 'error', 'unknown plan: ' || coalesce(v_plan, ''));
  end if;

  v_slug := substring(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')) from 1 for 30);
  if v_slug = '' then v_slug := 'org'; end if;
  v_slug := v_slug || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);

  insert into public.organizations(slug, name, plan, created_by_staff)
  values (v_slug, v_name, v_plan, v_uid)
  returning * into v_org;

  return jsonb_build_object(
    'ok', true,
    'id', v_org.id,
    'name', v_org.name,
    'slug', v_org.slug,
    'plan', v_org.plan,
    'created_at', v_org.created_at
  );
end
$$;

grant execute on function public.create_platform_org(text, text) to authenticated;

comment on function public.create_platform_org(text, text) is
  'Owner-only: create a customer organization from the platform console.';

commit;
