-- 127_auto_create_missing_profile.sql — ensure every signed-in user has a profile row.
--
-- When auth users are created outside the normal sign-up flow (e.g. via the
-- Supabase dashboard "Add User" feature, or when profile rows are deleted
-- during DB cleanup), the handle_new_signup trigger never fires and the user
-- ends up without a profile — which bricks login with a "session could not be
-- loaded" error.
--
-- Also adds the missing `is_admin` boolean column to `org_members` that the
-- codebase has been SELECTing since migration 59 but was never created.

begin;

-- Add the missing is_admin column that fetchAuthSession and org member queries
-- depend on. Safe to re-run (IF NOT EXISTS).
alter table public.org_members add column if not exists is_admin boolean not null default false;

-- Backfill: anyone with org_members.role = 'admin' gets is_admin = true.
-- Use a DO block so it's idempotent.
do $$ begin
  update public.org_members set is_admin = true where role = 'admin' and is_admin = false;
end $$;

-- SECURITY DEFINER RPC to create a minimal profile for any signed-in user who
-- lacks one (e.g. post-DB-cleanup or Dashboard-created users).
create or replace function public.ensure_my_profile()
  returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  v_user_email text;
  v_user_name  text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Already exists — nothing to do.
  if exists (select 1 from public.profiles where id = auth.uid()) then
    return true;
  end if;

  -- Derive a display name from the auth user's email.
  select email into v_user_email from auth.users where id = auth.uid();
  v_user_name := coalesce(
    nullif(trim(coalesce(auth.jwt()->>'name','')),''),
    split_part(coalesce(v_user_email, ''), '@', 1),
    'User'
  );

  insert into public.profiles (id, name, role, is_staff, staff_tier, profile_completed)
    values (auth.uid(), v_user_name, 'client', false, null, false)
    on conflict (id) do nothing;

  return true;
end;
$$;

grant execute on function public.ensure_my_profile() to authenticated;

commit;
