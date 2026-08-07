-- SiteTrack Pro — v4 Phase A: CRM & Sales (lead pipeline).
-- Run AFTER 160_payments.sql. Idempotent.
--
-- Adds an org-scoped sales pipeline: leads, meetings, quotations and
-- agreements. This is the "Module 1: CRM & Sales" slice of the V4 industry
-- platform (Lead → Meeting → Quotation → Agreement → Client).
--
-- Data model notes:
--   • Every row is org-scoped (org_id) — RLS uses user_org_ids() like the
--     procurement/org rollups. No project_id here (leads precede projects).
--   • `leads.stage` mirrors the pipeline UI; the frontend owns the transition
--     map (LEAD_STAGE_NEXT). Stages are additive-only for history (no delete
--     of a stage), matching how prospects progress.
--   • Quotations + agreements hang off a lead; an agreement can be reached
--     only from a lead (no orphan rows).
--
-- ALSO extends the module CHECK (migration 155) to admit the new `crm`
-- module id so orgs can store enabled_modules containing 'crm'. The
-- 155 column check is unnamed → Postgres auto-named it
-- organizations_enabled_modules_check; we drop + re-add with the new id.
-- JS source of truth stays src/modules/registry.ts#MODULES.

BEGIN;

-- ── 0. Extend the module CHECK (155) to allow 'crm' ────────────────────────
alter table public.organizations
  drop constraint if exists organizations_enabled_modules_check;

alter table public.organizations
  add constraint organizations_enabled_modules_check check (
    enabled_modules is null or
    enabled_modules <@ array[
      'projects','clients','site_ops','design','consultancy','finance',
      'procurement','compliance','people','insights','kiosks','crm'
    ]::text[]
  );

-- ── 1. leads ───────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  company       text,
  phone         text,
  email         text,
  source        text check (source in ('referral','website','walk_in','call','whatsapp','event','other')),
  budget        bigint check (budget is null or budget >= 0),
  stage         text not null default 'new' check (stage in (
                  'new','contacted','meeting_scheduled','quotation_sent',
                  'negotiating','agreement_signed','won','lost'
                )),
  notes         text,
  owner_id      uuid references auth.users(id) on delete set null,
  won_amount    bigint check (won_amount is null or won_amount >= 0),
  lost_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_leads_org_stage on public.leads(org_id, stage);
create index if not exists idx_leads_owner on public.leads(owner_id);

-- ── 2. lead_meetings ───────────────────────────────────────────────────────
create table if not exists public.lead_meetings (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  scheduled_at  timestamptz not null,
  agenda        text,
  outcome       text check (outcome in ('pending','done','cancelled','no_show')),
  notes         text,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_lead_meetings_lead on public.lead_meetings(lead_id);

-- ── 3. lead_quotations ─────────────────────────────────────────────────────
create table if not exists public.lead_quotations (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  title         text,
  amount        bigint not null check (amount >= 0),
  status        text not null default 'draft' check (status in ('draft','sent','accepted','rejected','superseded')),
  valid_until   date,
  sent_at       timestamptz,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_lead_quotations_lead on public.lead_quotations(lead_id);

-- ── 4. lead_agreements ─────────────────────────────────────────────────────
create table if not exists public.lead_agreements (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  title         text,
  amount        bigint not null check (amount >= 0),
  status        text not null default 'pending' check (status in ('pending','signed','rejected','cancelled')),
  signed_at     timestamptz,
  signed_by     text,
  notes         text,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_lead_agreements_lead on public.lead_agreements(lead_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.leads enable row level security;
alter table public.lead_meetings enable row level security;
alter table public.lead_quotations enable row level security;
alter table public.lead_agreements enable row level security;

-- Read: any org member (mirrors procurement_quotes_read).
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select
  using (org_id = any(public.user_org_ids()));

-- Write: org member (sales/BD + managers create + update their pipeline).
-- Leads are org-internal; we keep it simple — any member of the org can
-- run the pipeline (the `crm:manage` capability gates the UI).
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert
  with check (org_id = any(public.user_org_ids()));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update
  using (org_id = any(public.user_org_ids()))
  with check (org_id = any(public.user_org_ids()));

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- Child tables: same org gate via their lead's org.
drop policy if exists lead_meetings_read on public.lead_meetings;
create policy lead_meetings_read on public.lead_meetings for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_meetings_write on public.lead_meetings;
create policy lead_meetings_write on public.lead_meetings for insert
  with check (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_meetings_update on public.lead_meetings;
create policy lead_meetings_update on public.lead_meetings for update
  using (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ))
  with check (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_meetings_delete on public.lead_meetings;
create policy lead_meetings_delete on public.lead_meetings for delete
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and l.org_id = any(public.user_org_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','superadmin'))
  ));

drop policy if exists lead_quotations_read on public.lead_quotations;
create policy lead_quotations_read on public.lead_quotations for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_quotations_write on public.lead_quotations;
create policy lead_quotations_write on public.lead_quotations for insert
  with check (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_quotations_update on public.lead_quotations;
create policy lead_quotations_update on public.lead_quotations for update
  using (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ))
  with check (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_quotations_delete on public.lead_quotations;
create policy lead_quotations_delete on public.lead_quotations for delete
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and l.org_id = any(public.user_org_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','superadmin'))
  ));

drop policy if exists lead_agreements_read on public.lead_agreements;
create policy lead_agreements_read on public.lead_agreements for select
  using (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_agreements_write on public.lead_agreements;
create policy lead_agreements_write on public.lead_agreements for insert
  with check (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_agreements_update on public.lead_agreements;
create policy lead_agreements_update on public.lead_agreements for update
  using (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ))
  with check (exists (
    select 1 from public.leads l where l.id = lead_id and l.org_id = any(public.user_org_ids())
  ));

drop policy if exists lead_agreements_delete on public.lead_agreements;
create policy lead_agreements_delete on public.lead_agreements for delete
  using (exists (
    select 1 from public.leads l where l.id = lead_id
    and l.org_id = any(public.user_org_ids())
    and (is_orgadmin() or current_role_text() in ('pm','project_admin','superadmin'))
  ));

-- Grants: authenticated DML; anon nothing.
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.lead_meetings to authenticated;
grant select, insert, update, delete on public.lead_quotations to authenticated;
grant select, insert, update, delete on public.lead_agreements to authenticated;
revoke all on public.leads from anon;
revoke all on public.lead_meetings from anon;
revoke all on public.lead_quotations from anon;
revoke all on public.lead_agreements from anon;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.leads;
  RAISE NOTICE '161_crm_leads: leads_rows=%', n;
END $$;

COMMIT;
