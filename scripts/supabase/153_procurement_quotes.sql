-- SiteTrack Pro — v4 Phase D5: procurement quote-comparison register.
-- Run AFTER 152_statutory_approvals.sql. Idempotent.
--
-- procurement_quotes: an ORG-scoped register of vendor quotes for spec'd
-- items (FF&E entries) or free-text items. Quotes are entered manually by
-- managers OR submitted by org-tier vendors via the vendor portal, then
-- compared and a purchase order raised against the best one.
--
-- Design notes (user-confirmed):
--   - Org-scoped (not project-scoped) so an org-tier VENDOR (who has NO
--     project membership per migration 132 user_project_ids restriction) can
--     submit a quote without seeing project internals.
--   - ffe_entry_id / project_id are optional and set when a manager ATTACHES
--     an unassigned quote to a spec'd FF&E item; item_name is the free-text
--     fallback for un-assigned (manual / vendor-submitted) items.
--   - vendor_id FK → vendors; vendors have no write RLS on this table (they
--     may only submit, never edit) — status transitions + attach are manager
--     operations here.
--
-- Capability mapping (mirrors 66_rls comment "procurement compare view (org)
-- → procurement:view"):
--   read   = any org member (user_org_ids)              → procurement:view UI
--   insert = org-tier 'vendor' OR manager set           → vendor portal + managers
--   update/delete = manager set only                    → procurement:view
--
-- Manager set (identity roles): pm, project_admin, design_head,
-- consultant_head, orgadmin (is_orgadmin), superadmin. THIS table is
-- explicitly NOT project-tier-manager-gated by has_project_role because it is
-- org-scoped; the identity roles above match permissions-matrix.ts
-- procurement:view holders.

BEGIN;

create table if not exists public.procurement_quotes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  ffe_entry_id uuid references public.ffe_entries(id) on delete set null,
  project_id  uuid references public.projects(id) on delete set null,
  vendor_id   uuid references public.vendors(id) on delete set null,
  item_name   text,
  unit_price  bigint not null default 0 check (unit_price >= 0),
  qty         int not null default 1 check (qty >= 1),
  lead_days   int,
  valid_until date,
  status      text not null default 'requested'
    check (status in ('requested','received','selected','rejected')),
  notes       text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_procurement_quotes_org_status on public.procurement_quotes(org_id, status);
create index if not exists idx_procurement_quotes_ffe on public.procurement_quotes(ffe_entry_id);

alter table public.procurement_quotes enable row level security;

-- Read: any org member (vendor portal vendors see their own org's quotes).
drop policy if exists procurement_quotes_read on public.procurement_quotes;
create policy procurement_quotes_read on public.procurement_quotes for select
  using (org_id = any(public.user_org_ids()));

-- Insert: org member AND (org-tier vendor OR manager set).
drop policy if exists procurement_quotes_insert on public.procurement_quotes;
create policy procurement_quotes_insert on public.procurement_quotes for insert
  with check (
    org_id = any(public.user_org_ids())
    and (
      public.has_org_tier(org_id, 'vendor')
      or is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

-- Update / delete: manager set only (no vendor). Attach/status are manager ops.
drop policy if exists procurement_quotes_update on public.procurement_quotes;
create policy procurement_quotes_update on public.procurement_quotes for update
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  )
  with check (org_id = any(public.user_org_ids()));

drop policy if exists procurement_quotes_delete on public.procurement_quotes;
create policy procurement_quotes_delete on public.procurement_quotes for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

-- Grants: authenticated gets DML; anon gets nothing.
grant select, insert, update, delete on public.procurement_quotes to authenticated;
revoke all on public.procurement_quotes from anon;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.procurement_quotes;
  RAISE NOTICE '153_procurement_quotes: procurement_quotes=%', n;
END $$;

COMMIT;