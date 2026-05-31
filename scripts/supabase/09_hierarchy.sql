-- SiteTrack Pro — Project hierarchy: blocks → floors → units
-- Run AFTER 08_project_archive.sql. Idempotent.
--
-- Mirrors src/data/seed.js INIT_BLOCKS / INIT_FLOORS / INIT_UNITS and the
-- pure-function lib at src/lib/hierarchy.js.

-- ============================================================================
-- 1. Blocks (e.g. "Tower A", "Tower B")
-- ============================================================================

create table if not exists blocks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  sort_order  int default 0,
  created_at  timestamptz default now()
);
create index if not exists idx_blocks_project on blocks(project_id, sort_order);

-- ============================================================================
-- 2. Floors (e.g. "Tower A · Floor 7")
-- ============================================================================

create table if not exists floors (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references blocks(id) on delete cascade,
  level       int not null,
  name        text,
  created_at  timestamptz default now(),
  unique (block_id, level)
);
create index if not exists idx_floors_block on floors(block_id, level);

-- ============================================================================
-- 3. Units (e.g. "Tower A · F7 · 7B")
-- ============================================================================

create table if not exists units (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null references floors(id) on delete cascade,
  unit_code   text not null,
  unit_type   text,
  carpet_sqft numeric(10,2),
  status      text default 'planned'
    check (status in ('planned','booked','under_construction','ready','handover','sold')),
  notes       text,
  created_at  timestamptz default now(),
  unique (floor_id, unit_code)
);
create index if not exists idx_units_floor on units(floor_id);
create index if not exists idx_units_status on units(status);

-- ============================================================================
-- 4. RLS
-- ============================================================================

alter table blocks enable row level security;
alter table floors enable row level security;
alter table units  enable row level security;

create policy blocks_read on blocks for select
  using (project_id in (select user_project_ids()));
create policy blocks_write on blocks for all
  using (
    current_role_text() in ('architect','pm','orgadmin','project_admin','project_head','superadmin')
    and project_id in (select user_project_ids())
  )
  with check (
    current_role_text() in ('architect','pm','orgadmin','project_admin','project_head','superadmin')
    and project_id in (select user_project_ids())
  );

create policy floors_read on floors for select
  using (block_id in (select id from blocks where project_id in (select user_project_ids())));
create policy floors_write on floors for all
  using (
    current_role_text() in ('architect','pm','orgadmin','project_admin','project_head','superadmin')
    and block_id in (select id from blocks where project_id in (select user_project_ids()))
  )
  with check (
    current_role_text() in ('architect','pm','orgadmin','project_admin','project_head','superadmin')
    and block_id in (select id from blocks where project_id in (select user_project_ids()))
  );

create policy units_read on units for select
  using (
    floor_id in (
      select f.id from floors f join blocks b on b.id = f.block_id
       where b.project_id in (select user_project_ids())
    )
  );
create policy units_write on units for all
  using (
    current_role_text() in ('architect','pm','orgadmin','project_admin','project_head','superadmin')
    and floor_id in (
      select f.id from floors f join blocks b on b.id = f.block_id
       where b.project_id in (select user_project_ids())
    )
  )
  with check (
    current_role_text() in ('architect','pm','orgadmin','project_admin','project_head','superadmin')
    and floor_id in (
      select f.id from floors f join blocks b on b.id = f.block_id
       where b.project_id in (select user_project_ids())
    )
  );

-- ============================================================================
-- 5. Sanity
-- ============================================================================
do $$ declare b int; f int; u int; begin
  select count(*) into b from blocks;
  select count(*) into f from floors;
  select count(*) into u from units;
  raise notice '09_hierarchy: blocks=%, floors=%, units=%', b, f, u;
end $$;
