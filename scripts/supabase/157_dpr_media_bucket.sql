-- SiteTrack Pro — Sprint 2 DPR media storage bucket (photo + voice).
-- Run AFTER 155_enabled_modules.sql. Idempotent.
-- (Renamed 156→157 to avoid colliding with 156_project_member_schema_fix.sql.)
--
-- Creates a PRIVATE `dpr-media` storage bucket + RLS policies on
-- storage.objects for the Daily Progress Report media pipeline:
--   read      → any org member (user_org_ids())
--   insert    → org member, excluding client-ish identity roles (mirrors the
--               DPR submit role set: site_supervisor/site_engineer/pm/...)
--   update    → org member
--   delete    → org admin + manager identity roles (incl. project-tier)
--
-- Object path scheme: <org_id>/<YYYY-MM-DD>/<sha256>.<ext>
--   → the first path segment is the org id, so every policy filters on
--     (storage.foldername(name))[1] IN (SELECT user_org_ids()::text).
--     Mirrors the validated pattern from 145_deliverable_storage.sql:
--     storage.foldername() returns text[] (index [1] directly) and compare
--     against user_org_ids()::text (that returns uuid[]).

BEGIN;

-- ── 1. Bucket (idempotent) ───────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dpr-media', 'dpr-media', false, 15728640, null)   -- 15 MB (photo 5 MB + voice 10 MB headroom)
on conflict (id) do nothing;

-- ── 2. Storage RLS policies ──────────────────────────────────────────────────
-- Read: any org member.
drop policy if exists dpr_media_storage_read on storage.objects;
create policy dpr_media_storage_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select public.user_org_ids()::text)
  );

-- Insert: org member, identity role not client-ish (mirrors DPR submit roles).
drop policy if exists dpr_media_storage_insert on storage.objects;
create policy dpr_media_storage_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select public.user_org_ids()::text)
    and current_role_text() not in ('promoter','client','site_inspector','vendor','sub_contractor')
  );

-- Update: org member.
drop policy if exists dpr_media_storage_update on storage.objects;
create policy dpr_media_storage_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select public.user_org_ids()::text)
  )
  with check (
    bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select public.user_org_ids()::text)
  );

-- Delete: managers + org admin (incl. project-tier manager rows).
drop policy if exists dpr_media_storage_delete on storage.objects;
create policy dpr_media_storage_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select public.user_org_ids()::text)
    and (
      public.is_orgadmin()
      or current_role_text() in ('pm','project_admin','site_engineer','superadmin')
      or has_project_role(
        (storage.foldername(name))[1]::uuid,
        'pm','project_admin','site_engineer','site_supervisor'
      )
    )
  );

DO $$ BEGIN
  RAISE NOTICE '157_dpr_media_bucket: bucket dpr-media ready';
END $$;

COMMIT;