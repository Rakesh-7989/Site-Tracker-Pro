-- SiteTrack Pro — ST-018 inventory ledger depth: inventory_transactions.issued_to.
--
-- Adds a recipient reference column to the `inventory_transactions` table so an
-- outward / return / wastage ledger row can say WHO the material was issued to
-- (e.g. a contractor, a team, a site area). Combined with the existing
-- recorded_by actor + notes, every ledger movement then has the ST-018 shape:
-- project, material, quantity, direction, date, actor, recipient.
--
-- Column posture (deliberate):
--   - NULLABLE — the GRN auto-post (migration 167) and plain inward entries
--     don't need a recipient.
--   - Plain TEXT, NOT a FK — recipients can be contractors/teams/areas that
--     don't map to a single identity table.
--   - No index — the ledger is browsed per project by date; an issued_to index
--     adds write cost with no matching query (deferred until a filter needs it).
--
-- Run after 167_material_requests_grn.sql. Idempotent.

BEGIN;

alter table public.inventory_transactions
  add column if not exists issued_to text;

comment on column public.inventory_transactions.issued_to is
  'Recipient of an outward/return/wastage movement (contractor, team, site area). NULL = not applicable. App code renders it in the ledger row.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_transactions' AND column_name = 'issued_to'
  ) THEN
    RAISE NOTICE 'migration 211 ok: inventory_transactions.issued_to present';
  ELSE
    RAISE EXCEPTION 'migration 211 FAILED: inventory_transactions.issued_to missing';
  END IF;
END $$;

COMMIT;