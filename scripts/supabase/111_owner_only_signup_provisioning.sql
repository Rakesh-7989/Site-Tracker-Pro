-- SiteTrack Pro -- owner-only signup provisioning guard (2026-06-19).
--
-- Policy:
--   * Owner may create/provision an org without payment.
--   * Non-owner staff may approve only after the OWNER confirms payment.
--   * Old self-serve auth signup must never auto-create an org.
--   * Direct table writes must not bypass the Edge Function/payment flow.

begin;

-- Keep the auth.users trigger for profile creation, but remove the historical
-- self-serve organization creation branch. New customer orgs are provisioned by
-- review_signup_request only.
create or replace function public.handle_new_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user_name text;
begin
  v_user_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name','')),'');
  if v_user_name is null then
    v_user_name := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles(id, name, role)
    values (new.id, v_user_name, 'client')
    on conflict (id) do update
      set name = coalesce(nullif(excluded.name, ''), public.profiles.name);

  return new;
end;
$$;

drop trigger if exists trg_handle_signup on auth.users;
create trigger trg_handle_signup
  after insert on auth.users
  for each row execute function public.handle_new_signup();

-- Replace the broad org policy: staff can still read/manage existing platform
-- org rows per the older superadmin policy, but direct org INSERT is owner-only.
drop policy if exists admin_orgs on public.organizations;
drop policy if exists admin_orgs_read on public.organizations;
drop policy if exists admin_orgs_update on public.organizations;
drop policy if exists admin_orgs_delete on public.organizations;
drop policy if exists admin_orgs_insert_owner on public.organizations;

create policy admin_orgs_read on public.organizations for select
  using (public.is_superadmin());

create policy admin_orgs_update on public.organizations for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy admin_orgs_delete on public.organizations for delete
  using (public.is_superadmin());

create policy admin_orgs_insert_owner on public.organizations for insert
  with check (public.is_staff_owner());

-- Prevent direct table approval. Approval must use the Edge Function because it
-- creates the org, links the applicant, and applies the payment guard atomically.
create or replace function public.guard_signup_request_direct_approval()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and old.status is distinct from new.status
     and new.status = 'approved' then
    raise exception 'Use review_signup_request to approve signup requests'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_signup_request_direct_approval on public.signup_requests;
create trigger trg_guard_signup_request_direct_approval
  before update on public.signup_requests
  for each row execute function public.guard_signup_request_direct_approval();

-- Direct signup_request UPDATE is owner-only. Other staff actions go through
-- SECURITY DEFINER RPCs / Edge Functions that enforce their own narrower gates.
drop policy if exists signup_requests_super_write on public.signup_requests;
drop policy if exists signup_requests_owner_write on public.signup_requests;
create policy signup_requests_owner_write on public.signup_requests for update
  using (public.is_staff_owner())
  with check (public.is_staff_owner());

-- Owner is the only human who can confirm, waive, or reset signup payment.
-- Service role remains allowed for trusted system jobs/webhooks.
create or replace function public.mark_signup_paid(p_request uuid, p_ref text default null, p_status text default 'paid')
  returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('unpaid','paid','waived') then
    raise exception 'Bad payment status' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and not public.is_staff_owner() then
    raise exception 'Only the owner can confirm or waive signup payment' using errcode = '42501';
  end if;

  update public.signup_requests set
    payment_status = p_status,
    payment_ref = nullif(trim(coalesce(p_ref,'')),''),
    paid_at = case when p_status = 'paid' then now() else null end,
    paid_by = case when p_status = 'paid' then auth.uid() else null end
  where id = p_request;
  return found;
end;
$$;

grant execute on function public.mark_signup_paid(uuid,text,text) to authenticated;

do $$ begin
  raise notice '111_owner_only_signup_provisioning: owner-only org/payment bypass guards installed';
end $$;

commit;
