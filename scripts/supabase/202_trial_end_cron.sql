-- SiteTrack Pro — Zoho-style signup redesign §5.5b: trial-end downgrade cron.
-- Run AFTER 201_signup_attempts.sql. Idempotent.
--
-- Adds admin_expire_trials(): a SECURITY DEFINER function a daily pg_cron job
-- calls. On each tick it finds every org whose subscription is still 'trial'
-- but whose trial_ends_at has passed, and downgrades the org plan for hygiene:
--   - subscriptions.status 'trial' → 'cancelled' (trial ended without subscribe),
--   - organizations.plan 'pro' → 'basic' (the trial default; the owner made no
--     explicit paid choice at trial end).
--
-- The read-side check (§5.5a, getPlanCaps) already handles the same
-- downgrade for org admins on the fly; this cron makes it stick org-wide for
-- non-admin members who cannot read subscriptions (RLS admin-only), so the
-- permanent-trial gap closes for everyone within a day of expiry.
--
-- Security: granted ONLY to service_role. Cron runs as postgres (function
-- owner), so the job bypasses RLS and role gates.

BEGIN;

-- ── 1. Cron function ─────────────────────────────────────────────────────────
create or replace function public.admin_expire_trials()
returns table (
  org_id  uuid,
  outcome text,
  detail  text
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row record;
begin
  for v_row in
    select s.org_id, s.plan as sub_plan, o.plan as org_plan
      from public.subscriptions s
      join public.organizations o on o.id = s.org_id
     where s.status = 'trial'
       and s.trial_ends_at is not null
       and s.trial_ends_at < now()
     order by s.org_id
  loop
    org_id := v_row.org_id;

    begin
      -- Idempotent transition: trial → cancelled.
      update public.subscriptions
         set status = 'cancelled', updated_at = now()
       where org_id = v_row.org_id and status = 'trial';

      -- Hygiene downgrade: only the trial default ('pro') is reset; an owner's
      -- explicit choice ('basic'/'business'/…) stays as the recorded preference.
      if v_row.org_plan = 'pro' then
        update public.organizations
           set plan = 'basic'
         where id = v_row.org_id and plan = 'pro';
        outcome := 'downgraded';
        detail  := 'trial expired; plan pro → basic';
      else
        outcome := 'kept';
        detail  := format('trial expired; plan %s kept (explicit choice)', v_row.org_plan);
      end if;
    exception when others then
      outcome := 'error';
      detail  := sqlerrm;
    end;

    return next;
  end loop;

  return;
end;
$$;

-- Only service_role may invoke (cron runs as postgres = owner).
revoke all on function public.admin_expire_trials() from public;
grant execute on function public.admin_expire_trials() to service_role;

-- ── 2. Daily cron schedule (idempotent — no-op if the job name exists) ──────
-- 02:10 UTC daily ≈ 07:40 IST — a little after the retainer cron (02:05).
select cron.schedule(
  'expire-expired-trials',
  '10 2 * * *',
  'select public.admin_expire_trials()'
);

DO $$ BEGIN
  RAISE NOTICE '202_trial_end_cron: admin_expire_trials + daily job ready';
END $$;

COMMIT;