-- SiteTrack Pro — v4 Phase E Opt3: per-drawing design-workflow stage.
-- Run AFTER 165_design_workflow.sql. Idempotent.
--
-- Adds a per-drawing `design_stage` column so each register row can hold its own
-- position on the design ladder (requirements/…/approved). This lets the stage
-- model (designWorkflow.ts) read row-level stages rather than inferring from
-- title keywords, and lets DrawingsTab annotate each drawing with its stage.
-- Row write stays manager/orgadmin — no new RLS policy (existing drawings
-- update/insert policies already gate by role; this only adds a column).

BEGIN;

alter table public.drawings
  add column if not exists design_stage text
    check (design_stage in ('requirements','concept','floorplan','elevation','3d','client_review','approved'));

update public.drawings
   set design_stage = 'concept'
 where design_stage is null;

alter table public.drawings
  alter column design_stage set not null,
  alter column design_stage set default 'concept';

DO $$ BEGIN
  RAISE NOTICE '166_design_workflow_per_drawing.sql: drawings.design_stage column live';
END $$;

COMMIT;