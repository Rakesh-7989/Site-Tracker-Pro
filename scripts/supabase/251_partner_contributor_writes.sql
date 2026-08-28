-- SiteTrack Pro — C2: partner contributor lane writes.
-- Viewer (read-only, C1) stays; contributor/manager gain scoped writes in
-- their own lane: site updates, tasks, issues, drawings + comment pins.
-- Financial / admin tables (projects, invoices, budgets, payments, ra_bills,
-- po_receipts, etc.) stay host-only — no change.
--
-- RLS is additive: the existing v3_write_* policies (can_write_project) stay;
-- we add a parallel v3_partner_write_* policy per table gated by
-- partner_can_write_project(). Host semantics untouched.

BEGIN;

-- Helper: does the caller belong to a partner org with contributor/manager scope?
create or replace function public.partner_can_write_project(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.project_partner_orgs ppo
    where ppo.project_id = p_project_id
      and ppo.org_id = any(public.user_org_ids())
      and ppo.status = 'active'
      and ppo.scope in ('contributor','manager')
  );
$$;

grant execute on function public.partner_can_write_project(uuid) to authenticated, anon;
comment on function public.partner_can_write_project(uuid) is 'C2: caller is a partner org member with contributor/manager scope on the project (active link).';

-- Tables that define the contributor lane. Each gets a parallel write policy;
-- the existing can_write_project policy remains for host members.
do $$
declare t text;
begin
  foreach t in array array['site_updates','tasks','issues','drawings','drawing_comments'] loop
    execute format('drop policy if exists %I on public.%I', 'v3_partner_write_'||t, t);
    -- drawings uses project_id, others use project_id or drawing_id indirection?
    -- drawing_comments is project-indirect via drawing_id -> drawings.project_id,
    -- so we gate it via a sub-select. Handle the two shapes.
    if t = 'drawing_comments' then
      execute format(
        $f$create policy %I on public.%I for all
            using (exists (select 1 from public.drawings d where d.id = drawing_id and public.partner_can_write_project(d.project_id)))
            with check (exists (select 1 from public.drawings d where d.id = drawing_id and public.partner_can_write_project(d.project_id)))$f$,
        'v3_partner_write_'||t, t
      );
    else
      execute format(
        'create policy %I on public.%I for all using (public.partner_can_write_project(project_id)) with check (public.partner_can_write_project(project_id))',
        'v3_partner_write_'||t, t
      );
    end if;
  end loop;
end $$;

-- Chat: project streams already gated by chat_is_project_member() (strict).
-- For C2, a contributor should be able to post in the project's main stream
-- and reply in threads. Add a partner arm to chat_messages insert.
-- The existing chat_messages_insert policy checks sender_id = auth.uid() and
-- channel readability via chat_channel_readable(). We keep that, but the
-- underlying channel readability already includes partner via can_read_project
-- (which now includes partner). For writes, we extend the channel check to
-- allow partner contributor/manager.
-- Instead of altering the existing policy (which is complex), we add a
-- permissive partner insert policy that mirrors the existing checks but
-- allows partner_can_write_project for project-scoped channels.
do $$
begin
  -- Only if the chat table exists (it does, mig 232)
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='chat_messages') then
    execute 'drop policy if exists chat_messages_partner_insert on public.chat_messages';
    execute $p$
      create policy chat_messages_partner_insert on public.chat_messages for insert
      with check (
        sender_id = auth.uid()
        and exists (
          select 1 from public.chat_channels cc
          where cc.id = chat_messages.channel_id
            and public.partner_can_write_project(cc.project_id)
        )
      )
    $p$;
  end if;
end $$;

do $$ begin raise notice '251_partner_contributor_writes: contributor lane (site_updates/tasks/issues/drawings/comments + chat) live'; end $$;

COMMIT;
