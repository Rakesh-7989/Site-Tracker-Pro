-- 243_drop_old_accept_overload.sql
-- Migration 242 added accept_project_partner_invite(text, uuid); the original
-- (text) overload from 241 is ambiguous for untyped callers ("function is not
-- unique") and no longer used by the app. Drop it.

drop function if exists public.accept_project_partner_invite(text);

do $$
begin
  raise notice '243 single accept_project_partner_invite(text, uuid) remains';
end $$;
