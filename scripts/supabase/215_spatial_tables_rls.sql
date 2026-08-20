-- SiteTrack Pro — close the spatial-hierarchy RLS gap (Phase 0 / 0.8, SEC-02).
--
-- R&D finding (rls-coverage gate, migration 214): 6 org-scoped spatial tables
-- carried FULL authenticated DML grants with NO row-level security:
--   sites, buildings, rooms, zones, spatial_floors, user_project_locations
-- Each row carries organization_id, so any authenticated user could read or
-- write ANY org's spatial hierarchy through the PostgREST API.
--
-- This migration enables RLS on all 6 and applies the canonical org-scoped
-- posture used by crm_leads (161) / research_documents (182):
--   read   = organization_id IN (user_org_ids())          — any active org member
--   insert = same                                           (UI-gated by capability)
--   update = same
--   delete = org member AND manager (orgadmin / pm / project_admin / superadmin)
-- where user_org_ids() respects the org_members status='active' filter (173).
--
-- NOTE on spatial_ref_sys / schema_migrations / site_track_migrations:
-- spatial_ref_sys is the PostGIS SRID catalog (no org data, no authenticated
-- grants); the migration ledgers are service-owned. They stay RLS-off and are
-- allowlisted in scripts/rls-coverage.mjs.
--
-- IDEMPOTENT: all policies are DROP IF EXISTS then CREATE, matching 161/182.

BEGIN;

-- ── enable RLS on the 6 spatial-hierarchy tables ────────────────────────────
alter table public.sites enable row level security;
alter table public.buildings enable row level security;
alter table public.rooms enable row level security;
alter table public.zones enable row level security;
alter table public.spatial_floors enable row level security;
alter table public.user_project_locations enable row level security;

-- ── sites ────────────────────────────────────────────────────────────────────
drop policy if exists sites_read on public.sites;
create policy sites_read on public.sites for select
  using (organization_id = any(public.user_org_ids()));

drop policy if exists sites_insert on public.sites;
create policy sites_insert on public.sites for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists sites_update on public.sites;
create policy sites_update on public.sites for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists sites_delete on public.sites;
create policy sites_delete on public.sites for delete
  using (
    organization_id = any(public.user_org_ids())
    and (
      public.is_orgadmin()
      or public.current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── buildings ────────────────────────────────────────────────────────────────
drop policy if exists buildings_read on public.buildings;
create policy buildings_read on public.buildings for select
  using (organization_id = any(public.user_org_ids()));

drop policy if exists buildings_insert on public.buildings;
create policy buildings_insert on public.buildings for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists buildings_update on public.buildings;
create policy buildings_update on public.buildings for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists buildings_delete on public.buildings;
create policy buildings_delete on public.buildings for delete
  using (
    organization_id = any(public.user_org_ids())
    and (
      public.is_orgadmin()
      or public.current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── rooms ────────────────────────────────────────────────────────────────────
drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select
  using (organization_id = any(public.user_org_ids()));

drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms for delete
  using (
    organization_id = any(public.user_org_ids())
    and (
      public.is_orgadmin()
      or public.current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── zones ────────────────────────────────────────────────────────────────────
drop policy if exists zones_read on public.zones;
create policy zones_read on public.zones for select
  using (organization_id = any(public.user_org_ids()));

drop policy if exists zones_insert on public.zones;
create policy zones_insert on public.zones for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists zones_update on public.zones;
create policy zones_update on public.zones for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists zones_delete on public.zones;
create policy zones_delete on public.zones for delete
  using (
    organization_id = any(public.user_org_ids())
    and (
      public.is_orgadmin()
      or public.current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── spatial_floors ───────────────────────────────────────────────────────────
drop policy if exists spatial_floors_read on public.spatial_floors;
create policy spatial_floors_read on public.spatial_floors for select
  using (organization_id = any(public.user_org_ids()));

drop policy if exists spatial_floors_insert on public.spatial_floors;
create policy spatial_floors_insert on public.spatial_floors for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists spatial_floors_update on public.spatial_floors;
create policy spatial_floors_update on public.spatial_floors for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists spatial_floors_delete on public.spatial_floors;
create policy spatial_floors_delete on public.spatial_floors for delete
  using (
    organization_id = any(public.user_org_ids())
    and (
      public.is_orgadmin()
      or public.current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── user_project_locations ───────────────────────────────────────────────────
-- Row carries organization_id + project_id + user_id + removed_at. Org-scoped
-- read/insert/update (any org member); delete = manager (same set). The
-- removed_at soft-delete is handled at the app layer like project_members.
drop policy if exists user_project_locations_read on public.user_project_locations;
create policy user_project_locations_read on public.user_project_locations for select
  using (organization_id = any(public.user_org_ids()));

drop policy if exists user_project_locations_insert on public.user_project_locations;
create policy user_project_locations_insert on public.user_project_locations for insert
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists user_project_locations_update on public.user_project_locations;
create policy user_project_locations_update on public.user_project_locations for update
  using (organization_id = any(public.user_org_ids()))
  with check (organization_id = any(public.user_org_ids()));

drop policy if exists user_project_locations_delete on public.user_project_locations;
create policy user_project_locations_delete on public.user_project_locations for delete
  using (
    organization_id = any(public.user_org_ids())
    and (
      public.is_orgadmin()
      or public.current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── sanity NOTICE ────────────────────────────────────────────────────────────
do $$
declare
  n int;
begin
  select count(*) into n from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('sites','buildings','rooms','zones','spatial_floors','user_project_locations');
  raise notice 'spatial RLS migration 215: % policies live across the 6 tables (expected 24)', n;
end $$;

COMMIT;