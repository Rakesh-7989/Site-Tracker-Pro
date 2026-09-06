-- 256_lifecycle_events.sql
-- Phase 2.1 (END_TO_END_PLAN_PRINCIPAL_SDE.md): project lifecycle transitions
-- must leave two durable traces — an immutable audit row and an outbox event
-- fanned out to project members.
--
-- Migration 223 already enforces the lifecycle boundary (which transitions are
-- legal, who may archive/restore). This migration adds a SEPARATE AFTER UPDATE
-- trigger that records the outcome of every *legal* transition:
--
--   1. audit_log_v2   — one row per transition (action 'UPDATE', resource
--                       'project', before/after = {status, archived_at},
--                       message describing the change, actor context).
--   2. event_outbox   — one row per transition (type project.status_changed |
--                       project.archived | project.restored, payload with
--                       { kind, title, body, link, project_id,
--                         to_project_members: true }) consumed by the
--                       deliver_outbox_events worker (migration 208) which
--                       creates a notification per active project member.
--
-- Design notes:
--   * The guard trigger (223, BEFORE UPDATE OF status, archived_at) is left
--     untouched. Illegal/archival transitions raise there, so this AFTER
--     trigger only ever sees legal changes.
--   * SECURITY DEFINER + pinned search_path: authenticated has no direct write
--     grants on audit_log_v2/event_outbox (only RPC/worker paths write), so the
--     trigger writes as the owner. search_path is pinned for the
--     check-security-definer CI gate.
--   * Audit insert is durable (never swallowed). The outbox insert is wrapped
--     in BEGIN..EXCEPTION so a delivery-side/notify failure can never roll back
--     the transition itself (mirrors the 208 swallow posture).
--   * Uses CHECK-legal action 'UPDATE' (current set includes UPDATE) — no
--     constraint change needed.
--   * project_id + to_project_members:true is the exact fan-out contract
--     deliver_outbox_events reads (payload ? 'project_id' and
--     (payload->>'to_project_members')::boolean).

begin;

create or replace function public.record_project_lifecycle_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind       text;
  v_title      text;
  v_body       text;
  v_link       text;
  v_msg        text;
  v_actor_name text;
  v_actor_role text;
begin
  if new.status is not distinct from old.status
     and new.archived_at is not distinct from old.archived_at then
    return new;
  end if;

  if new.status is distinct from old.status then
    v_msg  := format('Project status changed: %s -> %s', old.status, new.status);
    v_kind := 'project.status_changed';
    v_title := format('Project "%s" changed to %s', new.name, new.status);
  elsif new.archived_at is not null then
    v_msg  := 'Project archived';
    v_kind := 'project.archived';
    v_title := format('Project "%s" archived', new.name);
  else
    v_msg  := 'Project restored from archive';
    v_kind := 'project.restored';
    v_title := format('Project "%s" restored', new.name);
  end if;

  v_body := v_msg;
  v_link := '/projects/' || new.id::text;

  -- Best-effort actor context (null when backend/cron/service paths run).
  if auth.uid() is not null then
    select coalesce(name, 'A team member'), coalesce(role, 'member')
      into v_actor_name, v_actor_role
      from public.profiles
     where id = auth.uid();
  end if;

  -- 1) Durable audit record (append-only; immutability guarded by mig 100).
  insert into public.audit_log_v2 (
    org_id, project_id, actor_id, actor_name, actor_role,
    action, resource, resource_id, before, after, message, ts
  ) values (
    new.org_id, new.id, auth.uid(), v_actor_name, v_actor_role,
    'UPDATE', 'project', new.id::text,
    jsonb_build_object('status', old.status, 'archived_at', old.archived_at),
    jsonb_build_object('status', new.status, 'archived_at', new.archived_at),
    v_msg, now()
  );

  -- 2) Outbox event for project members — best-effort, never breaks the
  --    transition itself.
  begin
    insert into public.event_outbox (type, org_id, project_id, payload)
    values (
      v_kind, new.org_id, new.id,
      jsonb_build_object(
        'kind',               v_kind,
        'title',              v_title,
        'body',               v_body,
        'link',               v_link,
        'project_id',         new.id::text,
        'to_project_members', true
      )
    );
  exception when others then
    null; -- swallow: delivery is a separate concern from the boundary
  end;

  return new;
end $$;

drop trigger if exists trg_projects_lifecycle_events on public.projects;
create trigger trg_projects_lifecycle_events
  after update of status, archived_at on public.projects
  for each row execute function public.record_project_lifecycle_events();

do $$
begin
  if (select count(*) from pg_trigger
       where tgrelid = 'public.projects'::regclass
         and tgname = 'trg_projects_lifecycle_events') <> 1 then
    raise exception 'record_project_lifecycle_events trigger missing';
  end if;
  raise notice 'migration 256 ok: trg_projects_lifecycle_events installed (row_count = %)',
    (select count(*) from pg_trigger
      where tgrelid = 'public.projects'::regclass
        and tgname = 'trg_projects_lifecycle_events');
end $$;

commit;