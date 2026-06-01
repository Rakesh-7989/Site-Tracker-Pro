-- SiteTrack Pro — Self-serve signup → auto-create org + profile (Session 29).
-- Run AFTER 33_feature_flag_rls_extra.sql. Idempotent.
--
-- Implements Point 2 from the user's spec: "Plan theesukuna nodu org ni
-- create chesukova chu" — anyone who signs up with a firm name + plan
-- becomes the org_owner of a fresh organization. No super-admin needed.
--
-- The trigger fires on `auth.users` INSERT and reads
-- `raw_user_meta_data` (set by signUp({email, password, options:
-- {data: {firm_name, plan, name}}})) to decide whether to:
--   (a) create a new org + profile + org_members row (firm_name present)
--   (b) just create a profile row (invited member, no firm_name)

create or replace function public.handle_new_signup() returns trigger
language plpgsql security definer as $$
declare
  new_org_id   uuid;
  v_firm_name  text;
  v_plan       text;
  v_user_name  text;
  v_requires_super boolean;
begin
  v_firm_name := nullif(trim(coalesce(new.raw_user_meta_data->>'firm_name','')),'');
  v_plan      := coalesce(new.raw_user_meta_data->>'plan', 'basic');
  v_user_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name','')),'');
  if v_user_name is null then
    v_user_name := split_part(new.email, '@', 1);
  end if;

  if v_firm_name is not null then
    -- Self-serve org creation. Enforce Custom plan lock (Point 9).
    select coalesce(requires_superadmin, false) into v_requires_super
      from public.plans where id = v_plan;
    if v_requires_super then
      raise exception 'Plan "%" requires super-admin approval. Pick a self-serve plan or contact sales.', v_plan
        using errcode = 'P0001';
    end if;

    -- `slug` must be unique — append 6-hex suffix to avoid collisions.
    insert into public.organizations(slug, name, plan)
      values (
        lower(regexp_replace(v_firm_name, '[^a-zA-Z0-9]+', '-', 'g'))
          || '-' || substr(encode(gen_random_bytes(3),'hex'), 1, 6),
        v_firm_name,
        v_plan
      )
      returning id into new_org_id;

    insert into public.profiles(id, name, role)
      values (new.id, v_user_name, 'orgadmin')
      on conflict (id) do update set name = excluded.name, role = excluded.role;

    insert into public.org_members(org_id, profile_id, role)
      values (new_org_id, new.id, 'admin')
      on conflict do nothing;

    -- Record the signup in audit_log_v2 so the trail starts at day 0.
    insert into public.audit_log_v2(org_id, actor_id, actor_name, actor_role,
      action, resource, resource_id, after, message)
    values (new_org_id, new.id, v_user_name, 'orgadmin',
      'CREATE', 'organization', new_org_id::text,
      jsonb_build_object('name', v_firm_name, 'plan', v_plan),
      format('Self-serve signup — %s firm created on %s plan', v_firm_name, v_plan));
  else
    -- Invited member path (Point 6+7) — profile row only; org_members
    -- inserted later when they accept_org_invitation().
    insert into public.profiles(id, name, role)
      values (new.id, v_user_name, 'client')
      on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

-- Drop + recreate so the trigger picks up the latest function body.
drop trigger if exists trg_handle_signup on auth.users;
create trigger trg_handle_signup
  after insert on auth.users
  for each row execute function public.handle_new_signup();

do $$ declare n int; begin
  select count(*) into n from public.organizations;
  raise notice '34_signup_self_serve: ready. trigger live on auth.users. existing orgs: %.', n;
end $$;
