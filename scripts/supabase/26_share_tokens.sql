-- SiteTrack Pro — Public share tokens (client portal + drawing share links).
-- Run AFTER 25_billing_telemetry.sql. Idempotent.
--
-- Backs the ClientShareView / "share this drawing" links. Token-based access
-- bypasses RLS; instead we route through a SECURITY DEFINER reader that takes
-- the token + scope and returns ONLY the rows it grants.

create table if not exists share_tokens (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  project_id    uuid references projects(id) on delete cascade,
  scope         text not null check (scope in (
    'project_summary','drawing','ra_bill','client_portal','dashboard'
  )),
  target_kind   text,                                       -- e.g. 'drawing' for scope='drawing'
  target_id     uuid,                                       -- e.g. drawings.id
  token         text not null unique,                       -- url-safe random 32 bytes
  password_hash text,                                       -- optional pin/password (bcrypt)
  expires_at    timestamptz,
  max_views     int,
  view_count    int default 0,
  last_viewed_at timestamptz,
  revoked_at    timestamptz,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now()
);

create index if not exists idx_share_tokens_token on share_tokens(token);
create index if not exists idx_share_tokens_org on share_tokens(org_id);
-- Session 28.1: Postgres index predicates require IMMUTABLE functions.
-- now() is STABLE, not IMMUTABLE, so we only filter by `revoked_at` in the
-- predicate. The expires-at check happens at query time via the
-- validate_share_token() function below.
create index if not exists idx_share_tokens_active
  on share_tokens(project_id, scope)
  where revoked_at is null;

alter table share_tokens enable row level security;

-- Org members can read their org's tokens (to revoke / audit).
create policy share_tokens_read on share_tokens for select
  using (is_superadmin() or org_id = user_org_id());

-- Only orgadmin / project owners create tokens.
create policy share_tokens_write on share_tokens for all
  using (
    is_superadmin()
    or (is_orgadmin() and org_id = user_org_id())
    or (current_role_text() in ('pm','project_admin','project_head','architect')
        and project_id in (select user_project_ids()))
  )
  with check (
    is_superadmin()
    or (is_orgadmin() and org_id = user_org_id())
    or (current_role_text() in ('pm','project_admin','project_head','architect')
        and project_id in (select user_project_ids()))
  );

-- ============================================================================
-- Token validator — public endpoint, returns minimal payload only.
-- ============================================================================
create or replace function validate_share_token(p_token text)
returns table(org_id uuid, project_id uuid, scope text, target_kind text, target_id uuid)
language plpgsql security definer as $$
declare v share_tokens%rowtype;
begin
  select * into v from public.share_tokens where token = p_token;
  if v.id is null then return; end if;
  if v.revoked_at is not null then return; end if;
  if v.expires_at is not null and v.expires_at < now() then return; end if;
  if v.max_views is not null and v.view_count >= v.max_views then return; end if;
  -- Bump view_count + last_viewed_at lazily; ignore race.
  update public.share_tokens set view_count = view_count + 1, last_viewed_at = now() where id = v.id;
  org_id := v.org_id; project_id := v.project_id; scope := v.scope;
  target_kind := v.target_kind; target_id := v.target_id;
  return next;
end;
$$;

do $$ declare n int; begin
  select count(*) into n from share_tokens where revoked_at is null;
  raise notice '26_share_tokens: ready. % active token(s).', n;
end $$;
