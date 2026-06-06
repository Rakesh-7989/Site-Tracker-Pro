-- SiteTrack Pro — capture signup consent (DPDP, 2026-06-06).
-- Records which version of the Terms + Privacy Policy the applicant agreed to
-- (created_at already records WHEN). IDEMPOTENT.

BEGIN;

ALTER TABLE public.signup_requests ADD COLUMN IF NOT EXISTS consent_version text;

COMMIT;
