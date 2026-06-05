-- SiteTrack Pro — approval-gated signup requests (2026-06-05).
--
-- New onboarding flow: a public visitor picks a plan + submits a signup request
-- (firm + contact + email + plan, NO password). It lands in this table as
-- 'pending'. The superadmin reviews the queue and approves → an org is created
-- and the applicant is invited by email to set a password + enter on their plan.
--
-- Writes are NOT exposed to anon/authenticated directly — the public submit goes
-- through the submit_signup_request Edge Function (service role), and approval
-- through review_signup_request (service role). RLS here only lets the superadmin
-- READ the queue + lets a direct reject UPDATE happen from the admin UI.
--
-- IDEMPOTENT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.signup_requests (
  id            uuid primary key default gen_random_uuid(),
  firm_name     text not null,
  contact_name  text not null,
  email         text not null,
  phone         text,
  plan          text not null default 'basic' check (plan in ('basic','pro','business','custom')),
  message       text,                                  -- optional note from applicant
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_notes  text,                                  -- superadmin note on decision
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  created_org_id uuid references public.organizations(id) on delete set null,
  created_at    timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON public.signup_requests(status, created_at DESC);
-- At most one PENDING request per email (re-applying after reject is allowed).
CREATE UNIQUE INDEX IF NOT EXISTS uq_signup_pending_email
  ON public.signup_requests(lower(email)) WHERE status = 'pending';

ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;

-- Superadmin can read the whole queue + update (e.g. reject) directly.
DROP POLICY IF EXISTS signup_requests_super_read ON public.signup_requests;
DROP POLICY IF EXISTS signup_requests_super_write ON public.signup_requests;
CREATE POLICY signup_requests_super_read  ON public.signup_requests FOR SELECT USING (public.is_superadmin());
CREATE POLICY signup_requests_super_write ON public.signup_requests FOR UPDATE USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- authenticated needs the GRANT for the superadmin policy to take effect; anon
-- gets nothing (public submit is via the service-role Edge Function).
GRANT SELECT, UPDATE ON public.signup_requests TO authenticated;
REVOKE ALL ON public.signup_requests FROM anon;

-- Convenience count for the admin badge (superadmin only; returns 0 otherwise).
CREATE OR REPLACE FUNCTION public.pending_signup_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_superadmin()
    THEN (SELECT count(*)::int FROM public.signup_requests WHERE status = 'pending')
    ELSE 0 END;
$$;
GRANT EXECUTE ON FUNCTION public.pending_signup_count() TO authenticated;

COMMIT;
