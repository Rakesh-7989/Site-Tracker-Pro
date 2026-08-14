-- SiteTrack Pro — Track C / P-A column-drift fix: name-joinable FKs → profiles.
-- Run AFTER 191_recompute_all_vendor_performance.sql. Idempotent.
--
-- Problem (P-A1/P-A2 live probes, 2026-08-15): these columns reference
-- auth.users, but PostgREST only builds embed relationships through FKs whose
-- target table is in an exposed schema (public). FKs targeting auth.users are
-- dropped from the PostgREST schema cache, so every embed of the form
--   owner:owner_id(name) / received_by(name) / requested_by:requested_by(name)
-- fails with PGRST200 "Could not find a relationship" on EVERY call (rows or
-- not), even though the query is syntactically valid SQL.
--
-- Root cause: the columns are user-identity display joins, so they belong on
-- public.profiles (which has the `name` column and is PostgREST-exposed). The
-- repo already does this correctly elsewhere (dpr_messages.supervisor_user_id
-- → profiles in 50, payment_events.created_by, share_links.created_by,
-- handover_signatures.signed_by, po_receipts.matched_by, deliverables.owner_id).
-- profiles.id is 1:1 with auth.users.id (profiles_id_fkey ON DELETE CASCADE),
-- so re-pointing is a no-op for data integrity.
--
-- Fix: drop + re-add each broken FK to reference public.profiles(id) with the
-- same ON DELETE SET NULL semantics. All affected columns are currently empty
-- (verified live: 0 rows), so there is zero data migration risk.

do $$
declare
  v_constraint text;
  v_table text;
  v_column text;
  v_count int := 0;
begin
  -- [table, constraint_name, column_name]
  for v_table, v_constraint, v_column in values
    ('payments',             'payments_received_by_fkey',             'received_by'),
    ('leads',                'leads_owner_id_fkey',                  'owner_id'),
    ('po_receipts',          'po_receipts_received_by_fkey',          'received_by'),
    ('material_requests',    'material_requests_requested_by_fkey',   'requested_by'),
    ('material_requests',    'material_requests_approved_by_fkey',    'approved_by'),
    ('corrective_actions',   'corrective_actions_opened_by_fkey',     'opened_by'),
    ('corrective_actions',   'corrective_actions_verified_by_fkey',   'verified_by')
  loop
    -- Only re-point if the FK currently references auth.users (idempotent:
    -- after the first run it references profiles and is left untouched).
    if exists (
      select 1 from pg_constraint c
      where c.conname = v_constraint
        and c.conrelid = ('public.' || v_table)::regclass
        and c.confrelid = 'auth.users'::regclass
    ) then
      execute format('alter table public.%I drop constraint %I', v_table, v_constraint);
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
        v_table, v_constraint, v_column
      );
      v_count := v_count + 1;
    end if;
  end loop;
  raise notice 're-pointed % FK(s) from auth.users to profiles', v_count;
end $$;

-- Verify all seven now target profiles and no leftover auth.users FK remains
-- on these columns.
do $$ begin
  raise notice 'auth.users FK residue: %',
    (select count(*) from pg_constraint c
     where c.contype = 'f'
       and c.confrelid = 'auth.users'::regclass
       and c.conrelid::regclass::text in
         ('public.payments','public.leads','public.po_receipts',
          'public.material_requests','public.corrective_actions'));
end $$;
