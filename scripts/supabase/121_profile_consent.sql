-- SiteTrack Pro — migration 121: consent tracking on profiles.
--
-- DPDP Act 2023 requires verifiable consent for personal data processing.
-- We already capture consent_version on signup_requests (migration 91); this
-- extends the same tracking to the profiles table so consent survives approval
-- and carries through in self-service registration too.

alter table public.profiles
  add column if not exists consent_version text,
  add column if not exists consent_updated_at timestamptz;

-- Backfill existing profiles from their signup_request if available.
-- This is best-effort and only catches approval-gated signups.
-- profiles has no email column (it lives on auth.users) — match via correlated
-- subquery (the UPDATE target may not appear in FROM).
update public.profiles p
  set consent_version = sr.consent_version,
      consent_updated_at = sr.created_at
  from public.signup_requests sr
  where sr.email = (select u.email from auth.users u where u.id = p.id)
    and sr.consent_version is not null
    and p.consent_version is null;
