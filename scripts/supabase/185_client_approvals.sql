-- SiteTrack Pro — v5 Phase B1: Client Approval & Revision System.
-- Run AFTER 184_platform_users_active.sql. Idempotent.
--
-- The research "killer feature": Figma-style drawing review with x/y comment
-- pins, a revision chain per drawing, client approve/reject with a captured
-- digital signature + final lock, guarded project share-links (password/otp /
-- expiry / revocation / max-views / download restriction), and a fix for the
-- never-created `handover_signatures` table.
--
-- Capability mapping (permissions-matrix.ts + 66_rls_role_catalog_sync.sql):
--   drawing:comment  → place/resolve drawing comment pins    → RLS: any project member
--   drawing:approve  → approve/reject/lock + request review  → RLS: managers + org admin
--   share:link:manage→ create/revoke project share links     → RLS: managers + org admin
-- The client identity may READ released drawings (legacy rule, 149) and may
-- COMMENT on them (they are the reviewer); they do not edit drawings/links.
--
-- Public access to share links is handled ONLY through the SECURITY DEFINER
-- RPCs below (token gate + creds + expiry/revocation/views) — never through a
-- table SELECT by anon.

BEGIN;

-- pgcrypto for bcrypt share-link password hashing (crypt / gen_salt).
create extension if not exists pgcrypto;

-- ── 1. drawings: revision chain + client approval state ─────────────────────
alter table public.drawings
  add column if not exists parent_id uuid references public.drawings(id) on delete set null,
  add column if not exists change_note text,
  add column if not exists author_id uuid references public.profiles(id) on delete set null,
  add column if not exists approval_status text not null default 'not_requested'
    check (approval_status in ('not_requested','pending','approved','rejected','locked')),
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists signature text;

create index if not exists idx_drawings_parent on public.drawings(parent_id) where parent_id is not null;
create index if not exists idx_drawings_approval on public.drawings(project_id, approval_status);

-- ── 2. drawing_comments: Figma-style x/y pins + thread replies ───────────────
create table if not exists public.drawing_comments (
  id          uuid primary key default gen_random_uuid(),
  drawing_id  uuid not null references public.drawings(id) on delete cascade,
  parent_id   uuid references public.drawing_comments(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  x           real check (x is null or (x >= 0 and x <= 1)),
  y           real check (y is null or (y >= 0 and y <= 1)),
  body        text not null,
  status      text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_drawing_comments_drawing on public.drawing_comments(drawing_id, parent_id);
create index if not exists idx_drawing_comments_thread on public.drawing_comments(parent_id) where parent_id is not null;

alter table public.drawing_comments enable row level security;

-- Read: any member of the drawing's project; a client only on released
-- drawings released to them (mirrors the 149 drawings read rule).
drop policy if exists drawing_comments_read on public.drawing_comments;
create policy drawing_comments_read on public.drawing_comments for select
  using (drawing_id in (
    select d.id from public.drawings d
    where d.project_id in (select public.user_project_ids())
      and (current_role_text() <> 'client'
           or (d.status = 'current' and 'client' = any(d.released_to)))
  ));

-- Insert: same member/released-client gate (the reviewer may pin + reply).
drop policy if exists drawing_comments_insert on public.drawing_comments;
create policy drawing_comments_insert on public.drawing_comments for insert
  with check (drawing_id in (
    select d.id from public.drawings d
    where d.project_id in (select public.user_project_ids())
      and (current_role_text() <> 'client'
           or (d.status = 'current' and 'client' = any(d.released_to)))
  ));

-- Update: the author may edit their own; managers + org admin may resolve/close
-- any thread. (The `x`/`y`/`drawing_id`/`parent_id` stay immutable once placed.)
drop policy if exists drawing_comments_update on public.drawing_comments;
create policy drawing_comments_update on public.drawing_comments for update
  using (
    author_id = auth.uid()
    or is_orgadmin()
    or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
  )
  with check (
    author_id = auth.uid()
    or is_orgadmin()
    or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
  );

-- Delete: managers + org admin only (matches deliverables_delete posture).
drop policy if exists drawing_comments_delete on public.drawing_comments;
create policy drawing_comments_delete on public.drawing_comments for delete
  using (
    is_orgadmin()
    or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
  );

-- ── 3. share_links: guarded project share links ─────────────────────────────
create table if not exists public.share_links (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  token            text not null unique,
  label            text,
  password_hash    text,
  otp              text,
  otp_expires_at   timestamptz,
  expires_at       timestamptz,
  allow_download   boolean not null default true,
  max_views        int check (max_views is null or max_views > 0),
  views            int not null default 0,
  revoked_at       timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_share_links_project on public.share_links(project_id, revoked_at);
create index if not exists idx_share_links_token on public.share_links(token);

alter table public.share_links enable row level security;

-- Read: project member. (password_hash / otp are excluded from the UI SELECT
-- and are only consumed inside the SECURITY DEFINER RPCs below.)
drop policy if exists share_links_read on public.share_links;
create policy share_links_read on public.share_links for select
  using (project_id in (select user_project_ids()));

-- Write: managers + org admin (share:link:manage).
drop policy if exists share_links_manage on public.share_links;
create policy share_links_manage on public.share_links for insert
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

drop policy if exists share_links_update on public.share_links;
create policy share_links_update on public.share_links for update
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  )
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

drop policy if exists share_links_delete on public.share_links;
create policy share_links_delete on public.share_links for delete
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

-- ── 4. handover_signatures: DDL was never shipped (feature was broken) ───────
create table if not exists public.handover_signatures (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  signed_by  uuid references public.profiles(id) on delete set null,
  signature  text not null,
  signed_at  timestamptz not null default now()
);

create index if not exists idx_handover_signatures_project on public.handover_signatures(project_id);

alter table public.handover_signatures enable row level security;

drop policy if exists handover_signatures_read on public.handover_signatures;
create policy handover_signatures_read on public.handover_signatures for select
  using (org_id = any(public.user_org_ids()) or project_id in (select user_project_ids()));

drop policy if exists handover_signatures_insert on public.handover_signatures;
create policy handover_signatures_insert on public.handover_signatures for insert
  with check (signed_by = auth.uid() and (org_id = any(public.user_org_ids()) or project_id in (select user_project_ids())));

-- ── 5. Grants ────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.drawing_comments to authenticated;
grant select, insert, update, delete on public.share_links to authenticated;
grant select, insert on public.handover_signatures to authenticated;
revoke all on public.share_links from anon;
revoke all on public.drawing_comments from anon;
revoke all on public.handover_signatures from anon;

-- ── 6. Public share-link RPCs (SECURITY DEFINER — the ONLY anon surface) ─────
--
-- validate_share_link: gate check with NO side effects. Tells the client what
-- the link requires (password? otp?) without leaking the hash/otp itself.
create or replace function public.validate_share_link(p_token text)
returns table (
  valid            boolean,
  reason           text,
  project_id       uuid,
  label            text,
  allow_download   boolean,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  views            int,
  max_views        int,
  requires_password boolean,
  requires_otp     boolean
)
language plpgsql security definer set search_path = public
as $$
declare l public.share_links%rowtype;
begin
  select * into l from public.share_links where token = p_token;
  if not found then
    return query select false, 'invalid'::text, null::uuid, null::text, true,
      null::timestamptz, null::timestamptz, 0, null::int, false, false;
    return;
  end if;
  if l.revoked_at is not null then
    return query select false, 'revoked'::text, l.project_id, l.label, l.allow_download,
      l.expires_at, l.revoked_at, l.views, l.max_views, false, false;
    return;
  end if;
  if l.expires_at is not null and l.expires_at < now() then
    return query select false, 'expired'::text, l.project_id, l.label, l.allow_download,
      l.expires_at, l.revoked_at, l.views, l.max_views, false, false;
    return;
  end if;
  if l.max_views is not null and l.views >= l.max_views then
    return query select false, 'exhausted'::text, l.project_id, l.label, l.allow_download,
      l.expires_at, l.revoked_at, l.views, l.max_views, false, false;
    return;
  end if;
  return query select true, 'ok'::text, l.project_id, l.label, l.allow_download,
    l.expires_at, l.revoked_at, l.views, l.max_views,
    l.password_hash is not null, l.otp is not null;
end;
$$;

-- share_project_payload: full validation (incl. creds) + side effects
-- (views++, single-use otp) + returns the project report as jsonb. NULL when
-- the link is invalid/unauthed. Anon can only get data through this function.
create or replace function public.share_project_payload(p_token text, p_password text default null, p_otp text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  l public.share_links%rowtype;
  pid uuid;
  payload jsonb;
begin
  select * into l from public.share_links where token = p_token;
  if not found then return null; end if;
  if l.revoked_at is not null or (l.expires_at is not null and l.expires_at < now())
     or (l.max_views is not null and l.views >= l.max_views) then
    return null;
  end if;
  if l.password_hash is not null then
    if p_password is null or p_password = '' or crypt(p_password, l.password_hash) <> l.password_hash then
      return null;
    end if;
  end if;
  if l.otp is not null and l.otp_expires_at is not null and l.otp_expires_at > now() then
    if p_otp is null or p_otp = '' or l.otp <> p_otp then
      return null;
    end if;
    -- single-use otp
    update public.share_links set otp = null, otp_expires_at = null where id = l.id;
  end if;

  update public.share_links set views = views + 1 where id = l.id;
  pid := l.project_id;

  select jsonb_build_object(
    'project', (
      select jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'status', p.status,
        'location', p.location, 'start_date', p.start_date, 'description', p.description,
        'progress', p.progress, 'expected_end_date', p.expected_end_date,
        'client_name', p.client_name, 'industry_subtype', p.industry_subtype)
      from public.projects p where p.id = pid
    ),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'status', m.status,
        'due_date', m.due_date, 'completed_date', m.completed_date) order by m.due_date)
      from public.milestones m where m.project_id = pid
    ), '[]'::jsonb),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'update_date', u.update_date, 'notes', u.notes,
        'weather', u.weather, 'workers_count', u.workers_count) order by u.update_date desc)
      from (select * from public.site_updates u where u.project_id = pid order by u.update_date desc limit 10) u
    ), '[]'::jsonb),
    'drawings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'type', d.type, 'revision', d.revision,
        'date', d.release_date, 'status', d.status, 'notes', d.notes,
        'approval_status', d.approval_status,
        'preview_url', case when l.allow_download then d.preview_url else null end,
        'download_allowed', l.allow_download) order by d.release_date desc)
      from public.drawings d
      where d.project_id = pid and d.status = 'current' and 'client' = any(d.released_to)
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

-- create_share_link: the ONLY way to set a password / OTP (crypt() + a
-- generated single-use OTP need DB-side secrets). Manager-gated (mirrors the
-- share_links insert policy). Returns the token (the manager shares the URL)
-- and, when requested, the generated OTP (shown exactly once to the creator).
create or replace function public.create_share_link(
  p_project_id  uuid,
  p_label       text default null,
  p_allow_download boolean default true,
  p_expires_at  timestamptz default null,
  p_max_views   int default null,
  p_password    text default null,
  p_need_otp    boolean default false
)
returns table (id uuid, token text, otp text)
language plpgsql security definer set search_path = public
as $$
declare
  new_token text := encode(gen_random_bytes(9), 'hex');
  new_otp   text;
begin
  if not (is_orgadmin()
          or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin'))
     or p_project_id not in (select user_project_ids()) then
    raise exception 'share:link:manage required';
  end if;

  if p_password is not null and p_password <> '' then
    p_password := crypt(p_password, gen_salt('bf', 10));
  else
    p_password := null;
  end if;

  if p_need_otp then
    new_otp := lpad(floor(random() * 1000000)::text, 6, '0');
  end if;

  insert into public.share_links
    (project_id, token, label, password_hash, otp, otp_expires_at,
     allow_download, max_views, created_by)
  values
    (p_project_id, new_token, p_label, p_password, new_otp,
     case when new_otp is not null then now() + interval '15 minutes' else null end,
     p_allow_download, p_max_views, auth.uid())
  returning id, token, otp into id, token, otp;

  return query select id, token, otp;
end;
$$;

grant execute on function public.create_share_link(uuid, text, boolean, timestamptz, int, text, boolean) to authenticated;
revoke all on function public.create_share_link(uuid, text, boolean, timestamptz, int, text, boolean) from anon;

grant execute on function public.validate_share_link(text) to anon, authenticated;
grant execute on function public.share_project_payload(text, text, text) to anon, authenticated;

DO $$ DECLARE
  dc bigint; sl bigint; hs bigint; ap bigint;
BEGIN
  SELECT count(*) INTO dc FROM public.drawing_comments;
  SELECT count(*) INTO sl FROM public.share_links;
  SELECT count(*) INTO hs FROM public.handover_signatures;
  SELECT count(*) INTO ap FROM public.drawings WHERE approval_status <> 'not_requested';
  RAISE NOTICE '185_client_approvals: drawing_comments=% share_links=% handover_signatures=% drawings-with-approval=%',
    dc, sl, hs, ap;
END $$;

COMMIT;
