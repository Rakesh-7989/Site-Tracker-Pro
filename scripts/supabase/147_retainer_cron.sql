-- SiteTrack Pro — v4 Phase C3.4: scheduled retainer invoice generation (pg_cron).
-- Run AFTER 146_invoice_lines.sql. Idempotent.
--
-- Adds admin_generate_due_retainer_invoices(): a SECURITY DEFINER function that
-- a daily pg_cron job calls. On each tick it walks every ACTIVE retainer whose
-- billing_day matches today (IST), and auto-generates that month's retainer
-- invoice + line item, honouring start/end bounds and never duplicating an
-- existing invoice for the same (retainer, period).
--
-- Period semantics (user-confirmed): the CURRENT month [1st .. last day] is
-- billed on the retainer's billing_day.
--
-- Security: granted ONLY to service_role. Cron runs as postgres (function
-- owner), so the job bypasses RLS and role gates. Normal authenticated users
-- cannot invoke it (no grant) — the manual Generate flow stays as-is.

BEGIN;

-- ── 1. Cron function ─────────────────────────────────────────────────────────
create or replace function public.admin_generate_due_retainer_invoices()
returns table (
  retainer_id uuid,
  project_id  uuid,
  outcome     text,
  detail      text
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_from   date;
  v_to     date;
  v_month  date;
  v_inv    uuid;
  v_ret    record;
  v_row    record;
begin
  v_month := date_trunc('month', v_today)::date;
  v_from  := v_month;
  v_to    := (date_trunc('month', v_month) + interval '1 month' - interval '1 day')::date;

  for v_ret in
    select r.id, r.project_id, r.title, r.monthly_amount, r.start_date, r.end_date
      from public.retainers r
     where r.status = 'active'
       and extract(day from v_today) = r.billing_day
     order by r.id
  loop
    retainer_id := v_ret.id;
    project_id  := v_ret.project_id;
    outcome     := 'generated';
    detail      := '';

    begin
      -- Bounds: refuse periods entirely outside the retainer's start/end window.
      if (v_ret.start_date is not null and v_to < v_ret.start_date)
         or (v_ret.end_date is not null and v_from > v_ret.end_date) then
        outcome := 'skipped_out_of_range';
        detail  := format('period %s..%s outside %s..%s', v_from, v_to, v_ret.start_date, v_ret.end_date);
        return next;
        continue;
      end if;

      -- Idempotency: never duplicate an existing (non-cancelled) invoice.
      if exists (
        select 1 from public.invoices i
         where i.retainer_id = v_ret.id and i.source = 'retainer'
           and i.period_from = v_from and i.period_to = v_to
           and i.status <> 'cancelled'
      ) then
        outcome := 'skipped_existing';
        detail  := format('invoice already exists for %s..%s', v_from, v_to);
        return next;
        continue;
      end if;

      insert into public.invoices
        (project_id, no, amount, gst, tds, status, issued_date, source, period_from, period_to, retainer_id)
      values (
        v_ret.project_id,
        'RTR-' || to_char(v_from, 'YYYYMM') || '-' || substr(md5(v_ret.id::text || v_from::text || v_to::text), 1, 6),
        v_ret.monthly_amount, 18, 2, 'sent', current_date, 'retainer', v_from, v_to, v_ret.id
      )
      returning id into v_inv;

      insert into public.invoice_lines (invoice_id, description, qty, unit_price, amount, sort_order)
      values (v_inv, coalesce(v_ret.title, 'Retainer'), 1, v_ret.monthly_amount, v_ret.monthly_amount, 0);

      detail := format('invoice %s for %s..%s', v_inv, v_from, v_to);
    exception when others then
      outcome := 'error';
      detail  := sqlerrm;
    end;

    return next;
  end loop;

  return;
end;
$$;

-- Only service_role may invoke (cron runs as postgres = owner; the app's manual
-- flow uses generate_retainer_invoice). Revoke default public execute.
revoke all on function public.admin_generate_due_retainer_invoices() from public;
grant execute on function public.admin_generate_due_retainer_invoices() to service_role;

-- ── 2. Daily cron schedule (idempotent — no-op if the job name exists) ──────
-- 02:05 UTC daily ≈ 07:35 IST — well after midnight so billing_day is stable.
select cron.schedule(
  'generate-due-retainers',
  '5 2 * * *',
  'select public.admin_generate_due_retainer_invoices()'
);

DO $$ BEGIN
  RAISE NOTICE '147_retainer_cron: admin_generate_due_retainer_invoices + daily job ready';
END $$;

COMMIT;
