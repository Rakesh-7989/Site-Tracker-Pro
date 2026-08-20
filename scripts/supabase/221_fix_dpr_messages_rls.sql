-- SiteTrack Pro — SEC-04 cross-tenant test finding: dpr_messages / dpr_delivery_log
-- RLS policies were effectively ALWAYS-TRUE (cross-tenant data breach).
--
-- The read/insert/update policies in migration 50 scoped rows with:
--
--     org_id = (select org_id from profiles where id = auth.uid())
--
-- but profiles has NO org_id column. Inside a policy expression, the
-- unqualified `org_id` therefore resolves to the OUTER query's
-- dpr_messages.org_id (correlated reference), making the condition
--
--     dpr_messages.org_id = dpr_messages.org_id    → always TRUE
--
-- for any authenticated user who has a profile. Every logged-in user could
-- read AND update every org's DPR messages (and read every delivery-log row),
-- and insert rows claiming any org_id. Reproduced live by the SEC-04 attack
-- matrix (CT-002/003/005 failed on dpr_messages).
--
-- Fix: scope with the standard org-membership helper user_org_ids() (active
-- memberships only, per migration 173), keeping the superadmin bypass.
-- Idempotent drop-and-recreate of the 4 affected policies.

BEGIN;

drop policy if exists dpr_messages_read on public.dpr_messages;
create policy dpr_messages_read on public.dpr_messages
  for select to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists dpr_messages_insert on public.dpr_messages;
create policy dpr_messages_insert on public.dpr_messages
  for insert to authenticated
  with check (
    org_id = any(public.user_org_ids())
  );

drop policy if exists dpr_messages_update on public.dpr_messages;
create policy dpr_messages_update on public.dpr_messages
  for update to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists dpr_delivery_log_read on public.dpr_delivery_log;
create policy dpr_delivery_log_read on public.dpr_delivery_log
  for select to authenticated
  using (
    exists (
      select 1 from public.dpr_messages m
      where m.id = dpr_delivery_log.dpr_message_id
        and m.org_id = any(public.user_org_ids())
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

COMMIT;
