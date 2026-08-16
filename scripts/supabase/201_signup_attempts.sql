-- SiteTrack Pro — 201: signup_attempts table for self-service register_org abuse protection.
--
-- The honest review learned that the legacy approval-gated signup path had a
-- rate limit + honeypot, but the LIVE self-service path (register_org EF) had
-- none — a public (--no-verify-jwt) function that creates auth users + orgs.
-- This table records one row per successful self-service org creation per IP,
-- so the EF can enforce "max 5 workspaces per IP per hour" (mirroring the
-- submit_signup_request posture). Service-role only (the EF runs with the
-- service role key); RLS denies anon/authenticated entirely.

BEGIN;

-- 1. signup_attempts table (append-only; service-role inserts)
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Rate-limit query index: per-IP hour window
CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip_created ON public.signup_attempts (ip, created_at DESC);

-- 3. RLS: enable but grant nothing — anon/authenticated get nothing.
--    Only service_role / postgres (bypasses RLS) can read or write.
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_attempts FROM anon, authenticated;

-- 4. Comment
COMMENT ON TABLE public.signup_attempts IS
  'Append-only record of successful self-service org signups per source IP. Used by the register_org Edge Function to enforce a 5-per-hour-per-IP rate limit. Service-role only; anon/authenticated have no access.';

-- 5. Verification notice
DO $$
DECLARE
  c1 int;
  has_idx boolean;
BEGIN
  SELECT count(*) INTO c1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'signup_attempts';
  SELECT count(*) > 0 INTO has_idx FROM pg_indexes WHERE tablename = 'signup_attempts' AND indexname = 'idx_signup_attempts_ip_created';
  RAISE NOTICE '201_signup_attempts: table exists (count=% ) index=%', c1, has_idx;
END $$;

COMMIT;