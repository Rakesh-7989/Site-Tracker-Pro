-- SiteTrack Pro — Polygon audit anchor checkpoints.
-- Run AFTER 26_share_tokens.sql. Idempotent.
--
-- One row per day: the merkle root of that day's audit_log_v2 entries,
-- written to Polygon mainnet via the anchor(bytes32) contract. Mirrors
-- src/lib/blockchainAnchor.js (pure-function lib + tests). Anchoring is
-- triggered by a daily cron (or manual button); failure to anchor does
-- NOT block writes — the chain replays from audit_log_v2 anytime.

create table if not exists audit_anchors (
  day           date primary key,
  row_count     bigint not null,
  merkle_root   bytea not null,                             -- 32-byte sha256 root
  tx_hash       text,                                       -- 0x-prefixed Polygon tx hash
  block_number  bigint,
  network       text default 'polygon-mainnet'
    check (network in ('polygon-mainnet','polygon-amoy','local','none')),
  status        text not null default 'pending'
    check (status in ('pending','submitted','confirmed','failed','manual')),
  failure_reason text,
  anchored_at   timestamptz default now(),
  confirmed_at  timestamptz,
  -- We keep a copy of the rationale in case the on-chain tx is later disputed
  -- (different RPC, fork, etc.). Audit row IDs included for verification.
  row_id_range  jsonb,                                      -- {min: uuid, max: uuid}
  metadata      jsonb default '{}'::jsonb
);

create index if not exists idx_audit_anchors_status on audit_anchors(status);
create index if not exists idx_audit_anchors_recent on audit_anchors(anchored_at desc);

alter table audit_anchors enable row level security;

-- Tenants need to see anchors for their org's compliance reports.
drop policy if exists audit_anchors_read on audit_anchors;
create policy audit_anchors_read on audit_anchors for select using (true);

-- Only superadmin / cron / EF (via service_role) can write.
drop policy if exists audit_anchors_write on audit_anchors;
create policy audit_anchors_write on audit_anchors for all
  using (is_superadmin())
  with check (is_superadmin());

-- ============================================================================
-- Convenience view: anchor status by day with row counts cross-checked.
-- ============================================================================
create or replace view audit_anchor_status as
select
  a.day,
  a.row_count                                  as anchored_count,
  (select count(*) from audit_log_v2 where ts::date = a.day) as actual_count,
  a.status,
  a.network,
  a.tx_hash,
  a.anchored_at,
  a.confirmed_at,
  (a.row_count =
    (select count(*) from audit_log_v2 where ts::date = a.day)) as count_matches
from audit_anchors a;

do $$ declare n int; pending int; begin
  select count(*) into n from audit_anchors;
  select count(*) into pending from audit_anchors where status = 'pending';
  raise notice '27_audit_anchors: ready. anchors=% (pending=%).', n, pending;
end $$;