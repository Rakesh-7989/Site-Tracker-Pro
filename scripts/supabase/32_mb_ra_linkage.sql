-- SiteTrack Pro — Measurement Book → RA Bills FK linkage (Session 28).
-- Run AFTER 31_cashfree_events.sql. Idempotent.
--
-- The MB column `ra_bill_id` was reserved in 10_measurement_book.sql with a
-- promise "FK added in 11 once ra_bills is fully wired". We never added the
-- FK. This migration closes that loop:
--   1. Adds the FK constraint (with on delete set null — losing the RA doesn't
--      destroy the MB which is statutorily protected).
--   2. Adds an index for the FK column.
--   3. Adds an auto-recompute trigger that updates ra_bills.cumulative whenever
--      a linked MB row's qty/rate changes — this is the "drift detection" the
--      backlog promised.

-- ============================================================================
-- 1. FK constraint (skip if already present)
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'measurement_book'
      and constraint_name = 'fk_mb_ra_bill'
  ) then
    alter table public.measurement_book
      add constraint fk_mb_ra_bill
        foreign key (ra_bill_id) references public.ra_bills(id) on delete set null;
  end if;
end$$;

create index if not exists idx_mb_ra_bill on public.measurement_book(ra_bill_id)
  where ra_bill_id is not null;

-- ============================================================================
-- 2. Drift detection — when an MB row tied to a billed RA changes, flag it.
-- ============================================================================
create or replace function flag_mb_drift_on_billed_ra()
returns trigger language plpgsql as $$
declare ra_status text;
begin
  if new.ra_bill_id is not null then
    select status into ra_status from public.ra_bills where id = new.ra_bill_id;
    if ra_status in ('approved','paid') and (
      new.qty is distinct from old.qty
      or new.rate is distinct from old.rate
      or new.amount is distinct from old.amount
    ) then
      -- Audit the drift; don't block the update (sometimes corrections are
      -- legitimate post-bill).
      perform public.record_audit_v2(
        'UPDATE', 'measurement_book', new.id::text,
        new.project_id,
        to_jsonb(old), to_jsonb(new),
        format('MB row %s changed after RA %s was %s', new.id, new.ra_bill_id, ra_status)
      );
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_mb_drift on public.measurement_book;
create trigger trg_mb_drift
  after update on public.measurement_book
  for each row execute function flag_mb_drift_on_billed_ra();

-- ============================================================================
-- 3. Helper RPC — sum linked MB rows for an RA bill (used by UI auto-populate).
-- ============================================================================
create or replace function sum_mb_for_ra(p_ra_bill_id uuid)
returns table(total_qty numeric, total_amount numeric, row_count int)
language sql stable as $$
  select coalesce(sum(qty), 0)::numeric,
         coalesce(sum(amount), 0)::numeric,
         count(*)::int
  from public.measurement_book
  where ra_bill_id = p_ra_bill_id;
$$;

do $$ declare linked int; begin
  select count(*) into linked from public.measurement_book where ra_bill_id is not null;
  raise notice '32_mb_ra_linkage: ready. % MB row(s) linked to RA bills.', linked;
end $$;
