-- SiteTrack Pro — B6 white-label subdomains (P-G1).
-- Adds organizations.subdomain (unique nullable) + a SECURITY DEFINER RPC that
-- resolves a white-label subdomain → org id + public branding row for PRE-AUTH
-- use (landing / login surfaces). The RPC bypasses RLS as the function owner and
-- returns only safe, non-sensitive fields. Authenticated callers reuse it for
-- the post-auth active-org auto-switch (returns org_id they can join-filter).
-- Idempotent.

alter table public.organizations
  add column if not exists subdomain text;

-- Unique on non-null subdomains (Postgres treats NULLs as distinct, so plain
-- UNIQUE already allows multiple NULLs — but a partial index makes intent +
-- lookup explicit and fast).
create unique index if not exists uniq_organizations_subdomain
  on public.organizations(subdomain)
  where subdomain is not null;

create or replace function public.resolve_org_by_subdomain(p_subdomain text)
returns table (
  org_id     uuid,
  org_name   text,
  org_slug   text,
  logo_url   text,
  tagline    text,
  accent     text,
  theme      text
)
language sql stable security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.slug,
    b.logo_url,
    b.tagline,
    b.accent,
    b.theme
  from public.organizations o
  left join lateral (
    select b2.logo_url, b2.tagline, b2.accent, b2.theme
      from public.branding b2
     where b2.org_id = o.id
       and b2.project_id is null
     order by b2.updated_at desc
     limit 1
  ) b on true
  where lower(o.subdomain) = lower(btrim(coalesce(p_subdomain, '')))
  limit 1;
$$;

-- Grants: anon (pre-auth landing branding) + authenticated (post-auth switch).
revoke all on function public.resolve_org_by_subdomain(text) from public;
grant execute on function public.resolve_org_by_subdomain(text) to anon, authenticated;

-- Org-admin write path for organizations.subdomain (base RLS is superadmin-only).
-- SECURITY DEFINER: orgadmin/superadmin of the org may set/clear its own subdomain.
create or replace function public.set_org_subdomain(p_org_id uuid, p_subdomain text)
returns table (ok boolean, reason text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_norm text;
begin
  if not (public.is_superadmin() or (public.is_orgadmin() and p_org_id = public.user_org_id())) then
    return query select false, 'forbidden';
    return;
  end if;
  v_norm := nullif(lower(btrim(coalesce(p_subdomain, ''))), '');
  if v_norm is not null and v_norm !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    return query select false, 'invalid-subdomain';
    return;
  end if;
  update public.organizations
     set subdomain = v_norm
   where id = p_org_id;
  return query select true, 'ok';
end;
$$;

revoke all on function public.set_org_subdomain(uuid, text) from public;
grant execute on function public.set_org_subdomain(uuid, text) to authenticated;

do $$ declare n int; begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'organizations'
     and column_name = 'subdomain';
  raise notice '199_org_subdomain: subdomain column present (1/0 = %), RPCs resolve_org_by_subdomain + set_org_subdomain ready.', n;
end $$;
