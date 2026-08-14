-- SiteTrack Pro — C2 drift fix: intended-but-never-created columns.
-- Run AFTER 189_auth_grants.sql. Idempotent.
--
-- These columns are referenced by live code / SQL but were never created:
--   1. invoices.due_date       — used by crossAnalyticsQueries (cash-flow
--      forecast), crossInvoiceQueries (paymentStatusFrom), and migration 176's
--      check_overdue_payments() (queries i.due_date; would fail at runtime).
--   2. ra_bills.due_date       — same three consumers (r.due_date in 176).
--   3. organizations.contact_email — selected/written by onboardingQueries
--      (getMyOrg/updateOrg) + OnboardingView, and read by Edge Functions
--      supabase/functions/index.ts and cashfree.ts.
--
-- All nullable so existing rows / register_org inserts are unaffected.

alter table public.invoices add column if not exists due_date timestamptz;

alter table public.ra_bills add column if not exists due_date timestamptz;

alter table public.organizations add column if not exists contact_email text;

do $$ begin
  raise notice '190_drift_fix_columns: invoices.due_date=%, ra_bills.due_date=%, organizations.contact_email=%',
    (select count(*) from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='due_date'),
    (select count(*) from information_schema.columns where table_schema='public' and table_name='ra_bills' and column_name='due_date'),
    (select count(*) from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='contact_email');
end $$;
