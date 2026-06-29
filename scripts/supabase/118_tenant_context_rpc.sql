-- SiteTrack Pro — Tenant context RPC for defense-in-depth.
--
-- Provides a SECURITY DEFINER function that sets the active org_id and
-- role into PostgreSQL session variables. Edge Functions call this before
-- running multi-step business logic so RLS policies can additionally
-- check `current_setting('app.org_id')` for cross-tenant defense.
--
-- Browser client usage:
--   await sb.rpc("set_tenant_context", { p_org_id: activeOrgId });
--
-- Run after 117_security_harden_search_path.sql. Idempotent.

create or replace function public.set_tenant_context(p_org_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
  raise notice '118_tenant_context_rpc: set_tenant_context(uuid) created';
end $$;
