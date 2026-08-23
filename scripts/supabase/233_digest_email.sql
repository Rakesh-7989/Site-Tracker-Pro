-- SiteTrack Pro — Email-first digests: drop the WhatsApp dependency.
-- Run AFTER 232_chat_unified.sql. Idempotent.
--
-- Product decision (founder): no WhatsApp Business dependency at all —
-- Meta phone-number/token/template setup and per-conversation pricing are
-- not worth it while Resend email is already live and free at this scale.
--
-- Digest subscriptions become EMAIL-first: an optional explicit recipient
-- email on the row; the cron falls back to the org-admin's account email.
-- The WhatsApp branch stays in code but only runs when explicitly selected
-- via DIGEST_CHANNEL=whatsapp AND Meta creds exist — dormant by default.

BEGIN;

alter table public.digest_subscriptions
  add column if not exists promoter_email text;

comment on column public.digest_subscriptions.promoter_email is
  'Email-first digest recipient; null = fall back to the org-admin account email at send time.';

COMMIT;
