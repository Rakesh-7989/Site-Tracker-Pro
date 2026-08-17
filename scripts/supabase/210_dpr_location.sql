-- SiteTrack Pro — VNext P2.4: dpr_messages.location_id (DPR location context).
--
-- Adds a generic location reference column to the `dpr_messages` table so a
-- Daily Progress Report can be stamped with a node from the spatial hierarchy
-- (migration 206: sites / buildings / spatial_floors / zones / rooms). The
-- DPRComposer picks an optional project + location before submit; the detail
-- view + PDF render the resolved breadcrumb.
--
-- Column posture (deliberate — mirrors migration 209 attendance.location_id):
--   - NULLABLE — org-wide DPRs with no project/location stay valid.
--   - NO FK — the hierarchy spans 5 tables, so a single FK column can't
--     express the relationship cleanly; generic uuid ref resolved in app code
--     via loadProjectHierarchy() (same as user_project_locations from 206).
--   - No index — DPRs are browsed by org/date; a location_id index adds write
--     cost with no matching query (deferred until a filter/drill-down needs it).
--
-- Run after 206_spatial_hierarchy.sql. Idempotent.

BEGIN;

alter table public.dpr_messages
  add column if not exists location_id uuid;

comment on column public.dpr_messages.location_id is
  'Spatial hierarchy node ref (sites/buildings/spatial_floors/zones/rooms). NULL = not location-stamped. App code resolves via loadProjectHierarchy().';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dpr_messages' AND column_name = 'location_id'
  ) THEN
    RAISE NOTICE 'migration 210 ok: dpr_messages.location_id present';
  ELSE
    RAISE EXCEPTION 'migration 210 FAILED: dpr_messages.location_id missing';
  END IF;
END $$;

COMMIT;
