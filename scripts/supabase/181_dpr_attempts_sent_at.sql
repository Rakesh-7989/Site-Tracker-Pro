-- 181 — DPR read-path completion: dpr_messages attempts + sent_at.
--
-- The frontend contract (DprMessageRow in dprQueries.ts) has always declared
-- `attempts` (DPRStatusBadge retry counter) and `sentAt`, but the table never
-- got the columns — so the frontend .select() threw
-- "column dpr_messages.attempts does not exist" after the earlier column-name
-- fixes. Add them, backfill from the append-only dpr_delivery_log, and keep
-- them fresh via an AFTER INSERT trigger on that log (the whatsapp_dpr_send EF
-- writes one row per send attempt).

BEGIN;

alter table dpr_messages
  add column if not exists attempts int not null default 0 check (attempts >= 0);

alter table dpr_messages
  add column if not exists sent_at timestamptz;

-- Backfill existing rows from the delivery log:
--   attempts     = number of logged attempts
--   sent_at      = time of the first successful attempt (outcome='success')
update dpr_messages m
set attempts = (
      select count(*) from dpr_delivery_log l where l.dpr_message_id = m.id
    ),
    sent_at = (
      select min(l.attempted_at) from dpr_delivery_log l
      where l.dpr_message_id = m.id and l.outcome = 'success'
    )
where exists (select 1 from dpr_delivery_log l where l.dpr_message_id = m.id);

-- Keep attempts/sent_at in sync as the EF logs each delivery attempt.
create or replace function dpr_delivery_log_touch_message() returns trigger
language plpgsql security invoker as $$
begin
  update dpr_messages
  set attempts = attempts + 1,
      sent_at = case
        when NEW.outcome = 'success' and (sent_at is null or NEW.attempted_at < sent_at)
          then NEW.attempted_at
        else sent_at
      end
  where id = NEW.dpr_message_id;
  return new;
end;
$$;

drop trigger if exists dpr_delivery_log_after_insert on dpr_delivery_log;
create trigger dpr_delivery_log_after_insert
  after insert on dpr_delivery_log
  for each row execute function dpr_delivery_log_touch_message();

comment on column dpr_messages.attempts is
  'Delivery attempt count. Maintained by the dpr_delivery_log_after_insert trigger; matches dpr_delivery_log rows for the message.';
comment on column dpr_messages.sent_at is
  'Timestamp of the first successful delivery attempt (outcome=success), maintained by the delivery-log trigger.';

COMMIT;