-- SiteTrack Pro — v4 Phase D2: drawing diff overlay substrate.
-- Run AFTER 149_drawings_file_register.sql. Idempotent.
--
-- Adds drawing.preview_url — the storage path (within the shared `deliverables`
-- bucket, migration 145) of the preferred raster image (PNG/JPG/WebP) used by
-- the D2 diff overlay. Set by the client on upload when the file is a raster
-- image; NULL means the diff tool falls back to listing the drawing's folder
-- (drawingFileQueries.listDrawingFiles) and picking the first raster file.
-- The `drawings.storage_path` column is legacy/unused for the diff overlay.

BEGIN;

ALTER TABLE public.drawings
  ADD COLUMN IF NOT EXISTS preview_url text;

DO $$ BEGIN
  RAISE NOTICE '150_drawings_preview_url: drawings.preview_url ready';
END $$;

COMMIT;