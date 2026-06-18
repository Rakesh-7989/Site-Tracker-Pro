-- 99_staff_hierarchy.sql — platform staff hierarchy + single-use staff invites.
--
-- Model (founder spec, 2026-06-08):
--   Owner  →  Staff Head  →  Staff Member
--   - Owner  = boyapatirakesh7777@gmail.com (root; nobody above)
--   - Head   = boyapatirakesh.mahespaddy@gmail.com
--   - Members joined ONLY via a single-use invite (block-by-default signup).
--   - Orgs a staff creates are attributed to them (organizations.created_by_staff).
--   - Enterprise signup requests can be routed to a specific staff.
--
-- All staff keep role='superadmin' (full platform access); staff_tier adds the
-- hierarchy on top. Phase 1 = data + RLS + the create-invite RPC + seed. The
-- redeem-invite Edge Function + the /admin/staff UI land in later phases.

-- 1. profiles: tier + manager ------------------------------------------------
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_name='profiles' and column_name='staff_tier') then
    alter table public.profiles
      add column staff_tier text check (staff_tier in ('owner','head','member'));
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name='profiles' and column_name='staff_manager_id') then
    alter table public.profiles
      add column staff_manager_id uuid references public.profiles(id) on delete set null;
  end if;
end $$;

-- 2. organizations: attribution to the staff who created it ------------------
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_name='organizations' and column_name='created_by_staff') then
    alter table public.organizations
      add column created_by_staff uuid references public.profiles(id) on delete set null;
  end if;
end $$;

-- 3. signup_requests: enterprise routing ------------------------------------
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_name='signup_requests' and column_name='assigned_staff_id') then
    alter table public.signup_requests
      add column assigned_staff_id uuid references public.profiles(id) on delete set null;
  end if;
end $$;

-- 4. helper functions (SECURITY DEFINER → read own profile) ------------------
create or replace function public.current_staff_tier() returns text
  language sql stable security definer set search_path = public as $$
  select staff_tier from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_tier() = 'owner', false)
$$;

create or replace function public.is_staff_head_or_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_tier() in ('owner','head'), false)
$$;

-- 5. staff_invites — single-use tokens (the "unblock-once" control) ----------
create table if not exists public.staff_invites (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique default encode(gen_random_bytes(24),'hex'),
  email       text,                                   -- optional: lock to one address
  tier        text not null default 'member' check (tier in ('head','member')),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  used_by     uuid references public.profiles(id) on delete set null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  expires_at  timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now()
);
create index if not exists staff_invites_token_idx on public.staff_invites(token);

alter table public.staff_invites enable row level security;

drop policy if exists staff_invites_read on public.staff_invites;
create policy staff_invites_read on public.staff_invites for select
  using (public.is_staff_head_or_owner());

drop policy if exists staff_invites_write on public.staff_invites;
create policy staff_invites_write on public.staff_invites for all
  using (public.is_staff_head_or_owner())
  with check (public.is_staff_head_or_owner());

-- 6. create_staff_invite RPC (owner + head) ----------------------------------
create or replace function public.create_staff_invite(p_email text default null,
                                                       p_tier  text default 'member')
  returns public.staff_invites
  language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  if not public.is_staff_head_or_owner() then
    raise exception 'Only the staff head or owner can create staff invites' using errcode='42501';
  end if;
  if p_tier = 'head' and not public.is_staff_owner() then
    raise exception 'Only the owner can invite a staff head' using errcode='42501';
  end if;
  insert into public.staff_invites(email, tier, created_by)
    values (nullif(trim(p_email),''), coalesce(p_tier,'member'), auth.uid())
    returning * into inv;
  return inv;
end $$;

-- 7. seed current hierarchy + demote the test superadmin ---------------------
update public.profiles p set role='superadmin', is_staff=true, staff_tier='owner', staff_manager_id=null
  from auth.users u where u.id=p.id and lower(u.email)='boyapatirakesh7777@gmail.com';

update public.profiles p set role='superadmin', is_staff=true, staff_tier='head',
  staff_manager_id=(select id from auth.users where lower(email)='boyapatirakesh7777@gmail.com')
  from auth.users u where u.id=p.id and lower(u.email)='boyapatirakesh.mahespaddy@gmail.com';

-- remove the test superadmin's platform powers (keep the row; not a hard delete)
update public.profiles p set role='client', is_staff=false, staff_tier=null, staff_manager_id=null
  from auth.users u where u.id=p.id and lower(u.email)='test-superadmin@sitetrack.test';

grant execute on function public.create_staff_invite(text,text) to authenticated;
grant execute on function public.current_staff_tier() to authenticated;
grant execute on function public.is_staff_owner() to authenticated;
grant execute on function public.is_staff_head_or_owner() to authenticated;
