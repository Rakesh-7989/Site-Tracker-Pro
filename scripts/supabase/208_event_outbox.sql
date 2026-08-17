-- SiteTrack Pro — VNext P1.3: durable event outbox.
--
-- Replaces the in-memory `src/lib/eventBus.ts` with a transactional outbox:
-- business code writes (via the SECURITY DEFINER `publish_event` RPC) the
-- event row in the SAME transaction as its domain write; a pg_cron worker
-- (`deliver_outbox_events`) drains pending rows into inboxes/notifications.
--
-- Event model:
--   event_outbox.id          — uuid
--   event_outbox.type        — e.g. 'org.broadcast' (the ad-hoc broadcast
--                              call site replaced here), 'invoice.generated',
--                              'quote.accepted', 'corrective_action.opened' (P2.3)
--   event_outbox.org_id      — org scope (RLS + delivery fan-out)
--   event_outbox.project_id  — optional project scope (nullable)
--   event_outbox.entity_type — optional domain entity (nullable)
--   event_outbox.entity_id   — optional domain entity id (nullable)
--   event_outbox.payload     — jsonb: { kind, title?, body?, link?,
--                              placeholders?, user_ids?, project_id? }
--   event_outbox.status      — pending | delivered | failed
--   event_outbox.attempts    — retry counter (max before 'failed')
--
-- Delivery worker handles:
--   1. type = 'org.broadcast' — fan out to every active org member, mirroring
--      the old send_org_notification (188) title/body template fallback.
--   2. payload.user_ids [] — explicit recipient list (one notification each).
--   3. payload.project_id + to_project_members — fan out to active members of
--      the project.
--
-- RLS: read = org/project member (same posture as workflow_instances, 207);
-- writes happen ONLY through publish_event / the SECURITY DEFINER worker, so
-- no direct insert/update/delete policies are granted to members.
--
-- Run after 207_workflow_engine.sql. Idempotent.

BEGIN;

-- ── 1. event_outbox ────────────────────────────────────────────────────────
create table if not exists public.event_outbox (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  org_id      uuid references public.organizations(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  entity_type text,
  entity_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending'
              check (status in ('pending', 'delivered', 'failed')),
  attempts    int  not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists idx_event_outbox_status
  on public.event_outbox(status, created_at);
create index if not exists idx_event_outbox_org
  on public.event_outbox(org_id);

-- ── 2. RLS (read = member; no member writes) ───────────────────────────────
alter table public.event_outbox enable row level security;

drop policy if exists event_outbox_select on public.event_outbox;
create policy event_outbox_select on public.event_outbox
  for select to authenticated
  using (
    (org_id is null or org_id = any(user_org_ids()))
    and (project_id is null or public.can_read_project(project_id))
  );

-- ── 3. publish_event() — transactional insert, member-gated ───────────────
create or replace function public.publish_event(
  p_type       text,
  p_org_id     uuid,
  p_payload    jsonb default '{}'::jsonb,
  p_project_id uuid default null,
  p_entity_type text default null,
  p_entity_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_org_id is not null and not (p_org_id = any(user_org_ids())) then
    raise exception 'publish_event: caller is not a member of org %', p_org_id;
  end if;
  if p_project_id is not null and not public.can_read_project(p_project_id) then
    raise exception 'publish_event: caller cannot read project %', p_project_id;
  end if;

  insert into public.event_outbox (type, org_id, project_id, entity_type, entity_id, payload)
  values (p_type, p_org_id, p_project_id, p_entity_type, p_entity_id,
          coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.publish_event(text, uuid, jsonb, uuid, text, uuid) to authenticated;
revoke all on function public.publish_event(text, uuid, jsonb, uuid, text, uuid) from anon;

-- ── 4. deliver_outbox_events() — worker, service_role/cron only ────────────
create or replace function public.deliver_outbox_events(
  p_limit int default 100
)
returns table (
  event_id  uuid,
  outcome   text,
  detail    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_recipients uuid[];
  v_user uuid;
  v_project_id uuid;
  v_kind text;
  v_title text;
  v_body text;
  v_link text;
  v_payload jsonb;
  v_err text;
begin
  for v_row in
    select id, type, org_id, project_id, payload
      from public.event_outbox
     where status = 'pending'
     order by created_at
     limit p_limit
  loop
    v_payload := coalesce(v_row.payload, '{}'::jsonb);
    event_id := v_row.id;
    begin
      -- Resolve recipients + copy for this event type.
      v_recipients := '{}'::uuid[];
      v_kind  := v_row.type;
      v_title := coalesce(v_payload->>'title', v_row.type);
      v_body  := coalesce(v_payload->>'body', 'You have a new update from SiteTrack Pro.');
      v_link  := coalesce(v_payload->>'link', '#');

      if v_row.type = 'org.broadcast' then
        -- Fan out to every active org member (mirror of 188).
        select array_agg(distinct om.profile_id) into v_recipients
          from public.org_members om
         where om.org_id = v_row.org_id
           and om.status = 'active'
           and om.removed_at is null;
      elsif v_payload ? 'user_ids' then
        v_recipients := ARRAY(
          select x::uuid from jsonb_array_elements_text(v_payload->'user_ids') x
        );
      elsif v_payload ? 'project_id' and (v_payload->>'to_project_members')::boolean = true then
        select array_agg(distinct pm.profile_id) into v_recipients
          from public.project_members pm
         where pm.project_id = (v_payload->>'project_id')::uuid
           and pm.removed_at is null;
      end if;

      -- Create one inbox row per recipient (notifications_insert RLS allows
      -- service_role bypass; trigger trg_notify_deliver pushes email next).
      foreach v_user in array v_recipients loop
        if v_row.project_id is not null then
          v_project_id := v_row.project_id;
        else
          select pm.project_id into v_project_id
            from public.project_members pm
           where pm.profile_id = v_user and pm.removed_at is null
           limit 1;
        end if;

        perform public.create_payment_notification(
          v_user, v_project_id, v_row.org_id, v_kind, v_title, v_body, v_link
        );
      end loop;

      update public.event_outbox
         set status = 'delivered', delivered_at = now()
       where id = v_row.id;
      outcome := 'delivered';
      detail  := format('recipients=%s', array_length(v_recipients, 1));
    exception when others then
      v_err := sqlerrm;
      if v_row.attempts + 1 >= 5 then
        update public.event_outbox
           set status = 'failed', attempts = attempts + 1, error = v_err
         where id = v_row.id;
        outcome := 'failed';
      else
        update public.event_outbox
           set attempts = attempts + 1, error = v_err
         where id = v_row.id;
        outcome := 'retry';
      end if;
      detail := v_err;
    end;
    return next;
  end loop;
  return;
end $$;

-- Only service_role may invoke the worker (pg_cron runs as postgres = owner).
revoke all on function public.deliver_outbox_events(int) from public;
grant execute on function public.deliver_outbox_events(int) to service_role;

-- ── 5. Per-minute cron schedule (idempotent — same job name replaces) ──────
select cron.schedule(
  'deliver-event-outbox',
  '* * * * *',
  'select public.deliver_outbox_events()'
);

-- ── 6. Grants + verification notice ────────────────────────────────────────
grant select on public.event_outbox to authenticated;
revoke all on public.event_outbox from anon;

DO $$ DECLARE
  e int; f int; c int;
BEGIN
  select count(*) into e from public.event_outbox;
  select count(*) into f from information_schema.routines where routine_name = 'publish_event';
  select count(*) into c from information_schema.routines where routine_name = 'deliver_outbox_events';
  RAISE NOTICE '208_event_outbox: rows=%, publish_event=%, deliver_outbox_events=%', e, f, c;
END $$;

COMMIT;
