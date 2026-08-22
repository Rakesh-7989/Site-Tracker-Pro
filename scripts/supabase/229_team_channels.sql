-- SiteTrack Pro — Teams P1: channels + threads + @mentions.
-- Run AFTER 228_org_multi_segment.sql. Idempotent.
--
-- Org-scoped team chat (Zoho Cliq / Teams style):
--   • `chat_channels`  — named channels per org (all active members participate).
--   • `chat_messages`  — messages in a channel; parent_id NULL = top-level,
--     non-NULL = thread reply (one level deep — replies-to-replies flatten to
--     the root via the BEFORE INSERT guard). reply_count is maintained by a
--     trigger so thread badges need no aggregate query.
--   • `mentions uuid[]` — profile ids parsed by the composer; an AFTER INSERT
--     trigger (`notify_chat_mentions`) fans out one notifications row per
--     mentioned member (sender excluded) with a deep link to the message.
--
-- RLS posture mirrors 161_crm_leads (org-scoped, user_org_ids()):
--   • channels: read/insert = any org member; update/delete = manager set.
--   • messages: read = any org member; insert = self (sender_id = auth.uid());
--     delete = own message or manager set. Append-only otherwise.

BEGIN;

-- ─── 1. chat_channels ────────────────────────────────────────────────────────
create table if not exists public.chat_channels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  description text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists idx_chat_channels_org on public.chat_channels(org_id);

-- ─── 2. chat_messages ────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  channel_id  uuid not null references public.chat_channels(id) on delete cascade,
  parent_id   uuid references public.chat_messages(id) on delete cascade,
  sender_id   uuid references auth.users(id) on delete set null,
  sender_name text not null default 'Member',
  body        text not null check (length(btrim(body)) between 1 and 4000),
  mentions    uuid[] not null default '{}',
  reply_count integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_chat_messages_channel on public.chat_messages(channel_id, created_at);
create index if not exists idx_chat_messages_parent on public.chat_messages(parent_id, created_at);
create index if not exists idx_chat_messages_mentions on public.chat_messages using gin(mentions);

-- ─── 3. Thread guard: same channel/org, replies flatten to the root ─────────
create or replace function public.chat_thread_guard()
returns trigger
language plpgsql
as $$
declare
  v_parent public.chat_messages;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into v_parent from public.chat_messages where id = new.parent_id;
  if v_parent.id is null then
    raise exception 'chat thread parent not found';
  end if;
  if v_parent.channel_id <> new.channel_id or v_parent.org_id <> new.org_id then
    raise exception 'chat thread parent must be in the same channel';
  end if;
  -- One-level threads: replying to a reply attaches to the root.
  if v_parent.parent_id is not null then
    new.parent_id := v_parent.parent_id;
  end if;
  if new.parent_id = new.id then
    raise exception 'chat message cannot be its own parent';
  end if;
  return new;
end $$;

drop trigger if exists trg_chat_thread_guard on public.chat_messages;
create trigger trg_chat_thread_guard
  before insert on public.chat_messages
  for each row execute function public.chat_thread_guard();

-- ─── 4. Reply counter ────────────────────────────────────────────────────────
create or replace function public.chat_bump_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is not null then
    update public.chat_messages
       set reply_count = reply_count + 1
     where id = new.parent_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_chat_bump_reply_count on public.chat_messages;
create trigger trg_chat_bump_reply_count
  after insert on public.chat_messages
  for each row execute function public.chat_bump_reply_count();

-- ─── 5. @mention fan-out → notifications ────────────────────────────────────
create or replace function public.notify_chat_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_name text;
  v_snippet      text;
  v_mentioned    uuid;
begin
  if new.mentions is null or cardinality(new.mentions) = 0 then
    return new;
  end if;
  select name into v_channel_name from public.chat_channels where id = new.channel_id;
  v_snippet := left(new.body, 140);
  foreach v_mentioned in array array(select distinct unnest(new.mentions)) loop
    if v_mentioned = new.sender_id then
      continue;
    end if;
    insert into public.notifications (user_id, org_id, kind, title, body, link)
    values (
      v_mentioned,
      new.org_id,
      'chat_mention',
      coalesce(new.sender_name, 'A member') || ' mentioned you in #' || coalesce(v_channel_name, 'channel'),
      v_snippet,
      '/teams?c=' || new.channel_id::text || '&m=' || new.id::text
    );
  end loop;
  return new;
end $$;

drop trigger if exists trg_notify_chat_mentions on public.chat_messages;
create trigger trg_notify_chat_mentions
  after insert on public.chat_messages
  for each row execute function public.notify_chat_mentions();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;

-- Channels: any member reads + creates; managers rename/archive/delete.
drop policy if exists chat_channels_read on public.chat_channels;
create policy chat_channels_read on public.chat_channels for select
  using (org_id = any(public.user_org_ids()));

drop policy if exists chat_channels_insert on public.chat_channels;
create policy chat_channels_insert on public.chat_channels for insert
  with check (org_id = any(public.user_org_ids()));

drop policy if exists chat_channels_update on public.chat_channels;
create policy chat_channels_update on public.chat_channels for update
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
  )
  with check (org_id = any(public.user_org_ids()));

drop policy if exists chat_channels_delete on public.chat_channels;
create policy chat_channels_delete on public.chat_channels for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- Messages: org-member reads; self-inserts; own-or-manager deletes.
drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select
  using (org_id = any(public.user_org_ids()));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert
  with check (
    org_id = any(public.user_org_ids())
    and sender_id = auth.uid()
  );

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      sender_id = auth.uid()
      or is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ─── Grants ──────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.chat_channels to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;
revoke all on public.chat_channels from anon;
revoke all on public.chat_messages from anon;

COMMIT;
