-- SiteTrack Pro — Unified Chat: project streams + org channels + DMs (P1).
-- Run AFTER 231_promoter_digest_schedule.sql. Idempotent.
--
-- Extends migration 229's chat foundation into a Cliq-style model:
--
--   kind       'channel' | 'dm'
--   scope      'org' | 'project'            (dm implies org)
--   visibility 'open' | 'managers' | 'private'
--
--   ┌──────────────────────────────────────────────────────────────────┐
--   │ TYPE                    │ WHO SEES/POSTS                         │
--   ├──────────────────────────────────────────────────────────────────┤
--   │ org + open              │ org STAFF only (clients excluded —      │
--   │                         │ external parties never see org chatter) │
--   │ org + private           │ explicit members only                   │
--   │ org + managers          │ staff + manager role-set                │
--   │ project + open          │ active project members (clients incl.)  │
--   │ project + managers      │ project manager set only                │
--   │ project + private       │ project members ∩ explicit members      │
--   │ dm                      │ exactly its 2 members                   │
--   └──────────────────────────────────────────────────────────────────┘
--
-- Clients therefore live entirely in the "project world": their streams,
-- DMs with their project team. Org channels are staff-only.
-- "Who talks to a client" is governed by project membership, which the
-- project admin already controls — no separate chat permission layer.
--
-- ALSO: mention-notification deep links move /teams?c=… → /chat?c=…
-- (router keeps a /teams alias so old links still resolve).

BEGIN;

-- ─── 1. Channel typing ──────────────────────────────────────────────────────
alter table public.chat_channels
  add column if not exists kind text not null default 'channel';
alter table public.chat_channels
  add column if not exists scope text not null default 'org';
alter table public.chat_channels
  add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.chat_channels
  add column if not exists visibility text not null default 'open';
alter table public.chat_channels
  add column if not exists dm_key text;

-- Backfill existing rows (migration 229 era): all org-open channels.
update public.chat_channels set kind = 'channel', scope = 'org', visibility = 'open'
where kind is null or scope is null or visibility is null; -- no-op after first run

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_channels_kind_check'
  ) then
    alter table public.chat_channels
      add constraint chat_channels_kind_check
      check (kind in ('channel','dm'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'chat_channels_scope_check'
  ) then
    alter table public.chat_channels
      add constraint chat_channels_scope_check
      check (scope in ('org','project'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'chat_channels_visibility_check'
  ) then
    alter table public.chat_channels
      add constraint chat_channels_visibility_check
      check (visibility in ('open','managers','private'));
  end if;
end $$;

-- Shape rules: DMs are org-scoped pairs; project channels carry project_id;
-- plain channels never do.
alter table public.chat_channels drop constraint if exists chat_channels_shape_check;
alter table public.chat_channels add constraint chat_channels_shape_check check (
  (kind = 'dm' and scope = 'org' and dm_key is not null and project_id is null and visibility = 'open')
  or (kind = 'channel' and dm_key is null and (
        (scope = 'org' and project_id is null)
     or (scope = 'project' and project_id is not null))
  )
);

-- DM channels carry an EMPTY display name (client derives the other person's
-- name from membership) — exempt them from the 229 name-length check.
alter table public.chat_channels drop constraint if exists chat_channels_name_check;
alter table public.chat_channels add constraint chat_channels_name_check check (
  kind = 'dm' or length(btrim(name)) between 1 and 80
);

-- One DM conversation per unordered pair per org.
create unique index if not exists uq_chat_channels_dm_key
  on public.chat_channels(org_id, dm_key) where kind = 'dm';

-- Name uniqueness now applies ONLY to group channels (per org / per project);
-- DMs carry an empty display name and are keyed by dm_key instead.
alter table public.chat_channels drop constraint if exists chat_channels_org_id_name_key;
create unique index if not exists uq_chat_channels_org_name
  on public.chat_channels(org_id, name) where kind = 'channel' and scope = 'org';
create unique index if not exists uq_chat_channels_project_name
  on public.chat_channels(project_id, name) where kind = 'channel' and scope = 'project';

-- Fast lookups: project streams + my DMs/my memberships.
create index if not exists idx_chat_channels_project on public.chat_channels(project_id) where scope = 'project';
create index if not exists idx_chat_channels_kind on public.chat_channels(kind);

-- ─── 2. Explicit membership (DMs + private channels) ────────────────────────
create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  profile_id uuid not null references auth.users(id) on delete cascade,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);
create index if not exists idx_chat_channel_members_profile
  on public.chat_channel_members(profile_id);

alter table public.chat_channel_members enable row level security;
drop policy if exists ccm_read on public.chat_channel_members;
create policy ccm_read on public.chat_channel_members for select
  using (exists (
    select 1 from public.chat_channels cc
    where cc.id = channel_id and cc.org_id = any(public.user_org_ids())
  ));
drop policy if exists ccm_write on public.chat_channel_members;
create policy ccm_write on public.chat_channel_members for insert
  with check (exists (
    select 1 from public.chat_channels cc
    where cc.id = channel_id and cc.org_id = any(public.user_org_ids())
  ));
drop policy if exists ccm_delete on public.chat_channel_members;
create policy ccm_delete on public.chat_channel_members for delete
  using (profile_id = auth.uid());

grant select, insert, delete on public.chat_channel_members to authenticated;
revoke all on public.chat_channel_members from anon;

-- ─── 3. Access helpers ──────────────────────────────────────────────────────

-- Is caller a STAFF member of the channel's org (i.e. not a client)?
create or replace function public.chat_is_org_staff(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.org_members om
    join public.profiles pr on pr.id = om.profile_id
    where om.org_id = p_org_id
      and om.profile_id = auth.uid()
      and om.removed_at is null
      and om.status = 'active'
      and coalesce(pr.role,'') <> 'client'
  );
$$;

-- Explicit member?
create or replace function public.chat_is_member(p_channel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.chat_channel_members m
    where m.channel_id = p_channel_id and m.profile_id = auth.uid()
  );
$$;

-- Manager set (org tier + identity + superadmin).
create or replace function public.chat_is_manager(p_org_id uuid, p_project_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_org_id is not null and public.is_superadmin() then
    return true;
  end if;
  if p_org_id is not null and public.is_orgadmin() then
    return true;
  end if;
  if current_role_text() in ('pm','project_admin','superadmin') then
    return true;
  end if;
  if p_project_id is not null and public.has_project_role(p_project_id, 'pm','project_admin') then
    return true;
  end if;
  return false;
end $$;

-- Master readability rule (mirrors the matrix in the header comment).
create or replace function public.chat_channel_readable(cc public.chat_channels)
returns boolean
language sql stable
as $$
  select case
    -- DMs: members only.
    when cc.kind = 'dm'
      then public.chat_is_member(cc.id)
    -- Org channels: staff-only world.
    when cc.scope = 'org' and cc.visibility = 'open'
      then cc.org_id = any(public.user_org_ids()) and public.chat_is_org_staff(cc.org_id)
    when cc.scope = 'org' and cc.visibility = 'managers'
      then cc.org_id = any(public.user_org_ids()) and public.chat_is_manager(cc.org_id, null)
    when cc.scope = 'org' and cc.visibility = 'private'
      then cc.org_id = any(public.user_org_ids()) and public.chat_is_member(cc.id)
    -- Project channels: project membership is the base gate.
    when cc.scope = 'project' and cc.visibility = 'open'
      then public.can_read_project(cc.project_id)
    when cc.scope = 'project' and cc.visibility = 'managers'
      then public.can_read_project(cc.project_id)
           and public.chat_is_manager(null, cc.project_id)
    when cc.scope = 'project' and cc.visibility = 'private'
      then public.can_read_project(cc.project_id) and public.chat_is_member(cc.id)
    else false
  end;
$$;

-- ─── 4. RLS rebuild over the new model ─────────────────────────────────────

drop policy if exists chat_channels_read on public.chat_channels;
create policy chat_channels_read on public.chat_channels for select
  using (public.chat_channel_readable(chat_channels));

-- Creation: managers create group channels; DMs are created ONLY through the
-- chat_open_dm() SECURITY DEFINER RPC (direct dm inserts always fail).
drop policy if exists chat_channels_insert on public.chat_channels;
create policy chat_channels_insert on public.chat_channels for insert
  with check (
    kind = 'channel'
    and (
      (scope = 'org' and org_id = any(public.user_org_ids()) and public.chat_is_org_staff(org_id)
        and public.chat_is_manager(org_id, null))
      or
      (scope = 'project' and public.can_write_project(project_id)
        and public.chat_is_manager(null, project_id))
    )
  );

drop policy if exists chat_channels_update on public.chat_channels;
create policy chat_channels_update on public.chat_channels for update
  using (public.chat_is_manager(org_id, project_id))
  with check (public.chat_is_manager(org_id, project_id));

drop policy if exists chat_channels_delete on public.chat_channels;
create policy chat_channels_delete on public.chat_channels for delete
  using (public.chat_is_manager(org_id, project_id));

drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select
  using (exists (
    select 1 from public.chat_channels cc
    where cc.id = chat_messages.channel_id
      and public.chat_channel_readable(cc)
  ));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_channels cc
      where cc.id = chat_messages.channel_id
        -- readable base…
        and public.chat_channel_readable(cc)
        -- …plus posting rules: managers-visibility narrows posting further;
        -- open/private/dm follow readability (clients CAN post in their
        -- project streams; org channels already exclude them).
        and (
          cc.visibility <> 'managers'
          or public.chat_is_manager(cc.org_id, cc.project_id)
        )
    )
  );

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages for delete
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.chat_channels cc
      where cc.id = chat_messages.channel_id
        and public.chat_is_manager(cc.org_id, cc.project_id)
    )
  );

-- ─── 5. DM get-or-create RPC ───────────────────────────────────────────────
-- Shared-context rule: staff↔staff within the org is free; ANY client side of
-- the pair requires an ACTIVE shared project between the two users. Project
-- membership is the admin-controlled permission, exactly as requested.
create or replace function public.chat_open_dm(p_org_id uuid, p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_other    public.profiles;
  v_my_proj  uuid;
  v_key      text;
  v_chan     uuid;
begin
  if v_me is null or p_other is null or v_me = p_other then
    raise exception 'chat-dm-invalid-participants';
  end if;

  -- Both must be active members of the SAME org.
  if not exists (
    select 1 from public.org_members
    where org_id = p_org_id and profile_id = v_me and removed_at is null and status = 'active'
  ) or not exists (
    select 1 from public.org_members
    where org_id = p_org_id and profile_id = p_other and removed_at is null and status = 'active'
  ) then
    raise exception 'chat-dm-not-co-members';
  end if;

  select * into v_other from public.profiles where id = p_other;
  if v_other.id is null then
    raise exception 'chat-dm-not-co-members';
  end if;

  -- Client boundary: either side being a client requires a shared ACTIVE project.
  if coalesce(v_other.role,'') = 'client'
     or coalesce((select role from public.profiles where id = v_me),'') = 'client' then
    select mine.project_id into v_my_proj
    from public.project_members mine
    join public.project_members theirs
      on theirs.project_id = mine.project_id
     and theirs.profile_id = p_other
     and theirs.removed_at is null
    join public.projects p on p.id = mine.project_id and p.org_id = p_org_id
    where mine.profile_id = v_me and mine.removed_at is null
    limit 1;
    if v_my_proj is null then
      raise exception 'chat-dm-client-no-shared-project';
    end if;
  end if;

  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);

  select id into v_chan from public.chat_channels
  where org_id = p_org_id and kind = 'dm' and dm_key = v_key
  limit 1;

  if v_chan is null then
    insert into public.chat_channels (org_id, kind, scope, visibility, dm_key, name, created_by)
    values (p_org_id, 'dm', 'org', 'open', v_key, '', v_me)
    returning id into v_chan;

    insert into public.chat_channel_members (channel_id, profile_id, added_by)
    values (v_chan, v_me, v_me), (v_chan, p_other, v_me);
  elsif not exists (
    select 1 from public.chat_channel_members
    where channel_id = v_chan and profile_id = v_me
  ) then
    -- Self-heal membership if missing (definer path).
    insert into public.chat_channel_members (channel_id, profile_id, added_by)
    values (v_chan, v_me, v_me);
  end if;

  return v_chan;
end $$;

revoke all on function public.chat_open_dm(uuid, uuid) from anon;
grant execute on function public.chat_open_dm(uuid, uuid) to authenticated;

-- ─── 6. Lazy project-stream get-or-create ──────────────────────────────────
-- Any ACTIVE project member may ensure the stream exists; deterministic name
-- = project slug-ish title so re-runs collide into the same row.
create or replace function public.chat_ensure_project_stream(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proj   public.projects;
  v_chan   uuid;
  v_name   text;
  v_base   text;
  v_suffix int := 0;
begin
  if auth.uid() is null then
    raise exception 'chat-auth-required';
  end if;
  if not public.can_read_project(p_project_id) then
    raise exception 'chat-not-a-project-member';
  end if;

  select * into v_proj from public.projects where id = p_project_id;
  if v_proj.id is null then
    raise exception 'chat-project-not-found';
  end if;

  select id into v_chan from public.chat_channels
  where scope = 'project' and project_id = p_project_id and visibility = 'open'
  order by created_at asc limit 1;
  if v_chan is not null then
    return v_chan;
  end if;

  v_name := lower(regexp_replace(coalesce(v_proj.name,'project'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_name := btrim(v_name, '-');
  if v_name = '' or v_name is null then v_name := 'project'; end if;
  v_base := left(v_name, 60);

  loop
    begin
      insert into public.chat_channels (org_id, kind, scope, visibility, project_id, name, created_by)
      values (v_proj.org_id, 'channel', 'project', 'open', p_project_id,
              v_base || case when v_suffix > 0 then '-' || v_suffix::text else '' end,
              auth.uid())
      returning id into v_chan;
      exit;
    exception when unique_violation then
      v_suffix := v_suffix + 1;
      if v_suffix > 20 then
        raise exception 'chat-stream-name-exhausted';
      end if;
    end;
  end loop;

  return v_chan;
end $$;

revoke all on function public.chat_ensure_project_stream(uuid) from anon;
grant execute on function public.chat_ensure_project_stream(uuid) to authenticated;

-- ─── 7. Mention deep-links move to /chat ───────────────────────────────────
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
      coalesce(new.sender_name, 'A member') || ' mentioned you in #' || coalesce(nullif(v_channel_name,''),'chat'),
      v_snippet,
      '/chat?c=' || new.channel_id::text || '&m=' || new.id::text
    );
  end loop;
  return new;
end $$;

COMMIT;
