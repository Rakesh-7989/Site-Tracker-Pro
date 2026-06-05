-- SiteTrack Pro — v3 read/write bridge, finance tables (2026-06-04).
--
-- Extends the migration-72/73 bridge to the finance + inventory tables the
-- Batch 3 port DB-wires: purchase_orders, invoices, ra_bills,
-- inventory_transactions. (expenses + attendance already bridged.) IDEMPOTENT.

BEGIN;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['purchase_orders','invoices','ra_bills','inventory_transactions'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
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
