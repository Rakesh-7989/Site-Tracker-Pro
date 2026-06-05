-- SiteTrack Pro — v3 read/write bridge, Batch 2 tables (2026-06-04).
--
-- Extends the migration-72 bridge (same can_read_project / can_write_project
-- helpers) to the site-ops feature tables the Batch 2 port DB-wires:
-- inspections, safety, punch, attendance, worklogs, equipment, checklist_items.
-- (materials was already covered in migration 72.)
--
-- Same rationale: `authenticated` had no GRANT on these, so v3 reads/writes
-- would hit "permission denied" before RLS. IDEMPOTENT.

BEGIN;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['inspections','safety','punch','attendance','worklogs','equipment','checklist_items'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- skip any table that doesn't exist on this DB (defensive)
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v3_read_'||t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v3_write_'||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.can_read_project(project_id))', 'v3_read_'||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.can_write_project(project_id)) WITH CHECK (public.can_write_project(project_id))', 'v3_write_'||t, t);
  END LOOP;
END $$;

COMMIT;
