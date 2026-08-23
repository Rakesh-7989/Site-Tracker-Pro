-- SiteTrack Pro — Chat: STRICT project-membership gates for streams.
-- Run AFTER 235_chat_p2.sql. Idempotent.
--
-- can_read_project() allows ANY same-org member to read any org project
-- (org-wide backstop). That is too broad for chat: streams must be limited
-- to the ASSIGNED team, per product requirement ("aa project lo vuna
-- vallathoni matladadam"). This recreates the readability rule and the lazy
-- stream RPC on top of an explicit project_members check.
--
-- Managers keep access via has_project_role / is_orgadmin regardless of an
-- explicit membership row, matching every other manager gate.

BEGIN;

create or replace function public.chat_is_project_member(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.profile_id = auth.uid()
      and pm.removed_at is null
  );
$$;

revoke all on function public.chat_is_project_member(uuid) from anon;
grant execute on function public.chat_is_project_member(uuid) to authenticated;

-- Readability: same matrix as 232, but project scope uses STRICT membership.
create or replace function public.chat_channel_readable(cc public.chat_channels)
returns boolean
language sql stable
as $$
  select case
    when cc.kind = 'dm'
      then public.chat_is_member(cc.id)
    when cc.scope = 'org' and cc.visibility = 'open'
      then cc.org_id = any(public.user_org_ids()) and public.chat_is_org_staff(cc.org_id)
    when cc.scope = 'org' and cc.visibility = 'managers'
      then cc.org_id = any(public.user_org_ids()) and public.chat_is_manager(cc.org_id, null)
    when cc.scope = 'org' and cc.visibility = 'private'
      then cc.org_id = any(public.user_org_ids()) and public.chat_is_member(cc.id)
    when cc.scope = 'project' and cc.visibility = 'open'
      then public.chat_is_project_member(cc.project_id)
    when cc.scope = 'project' and cc.visibility = 'managers'
      then public.chat_is_manager(null, cc.project_id)
    when cc.scope = 'project' and cc.visibility = 'private'
      then public.chat_is_project_member(cc.project_id) and public.chat_is_member(cc.id)
    else false
  end;
$$;

-- Lazy stream: still any ACTIVE PROJECT MEMBER may ensure it.
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
  if not public.can_read_project(p_project_id)
     or not public.chat_is_project_member(p_project_id) then
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

COMMIT;
