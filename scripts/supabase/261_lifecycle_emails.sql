-- =====================================================================
-- 261 — Lifecycle email automation (nurture cadence for trial orgs)
-- NEXT_PHASE_PLAN §2.4
--
--  * lifecycle_emails         — idempotent audit log of every nurture email
--                               sent by the lifecycle-emails-cron EF.
--  * pg_cron 'lifecycle-emails-daily' @ 02:20 UTC -> edge function
--      POST /functions/v1/lifecycle-emails-cron
--      Authorization: Bearer <notify_config.promoter_digest_cron_secret>
--
-- The EF computes the day-N (day 0 = organizations.created_at =
-- register_org trial start; trial_ends_at = start + 14d), renders the
-- matching templates, sends via Resend (EMAIL-FIRST), and records each
-- dispatch keyed by UNIQUE(org_id, template_key, sent_for_date) so the
-- cadence is exactly-once per org per event.
-- =====================================================================

-- ── 1. lifecycle_emails table ─────────────────────────────────────────
create table if not exists public.lifecycle_emails (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  template_key      text not null check (template_key in (
                      'day1_welcome','day3_help_and_setup','day7_usage_stats',
                      'day10_trial_ending','day14_trial_expired','day21_miss_you',
                      'weekly_digest'
                    )),
  sent_for_date     date not null,
  recipient_email   text not null,
  org_name          text,
  subject           text,
  status            text not null default 'sent' check (status in ('sent','failed','skipped')),
  resend_message_id text,
  detail            text,
  sent_at           timestamptz not null default now(),
  constraint uq_lifecycle_emails_once unique (org_id, template_key, sent_for_date)
);

create index if not exists idx_lifecycle_emails_due
  on public.lifecycle_emails (template_key, status)
  where status = 'failed';

-- ── 2. RLS — org members may read their own org's rows (future admin UI);
--         writes happen only via the EF using the service_role key.
alter table public.lifecycle_emails enable row level security;

drop policy if exists lifecycle_emails_org_member_select on public.lifecycle_emails;
create policy lifecycle_emails_org_member_select on public.lifecycle_emails
  for select to authenticated
  using (org_id = any (user_org_ids()));

grant select on public.lifecycle_emails to authenticated;
revoke all on public.lifecycle_emails from anon;

-- ── 3. pg_cron wiring (mirrors 231_promoter_digest_schedule.sql) ──────
--     02:20 UTC = 07:50 IST — after risk-signal compute (02:05 UTC),
--     before the promoter digest (02:35 UTC). Bearer secret resolved at
--     fire time from notify_config (never stored in the migration).
select cron.unschedule('lifecycle-emails-daily')
where exists (select 1 from cron.job where jobname = 'lifecycle-emails-daily');

select cron.schedule(
  'lifecycle-emails-daily',
  '20 2 * * *',
  $job$
  select net.http_post(
    url := 'https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/lifecycle-emails-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce((select value from public.notify_config where key = 'promoter_digest_cron_secret'), ''),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id
  $job$
);