-- SiteTrack Pro — v4 Phase C2: retainers + invoice sourcing + billing RPCs.
-- Run AFTER 141_rate_cards_time_approval.sql. Idempotent.
--
-- retainers: monthly recurring fixed fees on a consultancy/design project.
--   Manual generation per month (no cron) via generate_retainer_invoice,
--   which guards against double-billing the same period.
--
-- invoices additions: source ('phase' | 'hourly' | 'retainer') + period tags
--   keep the flat invoice model (amount/gst/tds) while making generated
--   invoices traceable. The C1 phase_id hook remains for phase invoices.
--
-- RPCs (all SECURITY DEFINER, manager-gated, granted to authenticated):
--   approve_time_entry(p_entry_id, p_status)
--     time:approve → pending / approved / rejected + approver stamp.
--   generate_hourly_invoice(p_project_id, p_from, p_to)
--     billing:generate → picks approved + billable + unbilled entries in the
--     period, rate = entry rate ?? latest rate card <= entry date ?? 0,
--     creates a flat 'hourly' invoice, then marks entries billed atomically.
--   generate_retainer_invoice(p_retainer_id, p_from, p_to)
--     billing:generate → creates a 'retainer' invoice for monthly_amount.
--
-- Capability mapping:
--   retainer:manage → create/edit/delete retainers → RLS: managers + org admin
--   billing:generate → invoice generation → RPC gate: managers + org admin
--   time:approve     → approve/reject time entries → RPC gate (see 141)
--
-- Manager identity roles: pm, project_admin, design_head, consultant_head,
-- orgadmin, superadmin (mirrors permissions-matrix.ts).

BEGIN;

create table if not exists public.retainers (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  title          text not null,
  monthly_amount bigint not null default 0 check (monthly_amount >= 0),   -- whole ₹
  status         text not null default 'active'
    check (status in ('active','paused','cancelled')),
  start_date     date not null default current_date,
  end_date       date,
  billing_day    int not null default 1 check (billing_day between 1 and 28),
  created_at     timestamptz not null default now()
);

create index if not exists idx_retainers_project on public.retainers(project_id, status);

alter table public.retainers enable row level security;

drop policy if exists retainers_read on public.retainers;
create policy retainers_read on public.retainers for select
  using (project_id in (select user_project_ids()));

drop policy if exists retainers_write on public.retainers;
create policy retainers_write on public.retainers for all
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  )
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

grant select, insert, update, delete on public.retainers to authenticated;

-- ── invoices: source + period tags ──────────────────────────────────────────
alter table public.invoices add column if not exists source text
  check (source in ('phase','hourly','retainer'));

alter table public.invoices add column if not exists period_from date;
alter table public.invoices add column if not exists period_to date;

alter table public.invoices
  add column if not exists retainer_id uuid references public.retainers(id) on delete set null;

create index if not exists idx_invoices_source on public.invoices(project_id, source)
  where source is not null;

create index if not exists idx_invoices_retainer_period on public.invoices(retainer_id, period_from)
  where retainer_id is not null;

-- ── approve_time_entry ──────────────────────────────────────────────────────
create or replace function public.approve_time_entry(p_entry_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare v_project uuid;
begin
  if p_status not in ('pending','approved','rejected') then
    raise exception 'invalid status: %', p_status using errcode = '22023';
  end if;
  if not (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')) then
    raise exception 'only engagement managers may approve time entries' using errcode = '42501';
  end if;
  select project_id into v_project from public.time_entries where id = p_entry_id;
  if v_project is null then
    raise exception 'time entry not found' using errcode = 'P0002';
  end if;
  if not (v_project in (select public.user_project_ids())) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;
  update public.time_entries
     set approval_status = p_status,
         approved_by = auth.uid(),
         approved_at = case when p_status = 'pending' then null else now() end
   where id = p_entry_id;
  return p_entry_id;
end;
$$;

grant execute on function public.approve_time_entry(uuid, text) to authenticated;

-- ── generate_hourly_invoice ─────────────────────────────────────────────────
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
  if not (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')) then
    raise exception 'only engagement managers may generate invoices' using errcode = '42501';
  end if;
  if not (p_project_id in (select public.user_project_ids())) then
    raise exception 'not a member of this project' using errcode = '42501';
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

  select coalesce(sum(t.hours * t.rate), 0), count(*)
    into v_total, v_entries
    from (
      select te.hours,
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
       where te.project_id = p_project_id
         and te.approval_status = 'approved'
         and te.billable
         and not te.billed
         and te.date between p_from and p_to
    ) t;

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

-- ── generate_retainer_invoice ───────────────────────────────────────────────
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
  if not (is_orgadmin() or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')) then
    raise exception 'only engagement managers may generate invoices' using errcode = '42501';
  end if;
  select * into v_retainer from public.retainers where id = p_retainer_id;
  if v_retainer.id is null then
    raise exception 'retainer not found' using errcode = 'P0002';
  end if;
  if v_retainer.status <> 'active' then
    raise exception 'retainer is not active' using errcode = '42501';
  end if;
  if not (v_retainer.project_id in (select public.user_project_ids())) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid billing period' using errcode = '22023';
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

  return v_invoice;
end;
$$;

grant execute on function public.generate_retainer_invoice(uuid, date, date) to authenticated;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.retainers;
  RAISE NOTICE '142_retainers_invoice_generation: retainers=% (invoices.source/period added, RPCs ready)', n;
END $$;

COMMIT;
