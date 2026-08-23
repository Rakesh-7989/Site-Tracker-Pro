-- SiteTrack Pro â€” Chat P2: reactions, read-states, @all, attachments.
-- Run AFTER 234_digest_due_email.sql. Idempotent.
--
--   â€¢ chat_message_reactions â€” one emoji per user per message (PK trio),
--     toggle semantics client-side; aggregated counts read via embed.
--   â€¢ chat_channel_reads     â€” last_read_at per userÃ—channel powering the
--     rail's unread badges via chat_unread_counts().
--   â€¢ chat_messages attachment columns (one file per message) + private
--     `chat-files` bucket, path <channel_id>/<uuid>-<name>, guarded by the
--     same channel access rules as posting/reading.
--   â€¢ chat_mention_all_ids() â€” managers-only RPC returning every eligible
--     recipient id for a channel (powers "@all" broadcasts).

BEGIN;

-- â”€â”€â”€ 1. Reactions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists idx_chat_reactions_msg on public.chat_message_reactions(message_id);

alter table public.chat_message_reactions enable row level security;
drop policy if exists chat_reactions_read on public.chat_message_reactions;
create policy chat_reactions_read on public.chat_message_reactions for select
  using (exists (
    select 1 from public.chat_messages cm
    join public.chat_channels cc on cc.id = cm.channel_id
    where cm.id = message_id and public.chat_channel_readable(cc)
  ));
drop policy if exists chat_reactions_write on public.chat_message_reactions;
create policy chat_reactions_write on public.chat_message_reactions for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.chat_messages cm
    join public.chat_channels cc on cc.id = cm.channel_id
    where cm.id = message_id and public.chat_channel_readable(cc)
  ));
drop policy if exists chat_reactions_delete on public.chat_message_reactions;
create policy chat_reactions_delete on public.chat_message_reactions for delete
  using (user_id = auth.uid());

grant select, insert, delete on public.chat_message_reactions to authenticated;
revoke all on public.chat_message_reactions from anon;

-- â”€â”€â”€ 2. Read states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.chat_channel_reads (
  channel_id   uuid not null references public.chat_channels(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table public.chat_channel_reads enable row level security;
drop policy if exists chat_reads_rw on public.chat_channel_reads;
create policy chat_reads_rw on public.chat_channel_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.chat_channel_reads to authenticated;
revoke all on public.chat_channel_reads from anon;

-- Unread counts per readable channel (messages newer than my cursor, not mine).
create or replace function public.chat_unread_counts()
returns table (channel_id uuid, unread int)
language sql stable security definer set search_path = public
as $$
  select cc.id,
         count(m.*)::int as unread
  from public.chat_channels cc
  join public.chat_messages m on m.channel_id = cc.id
  left join public.chat_channel_reads r
    on r.channel_id = cc.id and r.user_id = auth.uid()
  where public.chat_channel_readable(cc)
    and m.parent_id is null
    and coalesce(m.sender_id::text, '') <> auth.uid()::text
    and m.created_at > coalesce(r.last_read_at, to_timestamp(0))
  group by cc.id;
$$;

revoke all on function public.chat_unread_counts() from anon;
grant execute on function public.chat_unread_counts() to authenticated;

-- â”€â”€â”€ 3. @all recipients (managers-only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.chat_mention_all_ids(p_channel_id uuid)
returns table (profile_id uuid)
language plpgsql stable security definer set search_path = public
as $$
declare
  cc public.chat_channels;
begin
  select * into cc from public.chat_channels where id = p_channel_id;
  if cc.id is null then
    raise exception 'chat-channel-not-found';
  end if;
  if not public.chat_is_manager(cc.org_id, cc.project_id) then
    raise exception 'chat-all-managers-only';
  end if;

  if cc.kind = 'dm' then
    return query
      select m.profile_id from public.chat_channel_members m where m.channel_id = cc.id;
  elsif cc.scope = 'org' and cc.visibility = 'open' then
    -- Staff-only world: clients never receive org @all.
    return query
      select om.profile_id from public.org_members om
      join public.profiles pr on pr.id = om.profile_id
      where om.org_id = cc.org_id and om.removed_at is null and om.status = 'active'
        and coalesce(pr.role,'') <> 'client';
  elsif cc.scope = 'project' and cc.visibility = 'private' then
    -- Private project channels notify explicit members.
    return query
      select m.profile_id from public.chat_channel_members m where m.channel_id = cc.id;
  elsif cc.scope = 'project' then
    -- open + managers: every active project member.
    return query
      select pm2.profile_id from public.project_members pm2
      where pm2.project_id = cc.project_id and pm2.removed_at is null;
  else
    return query
      select m.profile_id from public.chat_channel_members m where m.channel_id = cc.id;
  end if;
end $$;

revoke all on function public.chat_mention_all_ids(uuid) from anon;
grant execute on function public.chat_mention_all_ids(uuid) to authenticated;

-- â”€â”€â”€ 4. Attachments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
alter table public.chat_messages
  add column if not exists attachment_path text;
alter table public.chat_messages
  add column if not exists attachment_name text;
alter table public.chat_messages
  add column if not exists attachment_mime text;
alter table public.chat_messages
  add column if not exists attachment_size bigint check (attachment_size is null or attachment_size >= 0);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files','chat-files', false, 26214400, null)
on conflict (id) do nothing;

-- Path contract: '<channel_id>/<uuid>-<filename>'
drop policy if exists chat_files_read on storage.objects;
create policy chat_files_read on storage.objects for select
  using (bucket_id = 'chat-files' and exists (
    select 1 from public.chat_channels cc
    where (storage.foldername(name))[1] = cc.id::text
      and public.chat_channel_readable(cc)
  ));

drop policy if exists chat_files_insert on storage.objects;
create policy chat_files_insert on storage.objects for insert
  with check (bucket_id = 'chat-files' and exists (
    select 1 from public.chat_channels cc
    where (storage.foldername(name))[1] = cc.id::text
      and public.chat_channel_readable(cc)
      and (cc.visibility <> 'managers' or public.chat_is_manager(cc.org_id, cc.project_id))
  ));

drop policy if exists chat_files_delete on storage.objects;
create policy chat_files_delete on storage.objects for delete
  using (bucket_id = 'chat-files' and exists (
    select 1 from public.chat_messages m
    where m.attachment_path = name
      and (m.sender_id = auth.uid()
           or exists (select 1 from public.chat_channels cc
                      where cc.id = m.channel_id and public.chat_is_manager(cc.org_id, cc.project_id)))
  ));

COMMIT;
