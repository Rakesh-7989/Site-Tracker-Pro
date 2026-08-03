-- SiteTrack Pro — v4 Phase C2 hardening (review fixes, 2026-07-31).
-- Run AFTER 142_retainers_invoice_generation.sql. Idempotent.
--
-- Fixes surfaced by the Phase C2 review:
--
-- 1. MANAGER GATE HARMONIZATION — C1/C2 policies + billing RPCs previously
--    gated on IDENTITY role only (`current_role_text()` / `is_orgadmin()`).
--    The capabilities in permissions-matrix.ts are also granted to PROJECT-
--    TIER manager roles (project_members.role = pm / project_admin /
--    design_head / consultant_head), so a project-tier manager whose identity
--    role differs (e.g. global 'architect', project role 'pm') saw the UI
--    controls but got 42501 from the DB. The gate is now additive:
--      is_orgadmin() OR superadmin OR identity-manager
--        OR has_project_role(<project>, 'pm','project_admin','design_head','consultant_head')
--    Touches: fee_phases_write, deliverables_delete, review_rounds_manage,
--    rate_cards_write, retainers_write, and the 3 RPCs.
--
-- 2. GENERATED-INVOICE UNIQUENESS — partial unique index prevents two ACTIVE
--    'hourly' / 'retainer' invoices for the same project+period (double-click
--    / concurrent race). A cancelled-then-regenerated invoice reuses the
--    deterministic `no` label — accepted (label only; `no` is unconstrained).
--
-- 3. POST-APPROVAL EDIT LOCK — time_entries self-edit/delete now require the
--    entry to still be pending AND unbilled (the previous C1 policy let the
--    owner mutate an approved / already-invoiced entry via direct API; only
--    the UI blocked it). orgadmin keeps full access. NOTE: must live here,
--    not in 137, because 137 runs before 141 adds approval_status/billed.
--
-- 4. approve_time_entry REOPEN — `approved_by` is nulled when reopening to
--    'pending', consistent with `approved_at`.
--
-- 5. RETAINER PERIOD VALIDATION — generate_retainer_invoice refuses periods
--    before start_date or after end_date.

BEGIN;

-- ── 1a. Gate harmonization: C1 policies (138 / 139) ─────────────────────────
drop policy if exists fee_phases_write on public.fee_phases;
create policy fee_phases_write on public.fee_phases for all
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
    )
  )
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
    )
  );

drop policy if exists deliverables_delete on public.deliverables;
create policy deliverables_delete on public.deliverables for delete
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
    )
  );

drop policy if exists review_rounds_manage on public.review_rounds;
create policy review_rounds_manage on public.review_rounds for update
  using (
    (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
    or exists (
      select 1 from public.deliverables d
      where d.id = review_rounds.deliverable_id
        and has_project_role(d.project_id, 'pm','project_admin','design_head','consultant_head')
    )
  )
  with check (
    (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
    or exists (
      select 1 from public.deliverables d
      where d.id = review_rounds.deliverable_id
        and has_project_role(d.project_id, 'pm','project_admin','design_head','consultant_head')
    )
  );

-- ── 1b. Gate harmonization: C2 policies (141 / 142) ─────────────────────────
drop policy if exists rate_cards_write on public.rate_cards;
create policy rate_cards_write on public.rate_cards for all
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
    )
  )
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
    )
  );

drop policy if exists retainers_write on public.retainers;
create policy retainers_write on public.retainers for all
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
    )
  )
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(project_id, 'pm','project_admin','design_head','consultant_head')
    )
  );

-- ── 2. Generated-invoice uniqueness ──────────────────────────────────────────
-- One ACTIVE hourly/retainer invoice per project+period. Cancelled rows stay
-- exempt so cancel→regenerate keeps working (the `no` label may repeat).
create unique index if not exists uq_invoices_project_source_period
  on public.invoices(project_id, source, period_from, period_to)
  where source is not null and status <> 'cancelled';

-- ── 3. Post-approval / billed self-edit lock ────────────────────────────────
drop policy if exists time_entries_edit_self on public.time_entries;
create policy time_entries_edit_self on public.time_entries for update
  using (
    (profile_id = auth.uid() and approval_status = 'pending' and not billed)
    or is_orgadmin()
  )
  with check (
    (profile_id = auth.uid() and approval_status = 'pending' and not billed)
    or is_orgadmin()
  );

drop policy if exists time_entries_delete_self on public.time_entries;
create policy time_entries_delete_self on public.time_entries for delete
  using (
    (profile_id = auth.uid() and approval_status = 'pending' and not billed)
    or is_orgadmin()
  );

-- ── 4 + 5. RPC rebuilds (gate harmonization + reopen + period validation) ────
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
  select project_id into v_project from public.time_entries where id = p_entry_id;
  if v_project is null then
    raise exception 'time entry not found' using errcode = 'P0002';
  end if;
  if not (
    v_project in (select public.user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(v_project, 'pm','project_admin','design_head','consultant_head')
    )
  ) then
    raise exception 'only engagement managers of this project may approve time entries' using errcode = '42501';
  end if;
  update public.time_entries
     set approval_status = p_status,
         approved_by = case when p_status = 'pending' then null else auth.uid() end,
         approved_at = case when p_status = 'pending' then null else now() end
   where id = p_entry_id;
  return p_entry_id;
end;
$$;

grant execute on function public.approve_time_entry(uuid, text) to authenticated;

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

  return v_invoice;
end;
$$;

grant execute on function public.generate_retainer_invoice(uuid, date, date) to authenticated;

DO $$ DECLARE
  n_pol int; n_idx int; n_rt int;
BEGIN
  SELECT count(*) INTO n_pol FROM pg_policies
    WHERE schemaname = 'public' AND policyname IN (
      'fee_phases_write','deliverables_delete','review_rounds_manage',
      'rate_cards_write','retainers_write','time_entries_edit_self','time_entries_delete_self'
    );
  SELECT count(*) INTO n_idx FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_invoices_project_source_period';
  SELECT count(*) INTO n_rt FROM public.retainers;
  RAISE NOTICE '143_consultancy_billing_hardening: % harmonized policies, unique-index=%, retainers=% (RPCs rebuilt: has_project_role gate, reopen clears approved_by, retainer period bounds)',
    n_pol, n_idx, n_rt;
END $$;

COMMIT;
