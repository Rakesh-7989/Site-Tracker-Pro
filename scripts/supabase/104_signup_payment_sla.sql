-- 104_signup_payment_sla.sql — manual payment tracking + 24h provisioning SLA
-- for paid-plan signups (zero-spend: staff confirms payment, then provisions
-- the org within 24h). Live gateway can be wired later without schema change.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='signup_requests' and column_name='payment_status') then
    alter table public.signup_requests add column payment_status text not null default 'unpaid'
      check (payment_status in ('unpaid','paid','waived'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='signup_requests' and column_name='payment_ref') then
    alter table public.signup_requests add column payment_ref text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='signup_requests' and column_name='paid_at') then
    alter table public.signup_requests add column paid_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='signup_requests' and column_name='paid_by') then
    alter table public.signup_requests add column paid_by uuid references public.profiles(id) on delete set null;
  end if;
end $$;

-- A staff (superadmin / owner / head / the assigned staff) confirms payment.
-- 'paid' stamps paid_at → starts the 24h provisioning SLA clock; 'waived' lets a
-- free/comped org through; 'unpaid' resets.
create or replace function public.mark_signup_paid(p_request uuid, p_ref text default null, p_status text default 'paid')
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('unpaid','paid','waived') then
    raise exception 'Bad payment status' using errcode = '22023';
  end if;
  if not (public.is_superadmin() or public.is_staff_head_or_owner()
          or exists (select 1 from public.signup_requests where id = p_request and assigned_staff_id = auth.uid())) then
    raise exception 'Only assigned staff / head / owner can confirm payment' using errcode = '42501';
  end if;
  update public.signup_requests set
    payment_status = p_status,
    payment_ref = nullif(trim(coalesce(p_ref,'')),''),
    paid_at = case when p_status = 'paid' then now() else null end,
    paid_by = case when p_status = 'paid' then auth.uid() else null end
  where id = p_request;
  return found;
end $$;

grant execute on function public.mark_signup_paid(uuid,text,text) to authenticated;
