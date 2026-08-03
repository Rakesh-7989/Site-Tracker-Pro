-- SiteTrack Pro — v4 Phase C2: rate cards + time-entry approval columns.
-- Run AFTER 140_consultancy_billing_feature_caps.sql. Idempotent.
--
-- rate_cards: project-scoped hourly rate per member, effective-dated.
--   Time entries snapshot their own rate at log time; when that is NULL the
--   billing engine falls back to the latest rate card <= the entry date
--   (see generate_hourly_invoice in 142_retainers_invoice_generation.sql).
--
-- time_entries additions: an approval workflow on top of the C1 table.
--   pending → approved / rejected (approve_time_entry RPC, manager-gated);
--   approved + billable + unbilled entries are eligible for hourly invoicing.
--   billed / billed_invoice_id are written only by the SECURITY DEFINER
--   generation RPC (defense-in-depth: self-edit RLS stays as C1, the app layer
--   enforces "no edits once approved").
--
-- Capability mapping:
--   rate:manage → set/remove member rates       → RLS: managers + org admin
--   time:approve → approve/reject entries       → RLS: approve_time_entry RPC
--
-- Manager identity roles: pm, project_admin, design_head, consultant_head,
-- orgadmin, superadmin (mirrors permissions-matrix.ts).

BEGIN;

create table if not exists public.rate_cards (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  rate           numeric(14,2) not null check (rate >= 0),   -- ₹ / hour
  effective_from date not null default current_date,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (project_id, profile_id, effective_from)
);

create index if not exists idx_rate_cards_project on public.rate_cards(project_id, profile_id, effective_from desc);

alter table public.rate_cards enable row level security;

drop policy if exists rate_cards_read on public.rate_cards;
create policy rate_cards_read on public.rate_cards for select
  using (project_id in (select user_project_ids()));

drop policy if exists rate_cards_write on public.rate_cards;
create policy rate_cards_write on public.rate_cards for all
  using (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  )
  with check (
    project_id in (select user_project_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
  );

grant select, insert, update, delete on public.rate_cards to authenticated;

-- ── time_entries approval / billing columns ─────────────────────────────────
alter table public.time_entries
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected'));

alter table public.time_entries
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

alter table public.time_entries
  add column if not exists approved_at timestamptz;

alter table public.time_entries
  add column if not exists billed boolean not null default false;

alter table public.time_entries
  add column if not exists billed_invoice_id uuid references public.invoices(id) on delete set null;

-- The billing engine's unbilled-work cursor.
create index if not exists idx_time_entries_unbilled on public.time_entries(project_id, date desc)
  where approval_status = 'approved' and billed = false;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.rate_cards;
  RAISE NOTICE '141_rate_cards_time_approval: rate_cards=% (time_entries approval/billed columns added)', n;
END $$;

COMMIT;
