-- 127_auto_create_missing_profile.sql — ensure every signed-in user has a profile row.
--
-- When auth users are created outside the normal sign-up flow (e.g. via the
-- Supabase dashboard "Add User" feature, or when profile rows are deleted
-- during DB cleanup), the handle_new_signup trigger never fires and the user
-- ends up without a profile — which bricks login with a "session could not be
-- loaded" error.
--
-- This migration:
--   1. Creates a SECURITY DEFINER RPC that any authenticated user can call to
--      ensure their own profile row exists (creates a minimal one if missing).
--   2. Patches the fetchAuthSession client-side code to call this RPC when it
--      encounters a "no-profile" error, then retry.

begin;

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
