-- 105_platform_settings.sql — platform key-value settings (UPI ID + payee name)
-- for zero-spend UPI-QR payments. Owner/head set them; the QR/checkout read them.

create table if not exists public.platform_settings (
  key        text primary key,
  value      text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
-- All access via the SECURITY DEFINER RPCs below (no direct policies).

-- Read the public payment settings (UPI id + payee name are meant to be shared
-- with payers, so this is readable by anon too).
create or replace function public.get_payment_settings()
  returns table (upi_id text, payee_name text)
  language sql stable security definer set search_path = public as $$
  select (select value from public.platform_settings where key = 'upi_id'),
         (select value from public.platform_settings where key = 'payee_name');
$$;

-- Owner/head set a known platform setting.
create or replace function public.set_platform_setting(p_key text, p_value text)
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_head_or_owner() then
    raise exception 'Only the owner or staff head can change platform settings' using errcode = '42501';
  end if;
  if p_key not in ('upi_id', 'payee_name') then
    raise exception 'Unknown setting key' using errcode = '22023';
  end if;
  insert into public.platform_settings(key, value, updated_by, updated_at)
    values (p_key, nullif(trim(coalesce(p_value,'')),''), auth.uid(), now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return true;
end $$;

grant execute on function public.get_payment_settings() to authenticated, anon;
grant execute on function public.set_platform_setting(text, text) to authenticated;

-- A payer (anon, on the public /pay page) attaches their UPI transaction ref to
-- a signup request. Stays 'unpaid' until a staff verifies the money landed and
-- marks it received — so this can't self-approve.
create or replace function public.submit_payment_claim(p_request uuid, p_utr text)
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  update public.signup_requests
    set payment_ref = nullif(trim(coalesce(p_utr,'')),'')
    where id = p_request and payment_status <> 'paid';
  return found;
end $$;
grant execute on function public.submit_payment_claim(uuid, text) to authenticated, anon;

-- public: load a signup request for the /pay page (firm/plan/status).
create or replace function public.get_signup_for_pay(p_request uuid)
  returns table(firm_name text, plan text, email text, payment_status text)
  language sql stable security definer set search_path = public as $$
  select firm_name, plan, email, payment_status from public.signup_requests where id = p_request
$$;
grant execute on function public.get_signup_for_pay(uuid) to authenticated, anon;
