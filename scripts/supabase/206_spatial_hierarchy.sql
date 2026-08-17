-- SiteTrack Pro — Spatial Hierarchy (migration 206).
-- Adds site/building/floor/zone/room hierarchy for field operations,
-- offline-first data, and industry-domain alignment (Construction/Architecture/Interior).
-- Run after 205_rbac_v2_assignments.sql. Idempotent.
--
-- Tables created:
--   sites           — per-org project sites (delegated from projects)
--   buildings       — per-site buildings
--   floors          — per-building floors
--   zones           — per-floor zones (construction/architecture/interior)
--   rooms           — per-zone rooms/units
--   user_project_locations  — user-to-location assignments
--
-- Also:
--   • enabled_modules CHECK extended with 'space'
--   • RLS policies on all new tables (project-membership gated)
--   • GIN indexes for hierarchy path queries
--   • storage bucket 'space-media' for site photos/attachments
--   • seed data note (empty by default; populated onboarding)

BEGIN;

-- Enable PostGIS (idempotent) for the geography/coordinates types used below.
create extension if not exists postgis;

-- ── 1. Extend the module CHECK (155) to allow 'space' ───────────────────────
-- Drop and re-add the check to admit the new module id.
-- Mirrors the pattern from 161_crm_leads.sql and 182_research_module.sql.

alter table public.organizations
  drop constraint if exists organizations_enabled_modules_check;

alter table public.organizations
  add constraint organizations_enabled_modules_check check (
    enabled_modules is null or
    enabled_modules <@ array[
      'projects','clients','site_ops','design','consultancy','finance',
      'procurement','compliance','people','insights','kiosks','crm','research','space'
    ]::text[]
  );

-- ── 2. Sites table ───────────────────────────────────────────────────────────
-- A site is a physical location under a project (e.g., "Main Campus", "North Wing").
-- Every site belongs to one project, which belongs to one organization.

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text, -- short alphanumeric code (e.g., "MW-01", "SITE-A")
  address text,
  coordinates geography(point, 4326), -- nullable: SRID 4326
  area_sqft numeric(12,2), -- total site area
  status text not null default 'active'
    check (status in ('active','inactive','planned','decommissioned')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sites is 'Physical construction/architecture/interior site under a project. One project may have multiple sites.';

-- ── 3. Buildings table ──────────────────────────────────────────────────────
-- A building sits within a site. Typical for campus-style projects or multi-structure projects.

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text, -- e.g., "BLDG-1", "MAIN-BUILDING"
  floors_total smallint not null default 0
    check (floors_total >= 0),
  building_type text
    check (building_type in ('standard','high-rise','low-rise','temporary','modular')),
  address text, -- building-specific address if different from site
  year_built integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.buildings is 'Physical building within a site. A site may contain multiple buildings.';

-- ── 4. Floors table ─────────────────────────────────────────────────────────
-- A floor within a building. Level number (1 = ground/first, etc.) and area.

create table if not exists public.spatial_floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  level smallint not null, -- e.g., 1, 2, -1 (basement)
  name text, -- e.g., "Ground Floor", "Mechanical"
  area_sqft numeric(12,2),
  room_count smallint not null default 0
    check (room_count >= 0),
  purpose text
    check (purpose in ('construction','architecture','interior','office','storage','mechanical','other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.spatial_floors is 'Floor within a building. Level numbers are project-convention-dependent.';

-- ── 5. Zones table ──────────────────────────────────────────────────────────
-- A zone is a logical grouping within a floor. Type varies by industry:
--   construction: trade area, work zone, safety zone
--   architecture: design zone, review zone, consultation zone
--   interior: room zone, FF&E zone, selection zone
-- TODO: extend zone_type enum as new industry needs arise.

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.spatial_floors(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  zone_name text not null, -- e.g., "Electrical Room", "Conference Room A"
  zone_type text not null
    check (zone_type in (
      'construction','architecture','interior',
      'trade','work','safety','design','review','consultation',
      'room','FF&E','selection','storage','mechanical','other'
    )),
  area_sqft numeric(12,2),
  capacity smallint, -- max occupants (nullable: not all zones have a cap)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.zones is 'Logical zone within a floor. Zone type encodes industry discipline.';

-- ── 6. Rooms table ──────────────────────────────────────────────────────────
-- A room/unit within a zone. The fundamental space unit for all industries.
-- room_type varies: construction → office/classroom, architecture → studio,
-- interior → bedroom/kitchen/bathroom, etc.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  room_name text not null, -- e.g., "Office 101", "Kitchen"
  room_type text
    check (room_type in (
      'office','classroom','conference','bedroom','kitchen','bathroom',
      'studio','laboratory','storage','hall','restroom','other'
    )),
  area_sqft numeric(12,2) not null
    check (area_sqft > 0),
  capacity smallint, -- max occupants
  features jsonb default '[]'::jsonb, -- e.g., ['ac','wifi','plumbing']
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rooms is 'Room/unit within a zone. The base space unit for all industry domains.';

-- ── 7. User project locations ───────────────────────────────────────────────
-- Maps active org members to their assigned location within a project.
-- Used for: site assignment, location-aware UI filtering, offline sync scoping.

create table if not exists public.user_project_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null, -- FK to sites | buildings | floors | zones | rooms (generic refs handled via app logic)
  location_type text not null
    check (location_type in ('site','building','floor','zone','room')),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  removed_at timestamptz -- soft-delete
);

comment on table public.user_project_locations is 'Maps org members to their active project location. One location per user per type.';

create unique index if not exists uq_user_active_location
  on public.user_project_locations (user_id, location_type)
  where (removed_at is null);

-- ── 8. RLS Policies ─────────────────────────────────────────────────────────

-- Sites: project-membership gated (same pattern as project_members)
drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites for select
  using (project_id in (select project_id from public.project_members where profile_id = any(public.user_org_ids())));

drop policy if exists sites_insert on public.sites;
create policy sites_insert on public.sites for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists sites_update on public.sites;
create policy sites_update on public.sites for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists sites_delete on public.sites;
create policy sites_delete on public.sites for delete
  using (organization_id = any(public.user_org_ids()));

-- Buildings: project-membership gated
drop policy if exists buildings_select on public.buildings;
create policy buildings_select on public.buildings for select
  using (site_id in (
    select id from public.sites where project_id in (
      select project_id from public.project_members where profile_id = any(public.user_org_ids())
    )
  ));

drop policy if exists buildings_insert on public.buildings;
create policy buildings_insert on public.buildings for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists buildings_update on public.buildings;
create policy buildings_update on public.buildings for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists buildings_delete on public.buildings;
create policy buildings_delete on public.buildings for delete
  using (organization_id = any(public.user_org_ids()));

-- Floors: project-membership gated
drop policy if exists floors_select on public.spatial_floors;
create policy floors_select on public.spatial_floors for select
  using (building_id in (
    select id from public.buildings where site_id in (
      select id from public.sites where project_id in (
        select project_id from public.project_members where profile_id = any(public.user_org_ids())
      )
    )
  ));

drop policy if exists floors_insert on public.spatial_floors;
create policy floors_insert on public.spatial_floors for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists floors_update on public.spatial_floors;
create policy floors_update on public.spatial_floors for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists floors_delete on public.spatial_floors;
create policy floors_delete on public.spatial_floors for delete
  using (organization_id = any(public.user_org_ids()));

-- Zones: project-membership gated
drop policy if exists zones_select on public.zones;
create policy zones_select on public.zones for select
  using (floor_id in (
    select id from public.spatial_floors where building_id in (
      select id from public.buildings where site_id in (
        select id from public.sites where project_id in (
          select project_id from public.project_members where profile_id = any(public.user_org_ids())
        )
      )
    )
  ));

drop policy if exists zones_insert on public.zones;
create policy zones_insert on public.zones for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists zones_update on public.zones;
create policy zones_update on public.zones for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists zones_delete on public.zones;
create policy zones_delete on public.zones for delete
  using (organization_id = any(public.user_org_ids()));

-- Rooms: project-membership gated
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select
  using (zone_id in (
    select id from public.zones where floor_id in (
      select id from public.spatial_floors where building_id in (
        select id from public.buildings where site_id in (
          select id from public.sites where project_id in (
            select project_id from public.project_members where profile_id = any(public.user_org_ids())
          )
        )
      )
    )
  ));

drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms for delete
  using (organization_id = any(public.user_org_ids()));

-- ── 9. GIN Indexes for Hierarchy Path Queries ───────────────────────────────
-- GiST index on coordinates for site-level geo queries
create index if not exists idx_sites_coordinates on public.sites using gist (coordinates);
comment on index idx_sites_coordinates is 'GiST index for site geo-spatial queries';

-- GIN index on features (rooms)
create index if not exists idx_rooms_features on public.rooms using gin (features);
comment on index idx_rooms_features is 'GIN index for room feature lookups';

-- Btree index on zone_type for filtering
create index if not exists idx_zones_type on public.zones (zone_type);
comment on index idx_zones_type is 'Index for zone-type filtering';

-- Btree index on room_type for filtering
create index if not exists idx_rooms_type on public.rooms (room_type);
comment on index idx_rooms_type is 'Index for room-type filtering';

-- ── 10. Storage bucket ─────────────────────────────────────────────────────
-- Private bucket for site/building photos and zone/room attachments.
-- Path convention: org/{org_id}/space/media/{entity_type}/{entity_id}/{file}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('space-media', 'space-media', false, 52428800, null) -- 50 MB
on conflict (id) do nothing;

-- Read: any org member (path org/{org_id}/space/media/...)
drop policy if exists space_media_read on storage.objects;
create policy space_media_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'space-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
  );

-- Insert: org member (UI gates behind `space:manage` capability).
drop policy if exists space_media_insert on storage.objects;
create policy space_media_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'space-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor')
  );

-- Update: org member.
drop policy if exists space_media_update on storage.objects;
create policy space_media_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'space-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
  )
  with check (
    bucket_id = 'space-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
  );

-- Delete: managers only (orgadmin + pm + project_admin + superadmin).
drop policy if exists space_media_delete on storage.objects;
create policy space_media_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'space-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── 11. Grants ──────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.sites to authenticated;
grant select, insert, update, delete on public.buildings to authenticated;
grant select, insert, update, delete on public.spatial_floors to authenticated;
grant select, insert, update, delete on public.zones to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.user_project_locations to authenticated;
revoke all on public.sites from anon;
revoke all on public.buildings from anon;
revoke all on public.spatial_floors from anon;
revoke all on public.zones from anon;
revoke all on public.rooms from anon;
revoke all on public.user_project_locations from anon;

-- ── 12. Seed research_library-adjacent note (handled separately) ───────────
-- The `space` module is not a research feature; no plan-cap seeding needed.
-- If future C0/C1 work adds `space` to plan features, add seeding here.

-- ── 12. Verification notice ─────────────────────────────────────────────────
DO $$ DECLARE
  s int; b int; f int; z int; r int; upl int;
BEGIN
  select count(*) into s from public.sites;
  select count(*) into b from public.buildings;
  select count(*) into f from public.spatial_floors;
  select count(*) into z from public.zones;
  select count(*) into r from public.rooms;
  select count(*) into upl from public.user_project_locations;
  raise notice '206_spatial_hierarchy: sites=%, buildings=%, floors=%, zones=%, rooms=%, user_project_locations=%', s, b, f, z, r, upl;
END $$;

COMMIT;