-- SiteTrack Pro — v4 Phase G2: construction quality — corrective actions.
-- Run AFTER 16_process_tables.sql (needs inspections). Idempotent.
--
-- Construction quality loop: when an inspection comes back **fail** or
-- **conditional**, a corrective action is auto-opened so the defect is
-- tracked to closure instead of getting lost in the register. Each action
-- carries a priority, assignee + due date, and a status ladder
-- open → in_progress → resolved → verified (closed) so QA can confirm the
-- fix landed.
--
-- RLS mirrors inspections (project-scoped): read = any project member;
-- write = the site-inspection manager set (pm, project_admin, project_head,
-- orgadmin, superadmin, site_inspector, consultant, principal_consultant).
-- The auto-open trigger runs SECURITY DEFINER (owner-level, search_path
-- pinned) so recording a failed result always spawns the action even when
-- the caller isn't in the write set.

BEGIN;

-- ── 1. corrective_actions ───────────────────────────────────────────────────
create table if not exists public.corrective_actions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete set null,
  description   text not null,
  priority      text not null default 'medium'
    check (priority in ('low','medium','high','critical')),
  status        text not null default 'open'
    check (status in ('open','in_progress','resolved','verified')),
  assigned_to   text,
  due_date      date,
  opened_by     uuid default auth.uid() references auth.users(id) on delete set null,
  opened_at     timestamptz not null default now(),
  verified_by   uuid references auth.users(id) on delete set null,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_corrective_project on public.corrective_actions(project_id, status);
create index if not exists idx_corrective_inspection on public.corrective_actions(inspection_id);

alter table public.corrective_actions enable row level security;

-- Read: any project member (incl. client) can view corrective actions.
drop policy if exists ca_read on public.corrective_actions;
create policy ca_read on public.corrective_actions for select
  using (project_id in (select public.user_project_ids()));

-- Insert: manager + inspector set (mirrors inspections_write roles).
drop policy if exists ca_insert on public.corrective_actions;
create policy ca_insert on public.corrective_actions for insert
  with check (
    project_id in (select public.user_project_ids())
    and current_role_text() in (
      'pm','project_admin','project_head','orgadmin','superadmin',
      'site_inspector','consultant','principal_consultant'
    )
  );

-- Update / delete: same manager + inspector set.
drop policy if exists ca_update on public.corrective_actions;
create policy ca_update on public.corrective_actions for update
  using (
    project_id in (select public.user_project_ids())
    and current_role_text() in (
      'pm','project_admin','project_head','orgadmin','superadmin',
      'site_inspector','consultant','principal_consultant'
    )
  )
  with check (
    project_id in (select public.user_project_ids())
    and current_role_text() in (
      'pm','project_admin','project_head','orgadmin','superadmin',
      'site_inspector','consultant','principal_consultant'
    )
  );

drop policy if exists ca_delete on public.corrective_actions;
create policy ca_delete on public.corrective_actions for delete
  using (
    project_id in (select public.user_project_ids())
    and current_role_text() in (
      'pm','project_admin','project_head','orgadmin','superadmin',
      'site_inspector','consultant','principal_consultant'
    )
  );

grant select, insert, update, delete on public.corrective_actions to authenticated;
revoke all on public.corrective_actions from anon;

-- ── 2. Auto-open trigger (fail / conditional → corrective action) ──────────
CREATE OR REPLACE FUNCTION public.auto_open_corrective_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desc  text;
  v_prio  text;
BEGIN
  IF NEW.result IN ('fail','conditional') THEN
    -- Skip if a corrective action already exists for this inspection.
    IF NOT EXISTS (
      SELECT 1 FROM public.corrective_actions
      WHERE inspection_id = NEW.id AND status <> 'verified'
    ) THEN
      v_desc := COALESCE(NULLIF(NEW.scope,''), NEW.type || ' inspection');
      v_prio := CASE WHEN NEW.result = 'fail' THEN 'high' ELSE 'medium' END;
      INSERT INTO public.corrective_actions (project_id, inspection_id, description, priority, opened_by)
      VALUES (NEW.project_id, NEW.id, v_desc, v_prio, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

drop trigger if exists trg_auto_open_corrective on public.inspections;
create trigger trg_auto_open_corrective
  after insert or update of result on public.inspections
  for each row execute function public.auto_open_corrective_action();

GRANT EXECUTE ON FUNCTION public.auto_open_corrective_action() TO authenticated;

-- ── 3. Org rollup RPC (open corrective actions across an org's projects) ───
CREATE OR REPLACE FUNCTION public.org_corrective_actions(p_org uuid)
RETURNS TABLE (
  id uuid, project_id uuid, project_name text, description text,
  priority text, status text, assigned_to text, due_date date, opened_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ca.id, ca.project_id, p.name, ca.description, ca.priority, ca.status,
         ca.assigned_to, ca.due_date, ca.opened_at
  FROM public.corrective_actions ca
  JOIN public.projects p ON p.id = ca.project_id
  WHERE p.org_id = p_org AND ca.status <> 'verified'
    AND (public.is_superadmin() OR p_org = ANY(public.user_org_ids()))
  ORDER BY ca.opened_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.org_corrective_actions(uuid) TO authenticated;
COMMENT ON FUNCTION public.org_corrective_actions(uuid) IS 'Open corrective actions across an org''s projects (quality rollup). Empty for non-members.';

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.corrective_actions;
  RAISE NOTICE '168_construction_quality: corrective_actions_rows=%', n;
END $$;

COMMIT;