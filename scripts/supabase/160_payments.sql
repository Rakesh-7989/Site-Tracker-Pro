-- SiteTrack Pro — v4 finance: payment receipts & reconciliation (#30).
-- Run AFTER 159_download_events.sql. Idempotent.
--
-- Adds a `payments` register for money actually received against an invoice
-- (client AR) or an RA bill (subcontractor settlement). Each receipt rows a
-- real payment; the frontend can then reconcile each invoice/RA bill by net
-- payable vs the sum of its receipts (outstanding = net - sum(receipts)).
--
-- RLS mirrors the parent tables (project-scoped): read = project member;
-- insert/update/delete = project write roles (the same `can_write_project`
-- gate used by invoices / ra_bills).

BEGIN;

-- ── 1. payments table ─────────────────────────────────────────────────────-
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  target_type   text not null check (target_type in ('invoice', 'ra_bill')),
  target_id     uuid not null,
  amount        bigint not null check (amount > 0),
  method        text not null default 'bank' check (method in ('bank', 'cash', 'upi', 'cheque', 'other')),
  received_on   date not null default current_date,
  reference     text,
  notes         text,
  received_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_payments_project on public.payments(project_id);
create index if not exists idx_payments_target on public.payments(target_type, target_id);

alter table public.payments enable row level security;

-- Read: any member of the project.
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select
  using (public.can_read_project(project_id));

-- Write: managers + org admin (same gate as invoices/ra_bills writes).
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert
  with check (public.can_write_project(project_id));

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete
  using (public.can_write_project(project_id));

-- Grants: authenticated gets select + write; anon nothing.
grant select, insert, update, delete on public.payments to authenticated;
revoke all on public.payments from anon;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.payments;
  RAISE NOTICE '160_payments: payments_rows=%', n;
END $$;

COMMIT;