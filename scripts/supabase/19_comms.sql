-- SiteTrack Pro — Comms tables: messages + comments + notifications.
-- Run AFTER 18_checklists.sql. Idempotent.

-- ============================================================================
-- 1. Messages — in-app DM scoped to a project
-- ============================================================================
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  thread_id     uuid,                                       -- nullable; null = root msg
  sender_id     uuid references profiles(id) on delete set null,
  sender_name   text,
  body          text not null,
  attachments   jsonb default '[]'::jsonb,
  read_by       jsonb default '[]'::jsonb,                  -- [{user_id, read_at}]
  created_at    timestamptz default now()
);
create index if not exists idx_messages_project_time on messages(project_id, created_at desc);
create index if not exists idx_messages_thread on messages(thread_id) where thread_id is not null;
alter table messages enable row level security;
create policy messages_read on messages for select
  using (project_id in (select user_project_ids()));
create policy messages_insert on messages for insert
  with check (project_id in (select user_project_ids()) and sender_id = auth.uid());
-- Edits forbidden after send (immutable comm); deletes only by sender within 60s (app-enforced).
revoke update on messages from authenticated;

-- ============================================================================
-- 2. Comments — threaded on any entity (polymorphic)
-- ============================================================================
create table if not exists comments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  entity_type   text not null check (entity_type in (
    'site_update','issue','drawing','rfi','co','submittal','permit','po','ra_bill',
    'inspection','safety','boq','ledger','punch','milestone','task'
  )),
  entity_id     uuid not null,
  parent_id     uuid references comments(id) on delete cascade,
  author_id     uuid references profiles(id) on delete set null,
  author_name   text,
  body          text not null,
  edited_at     timestamptz,
  deleted_at    timestamptz,                                -- soft delete
  created_at    timestamptz default now()
);
create index if not exists idx_comments_entity on comments(entity_type, entity_id, created_at);
create index if not exists idx_comments_parent on comments(parent_id) where parent_id is not null;
alter table comments enable row level security;
create policy comments_read on comments for select
  using (project_id in (select user_project_ids()) and deleted_at is null);
create policy comments_insert on comments for insert
  with check (project_id in (select user_project_ids()) and author_id = auth.uid());
-- Only author can edit/soft-delete (handled by orgadmin override above).
create policy comments_edit_self on comments for update
  using (author_id = auth.uid() or is_orgadmin())
  with check (author_id = auth.uid() or is_orgadmin());

-- ============================================================================
-- 3. Notifications — per-user inbox
-- ============================================================================
create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  project_id    uuid references projects(id) on delete cascade,
  org_id        uuid references organizations(id) on delete cascade,
  kind          text not null,                              -- mention/approval_request/payment_made/...
  title         text not null,
  body          text,
  link          text,                                       -- in-app deep link
  read_at       timestamptz,
  delivered_at  timestamptz default now(),
  created_at    timestamptz default now()
);
create index if not exists idx_notifications_user_unread on notifications(user_id, read_at)
  where read_at is null;
create index if not exists idx_notifications_user_time on notifications(user_id, created_at desc);
alter table notifications enable row level security;
create policy notifications_read on notifications for select
  using (user_id = auth.uid() or is_superadmin());
create policy notifications_mark_read on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Inserts come from system (Edge Functions via service_role) or app code;
-- direct insert allowed for cross-user mentions inside a project the actor can see.
create policy notifications_insert on notifications for insert
  with check (
    is_superadmin()
    or project_id in (select user_project_ids())
    or org_id = user_org_id()
  );

do $$ declare a int; b int; c int; begin
  select count(*) into a from messages;
  select count(*) into b from comments;
  select count(*) into c from notifications;
  raise notice '19_comms: messages=%, comments=%, notifications=%', a, b, c;
end $$;
