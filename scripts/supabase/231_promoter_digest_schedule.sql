-- SiteTrack Pro — schedule the promoter digest Edge Function (daily).
-- Run AFTER 230_subscription_read_grant.sql. Idempotent.
--
-- promoter_digest_cron (Edge Function v28+) was fully built — real hydration,
-- real email/WhatsApp delivery, CRON_SECRET auth — but NOTHING invoked it:
-- Supabase Edge Functions never self-schedule. This wires the missing piece
-- with the same ops model as every other recurring job (pg_cron), calling the
-- function over HTTP through pg_net at 07:35 IST (02:35 UTC).
--
-- Secret handling: the bearer token lives in `notify_config`
-- (key='promoter_digest_cron_secret'), written OUT of band (never committed).
-- The job resolves it at fire time via subquery, so this file stays
-- secret-free and a secret rotation needs no re-deploy.
--
-- The function itself is idempotent per date (sent_for_date unique) — double
-- fires or manual retries cannot duplicate a digest.

BEGIN;

-- Recreate cleanly by name (keeps re-applies idempotent).
select cron.unschedule('promoter-digest-daily')
where exists (select 1 from cron.job where jobname = 'promoter-digest-daily');

select cron.schedule(
  'promoter-digest-daily',
  '35 2 * * *', -- 02:35 UTC = 08:05 IST (post risk-signals compute at 02:05 UTC)
  $job$
  select net.http_post(
    url := 'https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/promoter_digest_cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(
        (select value from public.notify_config where key = 'promoter_digest_cron_secret'),
        ''
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $job$
);

COMMIT;
