-- SiteTrack Pro — v5 H2: quotation → agreement auto-conversion.
-- Adds an optional quotation_id FK on lead_agreements so converting an
-- accepted quotation into an agreement is idempotent (one agreement per
-- quotation) instead of relying on side-effects / dedupe by title+amount.
-- No RLS change: lead_agreements policies in 161 already gate via the lead's org.

alter table public.lead_agreements
  add column if not exists quotation_id uuid references public.lead_quotations(id) on delete set null;

drop index if exists uq_lead_agreements_quotation;
create unique index uq_lead_agreements_quotation on public.lead_agreements(quotation_id)
  where quotation_id is not null;

create index if not exists idx_lead_agreements_quotation on public.lead_agreements(quotation_id);