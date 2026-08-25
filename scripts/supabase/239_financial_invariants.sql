-- SiteTrack Pro — migration 239: financial-chain payment invariants.
--
-- Production-audit P0 (Domain): "Financial invariants". The audit's example
-- failure mode: BOQ ₹10L / RA ₹8L / Invoice ₹8.5L / Payment ₹7L / dashboard
-- ₹9L — records that silently diverge. This migration closes the PAYMENT leg
-- server-side while the payments table is still EMPTY (0 live rows — flow not
-- launched), so guards land before the first real rupee moves.
--
-- Invariants enforced:
--   FI-1  A payment's target must EXIST and belong to the SAME project as
--         the payment row (payments.target_id is polymorphic — no FK today;
--         this closes dangling + cross-project pointers that would corrupt
--         every org rollup).
--   FI-2  Σ payments against a target never exceeds its receivable cap:
--           invoice : round(amount × (1 + gst% − tds%))   [GST/TDS are %]
--           ra_bill : round(bill_amount × (1 − retention_pct%))
--         Mirrors the UI semantics (crossInvoiceQueries.netReceivable /
--         financeQueries.raNetPayable) but computed from BASE columns at
--         write time, so concurrent payments cannot race past the cap.
--   FI-3  ra_bills.paid_amount ∈ [0, bill_amount] via CHECK (live data clean).
--
-- Notes:
--   - Guard is BEFORE INSERT OR UPDATE so edits cannot sneak past the cap.
--   - DELETEs always free room (no guard needed).
--   - Fires before the existing AFTER trigger trigger_payment_received, which
--     keeps notifying only on real, valid payments.
--   - RLS unchanged: who may write stays governed by payments_insert/update
--     policies (can_write_project).

-- ── FI-3: ra_bills paid range ────────────────────────────────────────────────
alter table public.ra_bills drop constraint if exists chk_ra_paid_range;
alter table public.ra_bills
  add constraint chk_ra_paid_range check (paid_amount >= 0 and paid_amount <= bill_amount);

-- ── FI-1/FI-2: payment target guard ─────────────────────────────────────────
create or replace function public.guard_payment_target()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project uuid;
  v_cap numeric;
  v_paid numeric;
begin
  if new.target_type = 'invoice' then
    select project_id,
           round(amount * (1 + coalesce(gst, 0) / 100.0 - coalesce(tds, 0) / 100.0))
      into v_project, v_cap
      from public.invoices where id = new.target_id;
  elsif new.target_type = 'ra_bill' then
    select project_id,
           round(bill_amount * (1 - coalesce(retention_pct, 0) / 100.0))
      into v_project, v_cap
      from public.ra_bills where id = new.target_id;
  else
    raise exception 'payment target_type % is not supported', new.target_type
      using errcode = 'check_violation';
  end if;

  -- FI-1: target exists AND lives in the payment's own project.
  if v_project is null then
    raise exception 'payment target % does not exist', new.target_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_project is distinct from new.project_id then
    raise exception 'payment target belongs to a different project'
      using errcode = 'foreign_key_violation';
  end if;

  -- FI-2: outstanding cap. Exclude self on UPDATE so editing a payment
  -- re-validates against the remaining room; tg_op='INSERT' has no self yet.
  select coalesce(sum(amount), 0)
    into v_paid
    from public.payments
    where target_type = new.target_type
      and target_id = new.target_id
      and (tg_op = 'INSERT' or id <> new.id);

  if new.amount <= 0 then
    raise exception 'payment amount must be positive'
      using errcode = 'check_violation';
  end if;
  if new.amount::numeric + v_paid > v_cap then
    raise exception 'payment exceeds outstanding: cap %, already paid %, attempted %',
      v_cap, v_paid, new.amount
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payments_guard_target on public.payments;
create trigger trg_payments_guard_target
  before insert or update of amount, target_type, target_id, project_id
  on public.payments
  for each row execute function public.guard_payment_target();

do $$ begin
  raise notice '239_financial_invariants: payment guard + ra paid-range constraint live';
end $$;
