-- SiteTrack Pro — migration 238: versioned concurrency for important records.
--
-- Production-audit P0 (Domain): "Versioned concurrency for important
-- records" + "never silently overwrite" financial/approval/field data.
--
-- Mechanism:
--   version int NOT NULL DEFAULT 1   -- bumped by trigger on every UPDATE
--   updated_at timestamptz NOT NULL DEFAULT now()
--   trg_<table>_bump_version BEFORE UPDATE → NEW.version = OLD.version + 1,
--                                            NEW.updated_at = now()
--
-- The trigger FORCES a monotonic version: even a client that sends an
-- explicit `version` value in the patch cannot forge it. Conflict detection
-- is opt-in at the query layer: append `.eq("version", expectedVersion)`
-- before `.select("id")`; zero rows back = someone else changed the record
-- between your read and your write.
--
-- Tables in scope (the audit's "important records" set that exist today):
--   milestones, tasks, issues            — field execution state
--   invoices, ra_bills, payments         — commercial chain (never silently
--                                          overwritten)
-- Later tables adopt the same two-column + one-trigger pattern.
--
-- Safety notes:
--   - Additive columns with defaults; no existing query breaks (PostgREST
--     returns only requested columns; table-level GRANTs cover new columns).
--   - Server-side RPC writers (e.g. release_ra_retention, retainer invoice
--     generation) keep working — their updates simply bump the version.
--   - bump_record_version() is a plain (non-definer) trigger function;
--     search_path is still pinned per the mig-237 hardening posture.

-- ── columns ──────────────────────────────────────────────────────────────────

alter table public.milestones add column if not exists version int not null default 1;
alter table public.tasks     add column if not exists version int not null default 1;
alter table public.issues    add column if not exists version int not null default 1;
alter table public.invoices  add column if not exists version int not null default 1;
alter table public.ra_bills  add column if not exists version int not null default 1;
alter table public.payments  add column if not exists version int not null default 1;

alter table public.milestones add column if not exists updated_at timestamptz not null default now();
alter table public.tasks     add column if not exists updated_at timestamptz not null default now();
alter table public.issues    add column if not exists updated_at timestamptz not null default now();
alter table public.invoices  add column if not exists updated_at timestamptz not null default now();
alter table public.ra_bills  add column if not exists updated_at timestamptz not null default now();
alter table public.payments  add column if not exists updated_at timestamptz not null default now();

-- ── trigger function ────────────────────────────────────────────────────────
create or replace function public.bump_record_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := old.version + 1;   -- forced monotonic; client value ignored
  new.updated_at := now();
  return new;
end;
$$;

-- ── triggers ────────────────────────────────────────────────────────────────
drop trigger if exists trg_milestones_bump_version on public.milestones;
create trigger trg_milestones_bump_version
  before update on public.milestones
  for each row execute function public.bump_record_version();

drop trigger if exists trg_tasks_bump_version on public.tasks;
create trigger trg_tasks_bump_version
  before update on public.tasks
  for each row execute function public.bump_record_version();

drop trigger if exists trg_issues_bump_version on public.issues;
create trigger trg_issues_bump_version
  before update on public.issues
  for each row execute function public.bump_record_version();

drop trigger if exists trg_invoices_bump_version on public.invoices;
create trigger trg_invoices_bump_version
  before update on public.invoices
  for each row execute function public.bump_record_version();

drop trigger if exists trg_ra_bills_bump_version on public.ra_bills;
create trigger trg_ra_bills_bump_version
  before update on public.ra_bills
  for each row execute function public.bump_record_version();

drop trigger if exists trg_payments_bump_version on public.payments;
create trigger trg_payments_bump_version
  before update on public.payments
  for each row execute function public.bump_record_version();
