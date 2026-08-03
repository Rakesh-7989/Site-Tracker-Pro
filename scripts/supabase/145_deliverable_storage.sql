-- SiteTrack Pro — v4 Phase C3.2: deliverable file uploads (Supabase Storage).
-- Run AFTER 144_time_entries_phase_id.sql. Idempotent.
--
-- Creates a PRIVATE `deliverables` storage bucket and RLS policies on
-- storage.objects that mirror the deliverables table gates (139):
--   read      → any project member (user_project_ids())
--   insert    → project member, excluding client/site_inspector/vendor/
--               sub_contractor identity roles (mirrors deliverables_manage)
--   update    → project member (mirrors deliverables_edit)
--   delete    → managers + org admin (mirrors deliverables_delete, incl.
--               project-tier managers via has_project_role)
--
-- Object path scheme: <project_id>/<deliverable_id>/<file_name>
--   → the first path segment is the project id, so every policy filters on
--     (storage.foldername(name))[1] IN (SELECT user_project_ids()::text).
--
-- NOTE (validated against live DB): storage.foldername() returns text[], so
-- index [1] directly — do NOT pass it to string_to_array(). And compare the
-- text segment against user_project_ids()::text (that function returns uuid).

BEGIN;

-- ── 1. Bucket (idempotent) ───────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deliverables', 'deliverables', false, 52428800, null)
on conflict (id) do nothing;

-- ── 2. Storage RLS policies ──────────────────────────────────────────────────
-- Read: any project member.
drop policy if exists deliverables_storage_read on storage.objects;
create policy deliverables_storage_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text)
  );

-- Insert: project member, identity role not client-ish (mirrors deliverables_manage).
drop policy if exists deliverables_storage_insert on storage.objects;
create policy deliverables_storage_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text)
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor')
  );

-- Update: project member (mirrors deliverables_edit — allows owner/override).
drop policy if exists deliverables_storage_update on storage.objects;
create policy deliverables_storage_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text)
  )
  with check (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text)
  );

-- Delete: managers + org admin (mirrors deliverables_delete incl. project-tier).
drop policy if exists deliverables_storage_delete on storage.objects;
create policy deliverables_storage_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text)
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
      or has_project_role(
        (storage.foldername(name))[1]::uuid,
        'pm','project_admin','design_head','consultant_head'
      )
    )
  );

DO $$ BEGIN
  RAISE NOTICE '145_deliverable_storage: bucket deliverables ready';
END $$;

COMMIT;
