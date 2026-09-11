-- =====================================================================
-- 262 — lifecycle_emails.recipient_email must be nullable
--
-- The lifecycle-emails-cron EF records a 'skipped' disposition when a
-- due event is intentionally not sent:
--   * day3_help_and_setup  -> "org already has a project — skipping stuck-nudge"
--   * any event            -> "no admin recipient resolvable"
-- Those rows have no recipient. Migration 261 declared recipient_email
-- NOT NULL, so the EF's first dry-run hit 23502 on exactly those skip rows.
--
-- Skip rows are audit dispositions, not sends — recipient is legitimately
-- absent. 'sent'/'failed' rows always carry the resolved admin address.
-- =====================================================================

alter table public.lifecycle_emails
  alter column recipient_email drop not null;