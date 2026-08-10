-- SiteTrack Pro — Measurement Book (MB) — PWD-spec append-only field measurements.
-- Run AFTER 09_hierarchy.sql. Idempotent.
--
-- Linked to BOQ items + RA bills. A single MB entry records a physical site
-- measurement that justifies a quantity claim downstream. Required for
-- government / RERA-eligible projects.

create table if not exists measurement_book (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  mb_no         text not null,                       -- statutory MB serial e.g. "MB-2026-031"
  page_no       int,
  boq_item_id   uuid references boq_items(id) on delete set null,
  description   text not null,
  location      text,                                -- e.g. "Tower A · 7th floor · Slab"
  block_id      uuid references blocks(id) on delete set null,
  floor_id      uuid references floors(id) on delete set null,
  unit          text,                                -- cum, sqm, rmt, nos, kg
  length        numeric(10,3),
  breadth       numeric(10,3),
  depth         numeric(10,3),
  qty           numeric(14,3) not null check (qty >= 0),
  rate          numeric(14,2),
  amount        numeric(16,2) generated always as (qty * coalesce(rate, 0)) stored,
  measured_by   uuid references profiles(id),
  measured_at   date default current_date,
  verified_by   uuid references profiles(id),
  verified_at   timestamptz,
  ra_bill_id    uuid,                                -- FK added in 11 once ra_bills is fully wired
  status        text default 'recorded'
    check (status in ('recorded','verified','billed','disputed','cancelled')),
  notes         text,
  created_at    timestamptz default now(),
  unique (project_id, mb_no, page_no)
);

create index if not exists idx_mb_project on measurement_book(project_id, measured_at desc);
create index if not exists idx_mb_boq on measurement_book(boq_item_id);
create index if not exists idx_mb_ra on measurement_book(ra_bill_id);

-- Append-only: revoke direct UPDATE/DELETE; corrections go via a new row + cancel.
alter table measurement_book enable row level security;

drop policy if exists mb_read on measurement_book;
create policy mb_read on measurement_book for select
  using (project_id in (select user_project_ids()));

drop policy if exists mb_insert on measurement_book;
create policy mb_insert on measurement_book for insert
  with check (
    current_role_text() in (
      'pm','site_engineer','civil_engineer','contractor','sub_contractor',
      'project_head','project_admin','orgadmin','superadmin','site_inspector'
    )
    and project_id in (select user_project_ids())
  );

-- Allow verification (status flip) but not data mutation. Enforce in app + RPC.
drop policy if exists mb_verify_update on measurement_book;
create policy mb_verify_update on measurement_book for update
  using (
    current_role_text() in ('pm','project_head','project_admin','orgadmin','superadmin')
    and project_id in (select user_project_ids())
  )
  with check (
    current_role_text() in ('pm','project_head','project_admin','orgadmin','superadmin')
    and project_id in (select user_project_ids())
  );

revoke delete on measurement_book from authenticated;

do $$ declare n int; begin
  select count(*) into n from measurement_book;
  raise notice '10_measurement_book: ready. % entries currently.', n;
end $$;