-- SiteTrack Pro — v4 Phase C3.0: per-phase time tracking.
-- Run AFTER 143_consultancy_billing_hardening.sql (requires time_entries, fee_phases).
-- Idempotent.
--
-- Adds a nullable phase_id to time_entries so billable hours can be attributed
-- to fixed-fee phases (consultancy/design projects).  This is essential for per-phase
-- utilization drill-down (C3.1) and for matching time effort to the fee phases
-- that are managed in the PhasesTab.
--
-- Each time entry may be optionally linked to a fee phase (via FK to fee_phases).
-- The phase_id is nullable so existing (legacy) time entries stay unaffected.
--
-- RLS: NO new policy here.  Existing policies already cover the new column:
--   * insert  -> time_entries_insert_self (137): project member, profile_id = auth.uid()
--   * update  -> time_entries_edit_self   (143): self + pending + not billed, or orgadmin
--   * delete  -> time_entries_delete_self (143): self + pending + not billed, or orgadmin
-- Managers that hold time:manage already pass through the same self/orgadmin rules;
-- the TS capability layer (time:manage / time:approve) enforces UI-level gating.

BEGIN;

-- 1. Column add (idempotent)
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES public.fee_phases(id) ON DELETE SET NULL;

-- 2. Non-unique index on (project_id, phase_id) where phase_id IS NOT NULL — for
--    per-phase drill-down queries. Deliberately NON-unique: a phase legitimately
--    collects many time entries (one per member per day), so uniqueness on the
--    pair would block real usage.
DROP INDEX IF EXISTS idx_time_entries_phase_project;
CREATE INDEX IF NOT EXISTS idx_time_entries_phase_project
  ON public.time_entries(project_id, phase_id)
  WHERE phase_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;

DO $$ DECLARE n int; BEGIN
  SELECT COUNT(*) INTO n FROM public.time_entries;
  RAISE NOTICE '144_time_entries_phase_id: ready, rows=%', n;
END $$;

COMMIT;
