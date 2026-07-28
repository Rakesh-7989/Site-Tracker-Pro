-- SiteTrack Pro — migration 100: audit-log immutability triggers.
--
-- Prevents any UPDATE or DELETE on audit_log_v2 and activity_log at the
-- database level, so even a future misconfigured GRANT cannot break the
-- audit trail. Superadmins who need to purge data for legal/DPDP erasure
-- should use the existing delete_organization RPC (mig 92) instead.

-- ── audit_log_v2 ─────────────────────────────────────────────────────────────

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_audit_delete', true) = 'true' then
    return old;
  end if;
  raise exception 'audit_log_v2 is immutable: update/delete is not permitted. Use delete_organization RPC for DPDP erasure.';
end;
$$;

create or replace trigger trg_audit_log_v2_immutable
  before update or delete on public.audit_log_v2
  for each row
  execute function public.prevent_audit_log_mutation();

-- ── activity_log ────────────────────────────────────────────────────────────

create or replace trigger trg_activity_log_immutable
  before update or delete on public.activity_log
  for each row
  execute function public.prevent_audit_log_mutation();
