-- SiteTrack Pro — Org-level material price master.
-- Run AFTER 10_measurement_book.sql. Idempotent.
--
-- Mirrors src/lib/materialPrices.js + INIT_MATERIAL_PRICES seed.
-- One row per (org, material, unit, vendor, effective_at). Used by BOQ
-- auto-rate, PO suggestions, and the "savings" analytics panel.

create table if not exists material_prices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  material      text not null,                       -- normalised key e.g. 'cement_opc_53'
  display_name  text,
  category      text,                                -- steel / cement / aggregate / mep / finish / etc
  unit          text not null,                       -- bag / mt / cum / sqm / rmt / nos
  rate          numeric(14,2) not null check (rate >= 0),
  vendor_id     uuid references vendors(id) on delete set null,
  vendor_name   text,                                -- snapshot in case vendor row is deleted
  source        text,                                -- manual / api / quote / contract
  effective_at  timestamptz not null default now(),
  expires_at    timestamptz,
  notes         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now()
);

create index if not exists idx_material_prices_org_material on material_prices(org_id, material, effective_at desc);
create index if not exists idx_material_prices_vendor on material_prices(vendor_id);

alter table material_prices enable row level security;

drop policy if exists material_prices_read on material_prices;
create policy material_prices_read on material_prices for select
  using (is_superadmin() or org_id = user_org_id());

drop policy if exists material_prices_write on material_prices;
create policy material_prices_write on material_prices for all
  using ((is_orgadmin() and org_id = user_org_id())
         or current_role_text() in ('pm','project_admin','project_head')
         or is_superadmin())
  with check ((is_orgadmin() and org_id = user_org_id())
              or current_role_text() in ('pm','project_admin','project_head')
              or is_superadmin());

do $$ declare n int; begin
  select count(*) into n from material_prices;
  raise notice '11_material_prices: ready. % rows currently.', n;
end $$;