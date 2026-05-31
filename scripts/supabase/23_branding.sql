-- SiteTrack Pro — Branding cascade (org default → project override).
-- Run AFTER 22_estimate.sql. Idempotent.
--
-- Mirrors src/lib/branding.js + INIT_BRANDING.
-- One row per (org, project). project_id NULL = org-level default. Resolution
-- precedence: project override → org default → platform default (hard-coded).

create table if not exists branding (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  project_id    uuid references projects(id) on delete cascade,    -- nullable
  logo_url      text,
  tagline       text,
  accent        text,                                              -- hex e.g. '#8E887C'
  theme         text default 'editorial'
    check (theme in ('editorial','classic','modern','dark')),
  letterhead    text,                                              -- storage path to letterhead PDF/PNG
  footer_text   text,
  pdf_header    jsonb default '{}'::jsonb,                         -- {logo_pos, text, ...}
  pdf_footer    jsonb default '{}'::jsonb,
  updated_by    uuid references profiles(id),
  updated_at    timestamptz default now()
);

-- Bug-fix Session 27.1: was a single `unique (org_id, project_id)`. Postgres
-- treats NULLs as distinct in UNIQUE constraints, so multiple org-default rows
-- (project_id IS NULL) for the same org would all "pass". Split into 2 partial
-- unique indexes: one for org-default (per org), one for project override.
create unique index if not exists uniq_branding_org_default
  on branding(org_id)
  where project_id is null;
create unique index if not exists uniq_branding_project_override
  on branding(org_id, project_id)
  where project_id is not null;

create index if not exists idx_branding_org on branding(org_id);
create index if not exists idx_branding_project on branding(project_id) where project_id is not null;

alter table branding enable row level security;

create policy branding_read on branding for select
  using (
    is_superadmin()
    or org_id = user_org_id()
    or project_id in (select user_project_ids())
  );

create policy branding_write on branding for all
  using (
    is_superadmin()
    or (is_orgadmin() and org_id = user_org_id())
    or (current_role_text() in ('pm','project_admin','project_head')
        and (project_id in (select user_project_ids())))
  )
  with check (
    is_superadmin()
    or (is_orgadmin() and org_id = user_org_id())
    or (current_role_text() in ('pm','project_admin','project_head')
        and (project_id in (select user_project_ids())))
  );

do $$ declare n int; begin
  select count(*) into n from branding;
  raise notice '23_branding: ready. % branding row(s).', n;
end $$;
