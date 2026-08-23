-- SiteTrack Pro — digest_subscriptions_due returns promoter_email too.
-- Needed by the email-first cron (migration 233) for recipient resolution
-- before falling back to the org-admin account email. Idempotent recreate.

BEGIN;

-- CREATE OR REPLACE cannot change RETURNS TABLE shape → drop first.
drop function if exists public.digest_subscriptions_due(timestamp with time zone);

create function public.digest_subscriptions_due(p_now timestamp with time zone default now())
returns table(subscription_id uuid, org_id uuid, project_id uuid, promoter_phone_e164 text, promoter_name text, language text, sent_for_date date, promoter_email text)
language sql
stable
as $$
  select
    s.id as subscription_id,
    s.org_id,
    s.project_id,
    s.promoter_phone_e164,
    s.promoter_name,
    s.language,
    (p_now at time zone s.timezone)::date - interval '1 day' as sent_for_date,
    s.promoter_email
  from digest_subscriptions s
  where s.status = 'active'
    and (s.paused_until is null or s.paused_until < (p_now at time zone s.timezone)::date)
    and extract(hour from p_now at time zone s.timezone)::int = s.hour_local
    and not exists (
      select 1 from digest_dispatches d
      where d.subscription_id = s.id
        and d.sent_for_date = (p_now at time zone s.timezone)::date - interval '1 day'
    );
$$;

revoke all on function public.digest_subscriptions_due(timestamp with time zone) from anon;
grant execute on function public.digest_subscriptions_due(timestamp with time zone) to service_role;

COMMIT;
