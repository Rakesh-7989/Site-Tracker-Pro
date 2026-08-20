-- SiteTrack Pro — drop leftover spatial policies from 206 (Phase 0 / 0.8).
--
-- Migration 206 created project-scoped SELECT policies (*_select, floors_*)
-- but never ran `enable row level security`, so they were inert. Migration 215
-- enabled RLS and added the canonical org-scoped policy set (*_read/insert/
-- update/delete on each of the 6 tables). Because 215's names differ from
-- 206's, the dead 206 policies are now LIVE alongside mine:
--
--   sites_select, buildings_select, rooms_select, zones_select  (SELECT)
--   floors_select / floors_insert / floors_update / floors_delete (spatial_floors)
--
-- These are both redundant AND buggy: their SELECT gates compare
-- `project_members.profile_id = ANY(user_org_ids())` — a USER uuid against an
-- ORG uuid array — so they would deny every read (and even if fixed, they are
-- stricter than 215's org-scoped read, contradicting it). They must go; 215's
-- set is authoritative.
--
-- IDEMPOTENT.

BEGIN;

drop policy if exists sites_select on public.sites;
drop policy if exists buildings_select on public.buildings;
drop policy if exists rooms_select on public.rooms;
drop policy if exists zones_select on public.zones;
drop policy if exists floors_select on public.spatial_floors;
drop policy if exists floors_insert on public.spatial_floors;
drop policy if exists floors_update on public.spatial_floors;
drop policy if exists floors_delete on public.spatial_floors;

do $$
declare
  n int;
begin
  select count(*) into n from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('sites','buildings','rooms','zones','spatial_floors','user_project_locations');
  raise notice 'spatial RLS migration 216: % policies remain (expected 24, 4 per table)', n;
end $$;

COMMIT;