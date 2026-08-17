-- SiteTrack Pro — VNext P1.4: attendance.location_id (spatial wiring).
--
-- Adds a generic location reference column to the legacy `attendance` table
-- so attendance rows can be stamped with a node from the P1.4 spatial
-- hierarchy (migration 206: sites / buildings / spatial_floors / zones /
-- rooms). The AttendanceTab mark form + row chips surface it, and the
-- DetailView location selector (useLocationContext) shares the same set.
--
-- Column posture (deliberate):
--   - NULLABLE — legacy/undecided rows stay valid (no NOT NULL migration
--     over rows we can't backfill from live data).
--   - NO FK — the hierarchy spans 5 tables (sites/buildings/spatial_floors/
--     zones/rooms), so a single FK column can't express the relationship
--     cleanly; this mirrors the user_project_locations pattern from 206
--     (generic uuid ref resolved in app code via the hierarchy loader).
--   - No index — attendance is browsed by project/date; a location_id
--     index adds write cost with no matching query (deferred until a
--     filter/drill-down needs it).
--
-- Run after 206_spatial_hierarchy.sql. Idempotent.

BEGIN;

alter table public.attendance
  add column if not exists location_id uuid;

comment on column public.attendance.location_id is
  'Spatial hierarchy node ref (sites/buildings/spatial_floors/zones/rooms). NULL = not location-stamped. App code resolves via loadProjectHierarchy().';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'location_id'
  ) THEN
    RAISE NOTICE 'migration 209 ok: attendance.location_id present';
  ELSE
    RAISE EXCEPTION 'migration 209 FAILED: attendance.location_id missing';
  END IF;
END $$;

COMMIT;