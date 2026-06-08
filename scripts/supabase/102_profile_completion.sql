-- 102_profile_completion.sql — mandatory profile completion (every user, post sign-in).
-- Adds the profile fields a construction-SaaS user fills once, a profile_completed
-- gate flag, and a self-service RPC to save them.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='phone') then
    alter table public.profiles add column phone text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='company') then
    alter table public.profiles add column company text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='job_title') then
    alter table public.profiles add column job_title text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='city') then
    alter table public.profiles add column city text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='pref_language') then
    alter table public.profiles add column pref_language text default 'en';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='profile_completed') then
    alter table public.profiles add column profile_completed boolean not null default false;
  end if;
end $$;

-- Self-service: the signed-in user completes their own profile. SECURITY DEFINER
-- so it works regardless of the profiles UPDATE RLS; it only ever writes the
-- caller's own row (id = auth.uid()).
create or replace function public.complete_my_profile(
  p_name text,
  p_phone text,
  p_company text,
  p_job_title text default null,
  p_city text default null,
  p_language text default 'en'
) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null
     or nullif(trim(coalesce(p_phone,'')),'') is null
     or nullif(trim(coalesce(p_company,'')),'') is null then
    raise exception 'Name, mobile and company are required' using errcode = '23514';
  end if;
  update public.profiles set
    name = trim(p_name),
    phone = trim(p_phone),
    company = trim(p_company),
    job_title = nullif(trim(coalesce(p_job_title,'')),''),
    city = nullif(trim(coalesce(p_city,'')),''),
    pref_language = coalesce(nullif(trim(coalesce(p_language,'')),''),'en'),
    profile_completed = true
  where id = auth.uid();
  return found;
end $$;

grant execute on function public.complete_my_profile(text,text,text,text,text,text) to authenticated;

-- Pre-fill: the platform staff (owner/head) already have names; they still need
-- to complete (phone/company) once like everyone else, so leave them as-is.
-- Nothing is force-completed — every user completes their profile on next login.
