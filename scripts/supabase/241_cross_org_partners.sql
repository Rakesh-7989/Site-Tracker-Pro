-- 241_cross_org_partners.sql
-- Cross-organization project collaboration — C1 substrate (the moat).
--
-- A HOST org invites PARTNER FIRMS (each with their own SiteTrack org) onto a
-- project. Partners gain READ access via a new can_read_project OR-arm; write
-- capabilities stay host-only in C1 (financials untouched, host-only).
--
-- Security posture:
--  - Org-level gate FIRST: revoking the partner org revokes ALL its members
--    instantly (can_read_project checks project_partner_orgs.status='active').
--  - No RLS recursion: policies on the new tables never call can_read_project;
--    they scope on user_org_ids()/has_org_tier directly.
--  - Cross-org discovery stays impossible (organizations RLS unchanged):
--    invites use a one-time invite CODE; the partner-org admin redeems it via
--    accept_project_partner_invite() (SECURITY DEFINER), which snapshots the
--    partner org name for host-side display and audits the grant.
--  - Every grant/scope-change/revoke lands in audit_log_v2 (mig 100 immutable).

-- ── Tables ────────────────────────────────────────────────────────────────
create table if not exists public.project_partner_orgs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  scope             text not null default 'viewer'
                      check (scope in ('viewer', 'contributor', 'manager')),
  status            text not null default 'invited'
                      check (status in ('invited', 'active', 'revoked')),
  invite_code       text unique,
  org_name_snapshot text,
  invited_by        uuid references public.profiles(id) on delete set null,
  invited_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now()
);

create unique index if not exists uq_project_partner_orgs
  on public.project_partner_orgs(project_id, org_id);
create index if not exists idx_ppo_org_active
  on public.project_partner_orgs(org_id) where status = 'active';

create table if not exists public.project_partner_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'partner_member',
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, org_id, profile_id)
);

create index if not exists idx_ppm_profile
  on public.project_partner_members(profile_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.project_partner_orgs enable row level security;
alter table public.project_partner_members enable row level security;

-- ppo SELECT: host-org members see all partners of their project; partner-org
-- members see their own link.
drop policy if exists ppo_select on public.project_partner_orgs;
create policy ppo_select on public.project_partner_orgs for select to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.org_id = any(public.user_org_ids())
  )
  or org_id = any(public.user_org_ids())
);

-- ppo INSERT: host org admins only (invite).
drop policy if exists ppo_insert on public.project_partner_orgs;
create policy ppo_insert on public.project_partner_orgs for insert to authenticated
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and public.has_org_tier(p.org_id, 'admin')
  )
);

-- ppo UPDATE: host admins manage scope/status; partner-org admins may ONLY
-- flip their own invited→revoked (decline). WITH CHECK keeps host edits sane.
drop policy if exists ppo_update on public.project_partner_orgs;
create policy ppo_update on public.project_partner_orgs for update to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and public.has_org_tier(p.org_id, 'admin')
  )
  or (
    org_id = any(public.user_org_ids())
    and public.has_org_tier(org_id, 'admin')
    and status = 'invited'
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and public.has_org_tier(p.org_id, 'admin')
  )
  or (
    org_id = any(public.user_org_ids())
    and public.has_org_tier(org_id, 'admin')
    and status = 'revoked'
  )
);

-- ppo DELETE: host admins only (revoke).
drop policy if exists ppo_delete on public.project_partner_orgs;
create policy ppo_delete on public.project_partner_orgs for delete to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and public.has_org_tier(p.org_id, 'admin')
  )
);

-- ppm: members of the host org OR the SAME partner org (whose link must be
-- active) can read the membership roster.
drop policy if exists ppm_select on public.project_partner_members;
create policy ppm_select on public.project_partner_members for select to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.org_id = any(public.user_org_ids())
  )
  or (
    org_id = any(public.user_org_ids())
    and exists (
      select 1 from public.project_partner_orgs link
      where link.project_id = project_partner_members.project_id
        and link.org_id = project_partner_members.org_id
        and link.status = 'active'
    )
  )
);

-- ppm writes: host admins, plus MANAGER-scope partner admins managing their
-- own people.
drop policy if exists ppm_insert on public.project_partner_members;
create policy ppm_insert on public.project_partner_members for insert to authenticated
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and public.has_org_tier(p.org_id, 'admin')
  )
  or (
    org_id = any(public.user_org_ids())
    and public.has_org_tier(org_id, 'admin')
    and exists (
      select 1 from public.project_partner_orgs link
      where link.project_id = project_partner_members.project_id
        and link.org_id = project_partner_members.org_id
        and link.status = 'active'
        and link.scope = 'manager'
    )
  )
);

drop policy if exists ppm_delete on public.project_partner_members;
create policy ppm_delete on public.project_partner_members for delete to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and public.has_org_tier(p.org_id, 'admin')
  )
  or (
    org_id = any(public.user_org_ids())
    and public.has_org_tier(org_id, 'admin')
    and exists (
      select 1 from public.project_partner_orgs link
      where link.project_id = project_partner_members.project_id
        and link.org_id = project_partner_members.org_id
        and link.status = 'active'
        and link.scope = 'manager'
    )
  )
);

grant select, insert, update, delete on public.project_partner_orgs to authenticated;
grant select, insert, delete on public.project_partner_members to authenticated;
revoke all on public.project_partner_orgs from anon;
revoke all on public.project_partner_members from anon;

-- ── Audit trail (immutable audit_log_v2, mig 100) ─────────────────────────
create or replace function public.audit_project_partner_change()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
  v_org     uuid := coalesce(new.org_id, old.org_id);
  v_host    uuid;
begin
  select p.org_id into v_host from public.projects p where p.id = v_project;

  insert into public.audit_log_v2
    (org_id, project_id, actor_id, actor_name, actor_role, action, resource, resource_id, message, after, ts)
  values
    (v_host, v_project, auth.uid(),
     coalesce((select name from public.profiles where id = auth.uid()), 'system'),
     'partner_admin',
     case tg_op
       when 'INSERT' then 'project_partner.granted'
       when 'UPDATE' then 'project_partner.updated'
       else 'project_partner.revoked'
     end,
     'project_partner_org',
     coalesce(new.id, old.id)::text,
     format('Partner org %s %s (scope=%s, status=%s)',
            v_org,
            case tg_op when 'INSERT' then 'invited' when 'UPDATE' then 'updated' else 'revoked' end,
            coalesce(new.scope, old.scope),
            coalesce(new.status, old.status)),
     case when tg_op = 'DELETE' then null else to_jsonb(new) end,
     now());
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists trg_audit_project_partner on public.project_partner_orgs;
create trigger trg_audit_project_partner
after insert or update or delete on public.project_partner_orgs
for each row execute function public.audit_project_partner_change();

-- ── can_read_project: ONE additive OR-arm (the careful part) ──────────────
-- Active partner-org membership grants READ. Writes stay governed by the
-- untouched can_write_project() → partners are read-only in C1.
create or replace function public.can_read_project(p_project_id uuid)
returns boolean
language sql
stable security definer
set search_path = 'public'
as $fn$
  SELECT
    public.is_superadmin()
    OR EXISTS (SELECT 1 FROM public.projects p
               WHERE p.id = p_project_id AND p.org_id = ANY(public.user_org_ids()))
    OR (NOT public.is_vendor() AND EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = p_project_id AND pm.profile_id = auth.uid() AND pm.removed_at IS NULL
        ))
    OR EXISTS (
          SELECT 1 FROM public.project_partner_orgs ppo
          WHERE ppo.project_id = p_project_id
            AND ppo.status = 'active'
            AND ppo.org_id = ANY(public.user_org_ids())
        );
$fn$;

-- ── Accept RPC (definer): partner-org admin redeems an invite code ────────
create or replace function public.accept_project_partner_invite(p_code text)
returns table (project_id uuid, org_id uuid, project_name text)
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_row public.project_partner_orgs%rowtype;
begin
  select * into v_row
  from public.project_partner_orgs
  where invite_code = p_code and status = 'invited'
  limit 1;

  if v_row.id is null then
    raise exception 'invalid-or-used-invite-code' using errcode = 'P0002';
  end if;

  -- Caller must be an ADMIN of the INVITED org (active membership).
  if not public.has_org_tier(v_row.org_id, 'admin') then
    raise exception 'only-the-partner-org-admin-can-accept' using errcode = '42501';
  end if;

  update public.project_partner_orgs
  set status = 'active',
      accepted_at = now(),
      org_name_snapshot = coalesce(
        org_name_snapshot,
        (select o.name from public.organizations o where o.id = v_row.org_id)
      )
  where id = v_row.id;

  -- The accepting admin joins as the first partner member (manager of their lane).
  insert into public.project_partner_members (project_id, org_id, profile_id, role, added_by)
  values (v_row.project_id, v_row.org_id, auth.uid(), 'partner_manager', auth.uid())
  on conflict (project_id, org_id, profile_id) do nothing;

  return query
  select v_row.project_id,
         v_row.org_id,
         (select p.name from public.projects p where p.id = v_row.project_id);
end;
$fn$;

grant execute on function public.accept_project_partner_invite(text) to authenticated;
revoke execute on function public.accept_project_partner_invite(text) from anon;

do $$
begin
  raise notice '241 cross-org partners: tables+RLS live, can_read_project partner arm ON';
end $$;
