-- SiteTrack Pro — C5: BOQ vs RA cap (financial invariant).
-- RA bills are progress claims against the BOQ. The sum of bill_amounts for a
-- project must not exceed the BOQ total (sum boq_items.amount) when a BOQ
-- exists; otherwise it must not exceed the project's sanctioned budget when
-- that is set. An empty BOQ + no budget means no cap (demo / early projects).
--
-- This closes the "RA exceeds estimate" class that the forecast view would
-- otherwise hide until overrun.

BEGIN;

create or replace function public.guard_ra_bill_boq_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_new_amount bigint;
  v_existing_sum bigint;
  v_boq_sum numeric;
  v_budget bigint;
  v_cap numeric;
begin
  v_project := coalesce(new.project_id, old.project_id);
  v_new_amount := coalesce(new.bill_amount, old.bill_amount, 0);

  -- Sum of OTHER RA bills (exclude the row being updated/inserted)
  select coalesce(sum(bill_amount), 0)::bigint into v_existing_sum
  from public.ra_bills
  where project_id = v_project
    and id <> coalesce(new.id, old.id);

  -- BOQ total for the project (amount is generated qty*rate)
  select coalesce(sum(amount), 0) into v_boq_sum
  from public.boq_items
  where project_id = v_project;

  if v_boq_sum > 0 then
    v_cap := v_boq_sum;
  else
    select budget into v_budget from public.projects where id = v_project;
    if v_budget is not null and v_budget > 0 then
      v_cap := v_budget;
    else
      return new; -- no cap when BOQ empty and no budget
    end if;
  end if;

  if (v_existing_sum + v_new_amount) > v_cap then
    raise exception 'RA bill cap exceeded: % + % > cap % (BOQ/budget)', v_existing_sum, v_new_amount, v_cap
      using errcode = 'P0001', hint = 'Reduce the bill amount or increase the BOQ/budget.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ra_bill_boq_cap on public.ra_bills;
create trigger trg_ra_bill_boq_cap
  before insert or update of bill_amount, project_id on public.ra_bills
  for each row execute function public.guard_ra_bill_boq_cap();

comment on function public.guard_ra_bill_boq_cap() is 'C5: RA bill_amount cap vs BOQ sum (or budget).';

do $$ begin raise notice '252_boq_ra_cap: trigger trg_ra_bill_boq_cap live'; end $$;

COMMIT;
