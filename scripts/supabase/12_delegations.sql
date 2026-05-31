-- SiteTrack Pro — Approval delegations (out-of-office handoff).
-- Run AFTER 11_material_prices.sql. Idempotent.
--
-- Mirrors src/lib/delegations.js + INIT_DELEGATIONS seed.
-- A delegation: user X delegates approval power for resource R to user Y
-- between [start_at, end_at]. resolveApprover() in the JS lib reads from
-- here when computing the effective approver at any moment in time.

create table if not exists delegations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  from_user   uuid not null references profiles(id) on delete cascade,
  to_user     uuid not null references profiles(id) on delete cascade,
  resource    text not null
    check (resource in (
      'expense','po','ra_bill','change_order','invoice','drawing_release','*'
    )),
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  reason      text,
  active      boolean default true,
  revoked_at  timestamptz,
  revoked_by  uuid references profiles(id),
  created_by  uuid references profiles(id),
  created_at  timestamptz default now(),
  check (end_at > start_at),
  check (from_user <> to_user)
);

create index if not exists idx_delegations_org_window on delegations(org_id, start_at, end_at)
  where active = true and revoked_at is null;
create index if not exists idx_delegations_from on delegations(from_user, resource)
  where active = true;
create index if not exists idx_delegations_to on delegations(to_user, resource)
  where active = true;

alter table delegations enable row level security;

create policy delegations_read on delegations for select
  using (
    is_superadmin()
    or org_id = user_org_id()
  );

-- Only the delegator can create OR revoke; org_admin can override.
create policy delegations_write on delegations for all
  using (
    is_superadmin()
    or (is_orgadmin() and org_id = user_org_id())
    or (from_user = auth.uid() and org_id = user_org_id())
  )
  with check (
    is_superadmin()
    or (is_orgadmin() and org_id = user_org_id())
    or (from_user = auth.uid() and org_id = user_org_id())
  );

do $$ declare n int; begin
  select count(*) into n from delegations where active = true;
  raise notice '12_delegations: ready. % active delegation(s).', n;
end $$;
