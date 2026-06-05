-- SiteTrack Pro — v3 read/write bridge, final batch (2026-06-05).
--
-- Completes the v3 detail-tab port: bridges the last three legacy project
-- child tables the remaining tabs need — BOQ, Labour register, Compliance —
-- with the same can_read_project / can_write_project backstop established in
-- migration 72. (worklogs for Field Ops + milestones for Gantt were already
-- bridged in 72/73; Approvals reads change_orders/ra_bills/purchase_orders,
-- all bridged earlier.)
--
-- SAFETY: we ENABLE ROW LEVEL SECURITY before GRANT in the loop. boq_items and
-- labour_register did not have RLS enabled in the base schema, so a bare GRANT
-- would have exposed every org's rows. labour_register holds Aadhaar/EPF/ESI —
-- the v3 query layer selects only non-statutory columns + a masked Aadhaar, and
-- RLS confines rows to the project's org/members regardless.
--
-- compliance already has RLS + its own legacy policies; the v3 policies are
-- additive (permissive policies OR-combine). Org-level compliance rows
-- (project_id IS NULL) stay reachable only via the legacy org policy — the v3
-- read policy returns false for a NULL project_id, which is correct.
--
-- IDEMPOTENT. Depends on migration 72 (helpers).

BEGIN;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['boq_items','labour_register','compliance'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
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
