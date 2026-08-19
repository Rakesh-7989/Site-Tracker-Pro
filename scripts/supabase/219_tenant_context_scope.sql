-- SiteTrack Pro — 219_tenant_context_scope.sql (SEC-03, phase 1.4).
--
-- Bounds set_tenant_context(p_org_id) to orgs the caller is an ACTIVE member
-- of (user_org_ids()) or superadmin. Previously ANY authenticated user could
-- set app.org_id to an arbitrary org id — the documented cross-tenant
-- context primitive had no membership validation. Nothing in the repo reads
-- app.org_id today (grep confirms 118 is the only setter), so there is no live
-- exploit, but the primitive must not trust an unvalidated org id once edge
-- functions / policies consume current_setting('app.org_id').
--
-- Fail-closed: non-member + non-superadmin → raise 42501. The frontend
-- setTenantContext() call already swallows RPC errors (tenantContext.ts), and
-- the active org is always one of the user's memberships, so the gate cannot
-- break the app; superadmin keeps cross-tenant flexibility for platform EFs.
--
-- Idempotent (CREATE OR REPLACE). Grants unchanged from 118.

create or replace function public.set_tenant_context(p_org_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is not null and not (
    public.is_superadmin()
    or p_org_id = any(public.user_org_ids())
  ) then
    raise exception 'set_tenant_context: not an active member of org %', p_org_id
      using errcode = '42501';
  end if;
  if p_org_id is not null then
    perform set_config('app.org_id', p_org_id::text, true);
  end if;
  perform set_config('app.role', public.current_role_text(), true);
end;
$$;

-- Grant usage so the anon key (authenticated role) can call it.
-- Only authenticated users may set the tenant context.
revoke execute on function public.set_tenant_context(uuid) from public, anon;
grant execute on function public.set_tenant_context(uuid) to authenticated;

-- Verify
do $$ begin
  raise notice '219_tenant_context_scope: set_tenant_context(uuid) membership-gated';
end $$;