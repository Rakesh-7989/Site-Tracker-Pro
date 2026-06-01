-- SiteTrack Pro — Org invitation flow (Session 29).
-- Run AFTER 36_custom_plan_lock.sql. Idempotent.
--
-- Implements Points 6+7:
--   "Org admin nuchi aa org lo unde role ani org admin ey create chegali"
--   "Ala create chesina role aa paathi role ki mail through verify
--    chesukuna thravatha org loki add avutharu"
--
-- Flow:
--   1. Org admin clicks "Invite" in Org Admin → Members
--   2. Frontend RPC `create_org_invitation(email, role)` inserts a row
--      with a random 64-char token + 48h expiry.
--   3. Frontend sends magic-link via Supabase Auth with redirect
--      `/?invite=<token>`.
--   4. New user clicks link → completes Supabase signup (no firm_name in
--      metadata, so trigger 34 creates a plain profile, not an org).
--   5. Frontend reads `?invite=<token>` from URL → calls
--      `accept_org_invitation(token)` → user gets added to org_members
--      with the invited role.

create table if not exists public.org_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  email        text not null,
  role         text not null,
  invited_by   uuid references public.profiles(id) on delete set null,
  token        text not null unique default encode(gen_random_bytes(32), 'hex'),
  status       text not null default 'pending'
    check (status in ('pending','accepted','expired','cancelled')),
  expires_at   timestamptz not null default (now() + interval '48 hours'),
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz default now()
);

create index if not exists idx_org_invitations_org_status
  on public.org_invitations(org_id, status);
create index if not exists idx_org_invitations_email_pending
  on public.org_invitations(lower(email))
  where status = 'pending';

alter table public.org_invitations enable row level security;

-- Read: org_members + super_admin only.
drop policy if exists invitations_read on public.org_invitations;
create policy invitations_read on public.org_invitations for select
  using (is_superadmin() or org_id = user_org_id());

-- Write (create / cancel): only orgadmin + super_admin.
drop policy if exists invitations_write on public.org_invitations;
create policy invitations_write on public.org_invitations for all
  using ((is_orgadmin() and org_id = user_org_id()) or is_superadmin())
  with check ((is_orgadmin() and org_id = user_org_id()) or is_superadmin());

-- ════════════════════════════════════════════════════════════════════
-- RPC 1 — create an invitation (called from Org Admin → Members → Invite)
-- ════════════════════════════════════════════════════════════════════
create or replace function public.create_org_invitation(
  p_email text,
  p_role text
) returns table(ok boolean, invitation_id uuid, token text, reason text)
language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_inv public.org_invitations%rowtype;
begin
  v_org_id := public.user_org_id();
  if v_org_id is null then
    ok := false; reason := 'caller-has-no-org'; return next; return;
  end if;
  if not public.is_orgadmin() and not public.is_superadmin() then
    ok := false; reason := 'caller-not-orgadmin'; return next; return;
  end if;

  -- Cancel any older pending invite to this email for this org.
  update public.org_invitations
    set status = 'cancelled'
    where org_id = v_org_id
      and lower(email) = lower(p_email)
      and status = 'pending';

  insert into public.org_invitations(org_id, email, role, invited_by)
    values (v_org_id, lower(trim(p_email)), p_role, auth.uid())
    returning * into v_inv;

  ok := true; invitation_id := v_inv.id; token := v_inv.token;
  return next;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- RPC 2 — accept an invitation (called by the new user after sign-in)
-- ════════════════════════════════════════════════════════════════════
create or replace function public.accept_org_invitation(p_token text)
returns table(ok boolean, org_id uuid, role text, reason text)
language plpgsql security definer as $$
declare
  v_inv public.org_invitations%rowtype;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    ok := false; reason := 'not-authenticated'; return next; return;
  end if;

  select * into v_inv from public.org_invitations where token = p_token;
  if v_inv.id is null then
    ok := false; reason := 'invitation-not-found'; return next; return;
  end if;
  if v_inv.status <> 'pending' then
    ok := false; reason := format('invitation-already-%s', v_inv.status);
    return next; return;
  end if;
  if v_inv.expires_at < now() then
    update public.org_invitations set status = 'expired' where id = v_inv.id;
    ok := false; reason := 'invitation-expired'; return next; return;
  end if;

  -- Link to org_members (trigger 35 enforces user quota here).
  insert into public.org_members(org_id, profile_id, role)
    values (v_inv.org_id, v_uid, v_inv.role)
    on conflict do nothing;

  -- Upgrade the profile role if they were just a client.
  update public.profiles set role = v_inv.role
    where id = v_uid and role in ('client', 'member');

  update public.org_invitations
    set status = 'accepted', accepted_at = now(), accepted_by = v_uid
    where id = v_inv.id;

  -- Audit trail.
  insert into public.audit_log_v2(org_id, actor_id, action, resource, resource_id, message)
    values (v_inv.org_id, v_uid, 'CREATE', 'org_member', v_uid::text,
            format('User accepted invite to role %s', v_inv.role));

  ok := true; org_id := v_inv.org_id; role := v_inv.role;
  return next;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Cleanup helper — call from cron to expire stale invites.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.expire_stale_invitations()
returns int language sql as $$
  with expired as (
    update public.org_invitations
       set status = 'expired'
     where status = 'pending'
       and expires_at < now()
     returning 1
  )
  select count(*)::int from expired;
$$;

do $$ declare n int; begin
  select count(*) into n from public.org_invitations where status = 'pending';
  raise notice '37_org_invitations: ready. % pending invitation(s).', n;
end $$;
