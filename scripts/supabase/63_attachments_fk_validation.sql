-- SiteTrack Pro — attachments orphan prevention (Session 30.13, Phase 2).
--
-- R&D audit gap #5E: attachments(entity_type, entity_id) is polymorphic —
-- it can point at a drawing, an issue, a DPR, a milestone, etc. There is
-- NO foreign key enforcing entity_id actually exists in the target table.
-- When a drawing is deleted, its attachment rows dangle forever.
--
-- We can't add a single FK (entity_id points at different tables). Instead
-- this migration adds a BEFORE INSERT/UPDATE trigger that validates the
-- (entity_type, entity_id) pair against a whitelist of known entity tables.
-- If the referenced row doesn't exist, the insert is rejected.
--
-- This is a guard rail, not a cascade — deletes of parents still need the
-- app (or a future ON DELETE hook) to clean up attachment rows. But it
-- stops NEW orphans from being created by a buggy client.
--
-- IDEMPOTENT.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_attachment_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_table  text;
BEGIN
  -- Map entity_type → the table that owns it. Extend this CASE when a new
  -- attachable entity type ships.
  v_table := CASE NEW.entity_type
    WHEN 'project'      THEN 'projects'
    WHEN 'drawing'      THEN 'drawings'
    WHEN 'issue'        THEN 'issues'
    WHEN 'milestone'    THEN 'milestones'
    WHEN 'task'         THEN 'tasks'
    WHEN 'site_update'  THEN 'site_updates'
    WHEN 'dpr'          THEN 'dpr_messages'
    WHEN 'rfi'          THEN 'rfis'
    WHEN 'safety'       THEN 'safety_incidents'
    WHEN 'inspection'   THEN 'inspections'
    WHEN 'punch'        THEN 'punchlist'
    WHEN 'material'     THEN 'materials'
    WHEN 'po'           THEN 'purchase_orders'
    WHEN 'invoice'      THEN 'invoices'
    WHEN 'rabill'       THEN 'ra_bills'
    WHEN 'boq'          THEN 'boq_items'
    WHEN 'compliance'   THEN 'compliance'
    WHEN 'expense'      THEN 'expenses'
    WHEN 'changeorder'  THEN 'change_orders'
    ELSE NULL
  END;

  -- Unknown entity_type → allow (forward-compatible; new types may not
  -- have a table mapping yet). Log a notice for observability.
  IF v_table IS NULL THEN
    RAISE NOTICE 'attachments: unmapped entity_type "%", skipping FK validation', NEW.entity_type;
    RETURN NEW;
  END IF;

  -- Skip validation if the target table doesn't exist in this DB (some
  -- entity tables are Sprint 4+; the mapping is forward-looking).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = v_table
  ) THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id = $1)', v_table)
    INTO v_exists USING NEW.entity_id;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'attachments: entity_id % does not exist in % (entity_type=%)',
      NEW.entity_id, v_table, NEW.entity_type;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_attachment_entity ON public.attachments;
CREATE TRIGGER trg_validate_attachment_entity
  BEFORE INSERT OR UPDATE OF entity_type, entity_id ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.validate_attachment_entity();

COMMENT ON FUNCTION public.validate_attachment_entity() IS
  'Guards against orphaned attachment rows by validating (entity_type, entity_id) against the owning table before insert/update. Unknown / not-yet-shipped entity types are allowed (forward-compatible).';

COMMIT;
