-- SiteTrack Pro — v4 consultancy hardening fix (H1).
-- Migration 146_invoice_lines.sql re-created the two billing RPCs from the
-- pre-hardening 142 bodies: it dropped the has_project_role project-tier gate
-- and the retainer period bounds that migration 143 added. Result: a
-- project-tier manager (identity role e.g. architect, project_role pm) sees the
-- BillingTab Generate buttons but the RPC throws 42501; and the cron/retainer
-- start/end bounds are unenforced.
--
-- This migration re-creates both RPCs with the 143 gate + bounds merged back
-- into the 146 bodies (which emit invoice_lines). Idempotent — CREATE OR
-- REPLACE only, no schema change, no grants change.

BEGIN;

create or replace function public.generate_hourly_invoice(p_project_id uuid, p_from date, p_to date)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_total   numeric(14,2);
  v_entries bigint;
  v_invoice uuid;
begin
  if not (
    p_project_id in (select public.user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(p_project_id, 'pm','project_admin','design_head','consultant_head')
    )
  ) then
    raise exception 'only engagement managers of this project may generate invoices' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid billing period' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.invoices
     where project_id = p_project_id and source = 'hourly'
       and period_from = p_from and period_to = p_to
       and status <> 'cancelled'
  ) then
    raise exception 'an invoice already exists for this project and period' using errcode = '23505';
  end if;

  -- Per-entry billing source (entry rate ?? latest rate card <= entry date ?? 0).
  create temp table _hrly on commit drop as
  select te.profile_id,
         p.name as member_name,
         te.hours,
         coalesce(
           te.rate,
           (select rc.rate from public.rate_cards rc
             where rc.project_id = te.project_id
               and rc.profile_id = te.profile_id
               and rc.effective_from <= te.date
             order by rc.effective_from desc
             limit 1),
           0
         ) as rate
    from public.time_entries te
    left join public.profiles p on p.id = te.profile_id
   where te.project_id = p_project_id
     and te.approval_status = 'approved'
     and te.billable
     and not te.billed
     and te.date between p_from and p_to;

  select coalesce(sum(hours * rate), 0), count(*)
    into v_total, v_entries
    from _hrly;

  if v_entries = 0 then
    raise exception 'no approved unbilled hours in period' using errcode = 'P0001';
  end if;
  if v_total <= 0 then
    raise exception 'approved unbilled hours have no rate (set an entry rate or rate card)' using errcode = 'P0001';
  end if;

  insert into public.invoices
    (project_id, no, amount, gst, tds, status, issued_date, source, period_from, period_to)
  values (
    p_project_id,
    'HRY-' || to_char(p_from, 'YYYYMM') || '-' || substr(md5(p_project_id::text || p_from::text || p_to::text), 1, 6),
    round(v_total)::bigint, 18, 2, 'sent', current_date, 'hourly', p_from, p_to
  )
  returning id into v_invoice;

  -- Line items: one per (member, rate).
  insert into public.invoice_lines (invoice_id, description, qty, unit_price, amount, sort_order)
  select v_invoice,
         coalesce(member_name, 'Member'),
         sum(hours),
         rate,
         round(sum(hours) * rate)::bigint,
         row_number() over (order by round(sum(hours) * rate)::bigint desc)
    from _hrly
   group by profile_id, member_name, rate;

  update public.time_entries te
     set billed = true, billed_invoice_id = v_invoice
   where te.project_id = p_project_id
     and te.approval_status = 'approved'
     and te.billable
     and not te.billed
     and te.date between p_from and p_to;

  return v_invoice;
end;
$$;

grant execute on function public.generate_hourly_invoice(uuid, date, date) to authenticated;

create or replace function public.generate_retainer_invoice(p_retainer_id uuid, p_from date, p_to date)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_retainer public.retainers%rowtype;
  v_invoice  uuid;
begin
  select * into v_retainer from public.retainers where id = p_retainer_id;
  if v_retainer.id is null then
    raise exception 'retainer not found' using errcode = 'P0002';
  end if;
  if not (
    v_retainer.project_id in (select public.user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(v_retainer.project_id, 'pm','project_admin','design_head','consultant_head')
    )
  ) then
    raise exception 'only engagement managers of this project may generate invoices' using errcode = '42501';
  end if;
  if v_retainer.status <> 'active' then
    raise exception 'retainer is not active' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid billing period' using errcode = '22023';
  end if;
  if p_from < v_retainer.start_date then
    raise exception 'period starts before the retainer start date' using errcode = '22023';
  end if;
  if v_retainer.end_date is not null and p_to > v_retainer.end_date then
    raise exception 'period ends after the retainer end date' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.invoices
     where retainer_id = p_retainer_id and source = 'retainer'
       and period_from = p_from and period_to = p_to
       and status <> 'cancelled'
  ) then
    raise exception 'an invoice already exists for this retainer and period' using errcode = '23505';
  end if;

  insert into public.invoices
    (project_id, no, amount, gst, tds, status, issued_date, source, period_from, period_to, retainer_id)
  values (
    v_retainer.project_id,
    'RTR-' || to_char(p_from, 'YYYYMM') || '-' || substr(md5(p_retainer_id::text || p_from::text || p_to::text), 1, 6),
    v_retainer.monthly_amount, 18, 2, 'sent', current_date, 'retainer', p_from, p_to, p_retainer_id
  )
  returning id into v_invoice;

  insert into public.invoice_lines (invoice_id, description, qty, unit_price, amount, sort_order)
  values (v_invoice, coalesce(v_retainer.title, 'Retainer'), 1, v_retainer.monthly_amount, v_retainer.monthly_amount, 0);

  return v_invoice;
end;
$$;

grant execute on function public.generate_retainer_invoice(uuid, date, date) to authenticated;

DO $$ BEGIN
  RAISE NOTICE '183_billing_rpc_hardening_fix: has_project_role gate + retainer bounds restored on both billing RPCs';
END $$;

COMMIT;