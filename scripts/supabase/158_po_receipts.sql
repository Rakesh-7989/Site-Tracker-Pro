-- SiteTrack Pro — v4 Phase E: purchase lifecycle depth (goods receipts).
-- Run AFTER 154_po_quote_link.sql (needs purchase_orders.quote_id). Idempotent.
--
-- Adds a `po_receipts` register that tracks partial deliveries against a
-- purchase order (the quote → PO chain from D5/D6 now continues through to
-- settlement). Each receipt captures a delivered batch: quantity, unit price
-- (snapshot at receive time), line amount, and who recorded it. Frontend
-- rollups (received vs PO amount, fully-delivered flag) read this register.
--
-- RLS mirrors purchase_orders (project-scoped): read = any member of the PO's
-- project (can_read_project), write = manager set (can_write_project) which
-- already covers org admin + project-tier managers via has_project_role.

BEGIN;

-- ── 1. po_receipts table ────────────────────────────────────────────────────
create table if not exists public.po_receipts (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references public.purchase_orders(id) on delete cascade,
  received_date date not null default current_date,
  qty           int not null default 1 check (qty >= 1),
  unit_price    bigint not null default 0 check (unit_price >= 0),
  amount        bigint not null default 0 check (amount >= 0),
  notes         text,
  received_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_po_receipts_po_id on public.po_receipts(po_id);

alter table public.po_receipts enable row level security;

-- Read: any member of the PO's project.
drop policy if exists po_receipts_read on public.po_receipts;
create policy po_receipts_read on public.po_receipts for select
  using (
    public.can_read_project(
      (select project_id from public.purchase_orders where id = po_id)
    )
  );

-- Insert: manager set (project write gate covers org admin + project-tier
-- manager rows via has_project_role, matching purchase_orders).
drop policy if exists po_receipts_insert on public.po_receipts;
create policy po_receipts_insert on public.po_receipts for insert
  with check (
    public.can_write_project(
      (select project_id from public.purchase_orders where id = po_id)
    )
  );

-- Update / delete: manager set only.
drop policy if exists po_receipts_update on public.po_receipts;
create policy po_receipts_update on public.po_receipts for update
  using (
    public.can_write_project(
      (select project_id from public.purchase_orders where id = po_id)
    )
  )
  with check (
    public.can_write_project(
      (select project_id from public.purchase_orders where id = po_id)
    )
  );

drop policy if exists po_receipts_delete on public.po_receipts;
create policy po_receipts_delete on public.po_receipts for delete
  using (
    public.can_write_project(
      (select project_id from public.purchase_orders where id = po_id)
    )
  );

-- Grants: authenticated gets DML; anon gets nothing.
grant select, insert, update, delete on public.po_receipts to authenticated;
revoke all on public.po_receipts from anon;

-- ── 2. Org-wide purchase rollup RPC (settled vs open) ──────────────────────
-- Reuses the org_purchase_orders() gate; adds received_amount and open_amount
-- so the org finance rollups can show delivery progress without exposing
-- receipt rows themselves. Empty for non-members (same gate as milestones).
-- NOTE: CREATE OR REPLACE cannot add OUT params, so we DROP first (no deps).
DROP FUNCTION IF EXISTS public.org_purchase_orders(uuid);
CREATE FUNCTION public.org_purchase_orders(p_org uuid)
RETURNS TABLE (
  id uuid, po_no text, project_id uuid, project_name text, vendor_name text,
  items text, amount bigint, status text, created_date date, delivery_date date,
  vendor_id uuid, quote_id uuid, quote_item text,
  received_amount bigint, open_amount bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT po.id, po.po_no, po.project_id, p.name, v.name,
         po.items, po.amount, po.status, po.created_date, po.delivery_date,
         po.vendor_id, po.quote_id, q.item_name,
         COALESCE(r.received, 0) AS received_amount,
         GREATEST(0, po.amount - COALESCE(r.received, 0)) AS open_amount
  FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  LEFT JOIN public.vendors v ON v.id = po.vendor_id
  LEFT JOIN public.procurement_quotes q ON q.id = po.quote_id
  LEFT JOIN (
    SELECT po_id, sum(amount) AS received
    FROM public.po_receipts GROUP BY po_id
  ) r ON r.po_id = po.id
  WHERE p.org_id = p_org
    AND (public.is_superadmin() OR p_org = ANY(public.user_org_ids()))
  ORDER BY po.created_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.org_purchase_orders(uuid) TO authenticated;
COMMENT ON FUNCTION public.org_purchase_orders(uuid) IS 'All POs across an org''s projects with received/open settlement amounts (org rollup). Empty for non-members.';

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.po_receipts;
  RAISE NOTICE '158_po_receipts: po_receipts_rows=%', n;
END $$;

COMMIT;
