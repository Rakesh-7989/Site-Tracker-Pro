-- SiteTrack Pro — v4 Phase D4: statutory approvals / NOC register.
-- Run AFTER 151_ffe_schedules.sql. Idempotent.
--
-- statutory_approvals: the NOC / government-approval register a design or
-- built project must track (fire NOC, municipal sanction, environmental
-- clearance, electrical, labour, occupancy). Each entry carries the issuing
-- authority, reference no, application/decision dates and an expiry for
-- renewals.
--
-- Capability mapping:
--   statutory:manage  → create/edit/delete entries  → RLS: managers + org admin
--   (read-only for other project members / client)
--
-- This is intentionally a manager-write register (unlike FF&E, whose member
-- gate allows any non-external member to add rows): NOCs are legal documents,
-- so only managers + org admin may mutate them (mirrors 66_rls comment
-- "statutory_approvals (manager write) → statutory:manage").
--
-- Manager identity roles: pm, project_admin, design_head, consultant_head,
-- orgadmin, superadmin (mirrors permissions-matrix.ts statutory:manage).

BEGIN;

create table if not exists public.statutory_approvals (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  kind        text not null default 'other'
    check (kind in ('fire','municipal','environment','electrical','labour','occupancy','other')),
  title       text not null,
  authority   text,
  ref_no      text,
  applied_at  date,
  status      text not null default 'draft'
    check (status in ('draft','applied','approved','rejected','expired')),
  decision_at date,
  valid_until date,
  cost        bigint not null default 0 check (cost >= 0),
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_statutory_project on public.statutory_approvals(project_id, status);
create index if not exists idx_statutory_valid_until on public.statutory_approvals(valid_until) where valid_until is not null;

alter table public.statutory_approvals enable row level security;

-- Read: any project member (incl. client) can view the NOC register.
drop policy if exists statutory_approvals_read on public.statutory_approvals;
create policy statutory_approvals_read on public.statutory_approvals for select
  using (project_id in (select user_project_ids()));

-- Insert / update / delete: managers + org admin only (statutory:manage).
drop policy if exists statutory_approvals_insert on public.statutory_approvals;
create policy statutory_approvals_insert on public.statutory_approvals for insert
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

drop policy if exists statutory_approvals_update on public.statutory_approvals;
create policy statutory_approvals_update on public.statutory_approvals for update
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  )
  with check (project_id in (select user_project_ids()));

drop policy if exists statutory_approvals_delete on public.statutory_approvals;
create policy statutory_approvals_delete on public.statutory_approvals for delete
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

grant select, insert, update, delete on public.statutory_approvals to authenticated;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.statutory_approvals;
  RAISE NOTICE '152_statutory_approvals: statutory_approvals=%', n;
END $$;

COMMIT;