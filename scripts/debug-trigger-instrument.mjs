#!/usr/bin/env node
// Instrument the handle_new_signup trigger with detailed step logging so
// the next Supabase Auth signup failure tells us WHICH step blew up.
// Idempotent — safe to re-run.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const sql = `
-- Debug log table — append-only.
create table if not exists signup_debug_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  step text not null,
  ok boolean not null,
  email text,
  detail text,
  errcode text,
  meta jsonb
);
grant insert on signup_debug_log to public;

-- Replace the trigger function with an instrumented version. Every step
-- writes a row to signup_debug_log BEFORE doing the work, then another
-- row AFTER success. On exception we capture the SQLSTATE + message.
create or replace function handle_new_signup() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  new_org_id   uuid;
  v_firm_name  text;
  v_plan       text;
  v_user_name  text;
  v_requires_super boolean;
  v_step text := 'start';
begin
  insert into signup_debug_log(step, ok, email, meta)
    values ('start', true, new.email, new.raw_user_meta_data);

  v_firm_name := nullif(trim(coalesce(new.raw_user_meta_data->>'firm_name','')),'');
  v_plan      := coalesce(new.raw_user_meta_data->>'plan', 'basic');
  v_user_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name','')),'');
  if v_user_name is null then
    v_user_name := split_part(new.email, '@', 1);
  end if;

  insert into signup_debug_log(step, ok, email, detail, meta)
    values ('parsed_metadata', true, new.email,
      format('firm=%s plan=%s name=%s', v_firm_name, v_plan, v_user_name),
      jsonb_build_object('firm', v_firm_name, 'plan', v_plan, 'name', v_user_name));

  if v_firm_name is not null then
    v_step := 'check_plan_lock';
    select coalesce(requires_superadmin, false) into v_requires_super
      from public.plans where id = v_plan;
    if v_requires_super then
      insert into signup_debug_log(step, ok, email, detail)
        values ('plan_lock_violation', false, new.email,
          format('plan=%s requires superadmin', v_plan));
      raise exception 'Plan "%" requires super-admin approval.', v_plan using errcode = 'P0001';
    end if;

    v_step := 'insert_organization';
    insert into public.organizations(slug, name, plan)
      values (
        lower(regexp_replace(v_firm_name, '[^a-zA-Z0-9]+', '-', 'g'))
          || '-' || substr(encode(gen_random_bytes(3),'hex'), 1, 6),
        v_firm_name,
        v_plan
      )
      returning id into new_org_id;
    insert into signup_debug_log(step, ok, email, detail, meta)
      values ('insert_organization', true, new.email,
        format('org_id=%s', new_org_id),
        jsonb_build_object('org_id', new_org_id, 'plan', v_plan));

    v_step := 'insert_profile';
    insert into public.profiles(id, name, role)
      values (new.id, v_user_name, 'orgadmin')
      on conflict (id) do update set name = excluded.name, role = excluded.role;
    insert into signup_debug_log(step, ok, email)
      values ('insert_profile', true, new.email);

    v_step := 'insert_org_member';
    insert into public.org_members(org_id, profile_id, role)
      values (new_org_id, new.id, 'admin')
      on conflict do nothing;
    insert into signup_debug_log(step, ok, email)
      values ('insert_org_member', true, new.email);

    v_step := 'insert_audit';
    insert into public.audit_log_v2(org_id, actor_id, actor_name, actor_role,
      action, resource, resource_id, after, message)
    values (new_org_id, new.id, v_user_name, 'orgadmin',
      'CREATE', 'organization', new_org_id::text,
      jsonb_build_object('name', v_firm_name, 'plan', v_plan),
      format('Self-serve signup — %s firm created on %s plan', v_firm_name, v_plan));
    insert into signup_debug_log(step, ok, email)
      values ('insert_audit', true, new.email);

  else
    v_step := 'insert_profile_invited';
    insert into public.profiles(id, name, role)
      values (new.id, v_user_name, 'client')
      on conflict (id) do nothing;
    insert into signup_debug_log(step, ok, email)
      values ('insert_profile_invited', true, new.email);
  end if;

  insert into signup_debug_log(step, ok, email)
    values ('complete', true, new.email);

  return new;
exception when others then
  insert into signup_debug_log(step, ok, email, detail, errcode, meta)
    values (v_step || ':EXCEPTION', false, new.email, SQLERRM, SQLSTATE,
      jsonb_build_object('raw_meta', new.raw_user_meta_data));
  -- Re-raise so Supabase Auth still sees the failure
  raise;
end;
$$;

comment on function handle_new_signup is
  'Sprint 1 (Session 30.5) — instrumented version. Every step writes to signup_debug_log so failures can be diagnosed without server logs.';
`;

await c.query(sql);
console.log("✅ trigger instrumented + signup_debug_log table ready");
await c.end();
