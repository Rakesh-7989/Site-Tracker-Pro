-- 109_staff_owner_approval_repair.sql
-- Repair existing platform owner/head rows so signup approvals pass both UI
-- and Edge Function auth gates. Safe to re-run.

begin;

update public.profiles p
set role = 'superadmin',
    is_staff = true,
    staff_tier = 'owner',
    staff_manager_id = null
from auth.users u
where u.id = p.id
  and lower(u.email) = 'boyapatirakesh7777@gmail.com';

update public.profiles p
set role = 'superadmin',
    is_staff = true,
    staff_tier = 'head',
    staff_manager_id = (select id from auth.users where lower(email) = 'boyapatirakesh7777@gmail.com')
from auth.users u
where u.id = p.id
  and lower(u.email) = 'boyapatirakesh.mahespaddy@gmail.com';

do $$ begin
  raise notice '109_staff_owner_approval_repair: owner/head promoted to platform staff';
end $$;

commit;
