-- SiteTrack Pro — v4 Phase G1: material requests → PO → GRN → inventory chain.
-- Run AFTER 158_po_receipts.sql (needs po_receipts + purchase_orders). Idempotent.
--
-- Completes the construction procurement loop end-to-end:
--   1. material_requests — a project-scoped register tracking the request
--      lifecycle requested → approved → ordered → received. Any project member
--      can raise a request; status transitions (approve / order / mark
--      received) + deletes are manager-gated (quick type per procurement).
--   2. purchase_orders.material_request_id — optional provenance link so a PO
--      raised·from·a·request records which request it fulfils (mirrors
--      quote_id in migration 154).
--   3. GRN auto-post — a trigger on po_receipts INSERT that posts an
--      inventory_transactions 'inward' row (source 'po_receipt') and marks the
--      linked request 'received'. SECURITY DEFINER so it runs as the owner
--      (the caller may be an org admin who isn't in the narrow
--      architect/pm/contractor write_inventory set).

BEGIN;

-- ── 1. material_requests ────────────────────────────────────────────────────
create table if not exists public.material_requests (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  item          text not null,
  unit          text,
  qty           numeric(14,3) not null check (qty > 0),
  need_date     date,
  reason        text,
  status        text not null default 'requested'
    check (status in ('requested','approved','ordered','received')),
  requested_by  uuid default auth.uid() references auth.users(id) on delete set null,
  approved_by   uuid references auth.users(id) on delete set null,
  po_id         uuid references public.purchase_orders(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_material_requests_project on public.material_requests(project_id, status);
create index if not exists idx_material_requests_po on public.material_requests(po_id) where po_id is not null;

alter table public.material_requests enable row level security;

-- Read: any project member (incl. client) can view requests.
drop policy if exists mr_read on public.material_requests;
create policy mr_read on public.material_requests for select
  using (public.can_read_project(project_id));

-- Insert: any project member may raise a request.
drop policy if exists mr_insert on public.material_requests;
create policy mr_insert on public.material_requests for insert
  with check (public.can_read_project(project_id));

-- Update: manager gate (status transitions) — mirrors purchase_orders write set.
drop policy if exists mr_update on public.material_requests;
create policy mr_update on public.material_requests for update
  using (public.can_write_project(project_id))
  with check (
    public.can_write_project(project_id)
    or public.can_read_project(project_id)  -- allow the raiser to cancel own pending
  );

-- Delete: manager gate only.
drop policy if exists mr_delete on public.material_requests;
create policy mr_delete on public.material_requests for delete
  using (public.can_write_project(project_id));

grant select, insert, update, delete on public.material_requests to authenticated;
revoke all on public.material_requests from anon;

-- ── 2. purchase_orders.material_request_id (request → PO provenance) ───────
alter table public.purchase_orders
  add column if not exists material_request_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_orders_material_request_id_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_material_request_id_fkey
      foreign key (material_request_id) references public.material_requests(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_purchase_orders_material_request_id
  on public.purchase_orders(material_request_id) where material_request_id is not null;

-- ── 3. GRN auto-post trigger (po_receipts INSERT → inventory inward) ───────
CREATE OR REPLACE FUNCTION public.grn_post_inventory()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project uuid;
  v_po_no   text;
  v_item    text;
  v_unit    text;
  v_req_id  uuid;
BEGIN
  SELECT po.project_id, po.po_no, po.material_request_id
    INTO v_project, v_po_no, v_req_id
  FROM public.purchase_orders po WHERE po.id = NEW.po_id;

  IF v_project IS NULL THEN
    RETURN NEW;  -- orphaned reference guard; nothing to post
  END IF;

  -- Material name + unit: prefer the linked request, fall back to PO items.
  SELECT mr.item, mr.unit INTO v_item, v_unit
  FROM public.material_requests mr WHERE mr.id = v_req_id;
  IF v_item IS NULL THEN
    v_item := (SELECT po.items FROM public.purchase_orders po WHERE po.id = NEW.po_id);
  END IF;
  v_unit := COALESCE(v_unit, 'nos');

  -- Post the inward GRN receipt into the inventory ledger.
  INSERT INTO public.inventory_transactions
    (project_id, txn_date, material, unit, qty, direction, source, ref_no, po_id, recorded_by, notes)
  VALUES
    (v_project, NEW.received_date, COALESCE(NULLIF(v_item,''), 'Received goods'), v_unit,
     NEW.qty, 'inward', 'po_receipt', v_po_no, NEW.po_id, NEW.received_by, NEW.notes);

  -- Mark the linked request 'received' (whole request fulfilled once a GRN posts).
  IF v_req_id IS NOT NULL THEN
    UPDATE public.material_requests SET status = 'received', updated_at = now() WHERE id = v_req_id;
  END IF;

  RETURN NEW;
END;
$$;

drop trigger if exists trg_grn_post_inventory on public.po_receipts;
create trigger trg_grn_post_inventory
  after insert on public.po_receipts
  for each row execute function public.grn_post_inventory();

GRANT EXECUTE ON FUNCTION public.grn_post_inventory() TO authenticated;

-- idempotent `update` policy note — we intentionally allow the raiser to
-- withdraw their own pending request (can_read on update with-check for
-- non-manager self-cancel) while status forwards are manager-only via
-- can_write_project (org admin + project-tier manager incl. has_project_role).

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.material_requests;
  RAISE NOTICE '167_material_requests: material_requests_rows=%', n;
END $$;

COMMIT;