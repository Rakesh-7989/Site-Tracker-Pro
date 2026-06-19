-- 110_approval_status_guards.sql
-- Guard approval/status transitions at the database layer.
--
-- Context: v3 bridge policies allow active project writers to update many
-- project child rows, while the React UI gates precise actions with
-- capabilities. This trigger adds the missing DB backstop for business
-- approval decisions: CO, RA bill, PO, and invoice status changes.
--
-- Safe to re-run.

begin;

create or replace function public.can_approve_project_status(
  p_project_id uuid,
  p_resource text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;

  if v_org is null then
    return false;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;

  if public.is_superadmin() or public.has_org_tier(v_org, 'admin') then
    return true;
  end if;

  if p_resource = 'change_order' then
    return
      public.has_project_role(p_project_id, 'pm', 'senior_architect', 'design_head', 'consultant_head')
      or (
        public.can_write_project(p_project_id)
        and public.has_identity_role('pm', 'senior_architect', 'design_head', 'consultant_head', 'orgadmin')
      );
  elsif p_resource = 'ra_bill' then
    return
      public.has_project_role(p_project_id, 'pm', 'project_admin')
      or (
        public.can_write_project(p_project_id)
        and public.has_identity_role('pm', 'project_admin', 'orgadmin')
      );
  elsif p_resource = 'purchase_order' then
    return
      public.has_project_role(p_project_id, 'project_admin')
      or (
        public.can_write_project(p_project_id)
        and public.has_identity_role('project_admin', 'orgadmin')
      );
  elsif p_resource = 'invoice' then
    return
      public.has_project_role(p_project_id, 'project_admin')
      or (
        public.can_write_project(p_project_id)
        and public.has_identity_role('project_admin', 'orgadmin')
      );
  end if;

  return false;
end;
$$;

comment on function public.can_approve_project_status(uuid, text) is
  'Approval guard helper for CO, RA bill, PO, and invoice status transitions.';

create or replace function public.guard_approval_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource text := tg_argv[0];
begin
  if old.status is distinct from new.status then
    if not public.can_approve_project_status(new.project_id, v_resource) then
      raise exception 'approval status change for % requires an approver role', v_resource
        using errcode = '42501';
    end if;

    if v_resource = 'change_order' then
      if new.status = 'approved' then
        new.approved_by := coalesce(new.approved_by, auth.uid());
        new.approved_at := coalesce(new.approved_at, now());
      end if;
    end if;
  end if;

  if v_resource = 'ra_bill' then
    if old.paid_amount is distinct from new.paid_amount then
      if not public.can_approve_project_status(new.project_id, v_resource) then
        raise exception 'paid amount change for % requires an approver role', v_resource
          using errcode = '42501';
      end if;
    end if;
  end if;

  if v_resource = 'invoice' then
    if old.paid_date is distinct from new.paid_date then
      if not public.can_approve_project_status(new.project_id, v_resource) then
        raise exception 'paid date change for % requires an approver role', v_resource
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.change_orders') is not null then
    drop trigger if exists trg_guard_change_order_status on public.change_orders;
    create trigger trg_guard_change_order_status
      before update on public.change_orders
      for each row execute function public.guard_approval_status_update('change_order');
  end if;

  if to_regclass('public.ra_bills') is not null then
    drop trigger if exists trg_guard_ra_bill_status on public.ra_bills;
    create trigger trg_guard_ra_bill_status
      before update on public.ra_bills
      for each row execute function public.guard_approval_status_update('ra_bill');
  end if;

  if to_regclass('public.purchase_orders') is not null then
    drop trigger if exists trg_guard_purchase_order_status on public.purchase_orders;
    create trigger trg_guard_purchase_order_status
      before update on public.purchase_orders
      for each row execute function public.guard_approval_status_update('purchase_order');
  end if;

  if to_regclass('public.invoices') is not null then
    drop trigger if exists trg_guard_invoice_status on public.invoices;
    create trigger trg_guard_invoice_status
      before update on public.invoices
      for each row execute function public.guard_approval_status_update('invoice');
  end if;
end $$;

grant execute on function public.can_approve_project_status(uuid, text) to authenticated;

do $$ begin
  raise notice '110_approval_status_guards: approval transition guards installed';
end $$;

commit;
