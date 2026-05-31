-- SiteTrack Pro — WhatsApp send log (audit trail for Meta Cloud API calls).
-- Run AFTER 29_phase2_tests.sql. Idempotent.
--
-- Backs the whatsapp-send EF. One row per send attempt — successful or not.
-- Used by:
--   - Rate limiter inside whatsapp-send EF (count rows in last 60s per org)
--   - Org Admin → Activity → "WhatsApp deliveries" panel
--   - Compliance: keep proof of when each statutory message went out

create table if not exists whatsapp_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references organizations(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  to              text not null,                              -- E.164
  wa_id           text,                                       -- normalized by Meta
  kind            text not null check (kind in ('text','template')),
  template_name   text,
  language        text check (language in ('en','te','hi')),
  body            text,
  meta_message_id text,
  meta_status_code int,
  status          text not null
    check (status in ('sent','failed','rate-limited','queued','delivered','read')),
  failure_reason  text,
  failure_code    int,
  raw_response    jsonb,
  created_at      timestamptz default now()
);

create index if not exists idx_whatsapp_org_time on whatsapp_log(org_id, created_at desc);
create index if not exists idx_whatsapp_project_time on whatsapp_log(project_id, created_at desc);
create index if not exists idx_whatsapp_meta on whatsapp_log(meta_message_id) where meta_message_id is not null;

alter table whatsapp_log enable row level security;

-- Tenants can read their own org's logs (orgadmin + finance + super).
create policy whatsapp_log_read on whatsapp_log for select
  using (
    is_superadmin()
    or org_id = user_org_id()
    or project_id in (select user_project_ids())
  );

-- All inserts come from the EF (service_role). Direct insert revoked.
revoke insert, update, delete on whatsapp_log from authenticated;

do $$ declare n int; begin
  select count(*) into n from whatsapp_log;
  raise notice '30_whatsapp_log: ready. % row(s).', n;
end $$;
