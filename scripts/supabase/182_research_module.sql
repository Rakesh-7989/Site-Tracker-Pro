-- SiteTrack Pro — Research Module: library RLS alignment + docs bucket + gating.
-- Run AFTER 181_dpr_attempts_sent_at.sql. Idempotent.
--
-- Completes the research module surface on top of 180_research_library.sql
-- (which created the tables with orgadmin-only writes):
--
-- 1. Extends the 155 enabled_modules CHECK to admit the `research` module id
--    (mirrors 161_crm_leads.sql — the auto-named check is dropped + re-added).
-- 2. Relaxes research table write RLS from `is_orgadmin()` only to the org
--    member set (read/insert/update) + manager set (delete), matching the CRM
--    posture (161): the frontend gates writes behind `research:manage` while
--    the DB keeps delete manager-scoped (orgadmin + pm + project_admin).
-- 3. Adds the missing UPDATE policy for collection_documents (180 only had
--    read/insert/delete).
-- 4. Creates the private `research-docs` storage bucket + org-scoped policies
--    (path <org_id>/<doc_id>/<file>, mirroring the 145 deliverables pattern).
-- 5. Seeds `research_library` (Pro+) into plans.feature_caps (basic off,
--    pro/business/enterprise/custom on, matching planCaps.ts FEATURE_MIN_PLAN).

BEGIN;

-- ── 1. Extend the module CHECK (155) to allow 'research' ────────────────────
alter table public.organizations
  drop constraint if exists organizations_enabled_modules_check;

alter table public.organizations
  add constraint organizations_enabled_modules_check check (
    enabled_modules is null or
    enabled_modules <@ array[
      'projects','clients','site_ops','design','consultancy','finance',
      'procurement','compliance','people','insights','kiosks','crm','research'
    ]::text[]
  );

-- ── 2. research_documents RLS alignment ──────────────────────────────────────
-- Read: any org member (knowledge is org-wide, like procurement_quotes).
drop policy if exists research_docs_read on public.research_documents;
create policy research_docs_read on public.research_documents for select
  using (org_id = any(public.user_org_ids()));

-- Insert/update: any org member (UI gates behind `research:manage`).
drop policy if exists research_docs_write on public.research_documents;
drop policy if exists research_docs_insert on public.research_documents;
create policy research_docs_insert on public.research_documents for insert
  with check (org_id = any(public.user_org_ids()));

drop policy if exists research_docs_update on public.research_documents;
create policy research_docs_update on public.research_documents for update
  using (org_id = any(public.user_org_ids()))
  with check (org_id = any(public.user_org_ids()));

-- Delete: managers only (orgadmin + pm + project_admin + superadmin).
drop policy if exists research_docs_delete on public.research_documents;
create policy research_docs_delete on public.research_documents for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── 3. research_collections RLS alignment ────────────────────────────────────
drop policy if exists research_collections_read on public.research_collections;
create policy research_collections_read on public.research_collections for select
  using (org_id = any(public.user_org_ids()));

drop policy if exists research_collections_write on public.research_collections;
drop policy if exists research_collections_insert on public.research_collections;
create policy research_collections_insert on public.research_collections for insert
  with check (org_id = any(public.user_org_ids()));

drop policy if exists research_collections_update on public.research_collections;
create policy research_collections_update on public.research_collections for update
  using (org_id = any(public.user_org_ids()))
  with check (org_id = any(public.user_org_ids()));

drop policy if exists research_collections_delete on public.research_collections;
create policy research_collections_delete on public.research_collections for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── 4. collection_documents RLS alignment (adds the missing UPDATE) ─────────
drop policy if exists collection_docs_read on public.collection_documents;
create policy collection_docs_read on public.collection_documents for select
  using (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
  );

drop policy if exists collection_docs_write on public.collection_documents;
create policy collection_docs_write on public.collection_documents for insert
  with check (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
    and document_id in (
      select id from public.research_documents
      where org_id = any(public.user_org_ids())
    )
  );

drop policy if exists collection_docs_update on public.collection_documents;
create policy collection_docs_update on public.collection_documents for update
  using (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
  )
  with check (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
    and document_id in (
      select id from public.research_documents
      where org_id = any(public.user_org_ids())
    )
  );

drop policy if exists collection_docs_delete on public.collection_documents;
create policy collection_docs_delete on public.collection_documents for delete
  using (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
  );

-- ── 5. research-docs storage bucket + RLS (org-scoped) ──────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('research-docs', 'research-docs', false, 52428800, null)
on conflict (id) do nothing;

-- Read: any org member (path <org_id>/<doc_id>/<file>).
drop policy if exists research_docs_storage_read on storage.objects;
create policy research_docs_storage_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
  );

-- Insert: org member (UI gates behind research:manage).
drop policy if exists research_docs_storage_insert on storage.objects;
create policy research_docs_storage_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor')
  );

-- Update: org member.
drop policy if exists research_docs_storage_update on storage.objects;
create policy research_docs_storage_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
  )
  with check (
    bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
  );

-- Delete: managers only.
drop policy if exists research_docs_storage_delete on storage.objects;
create policy research_docs_storage_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
  );

-- ── 6. Seed research_library (Pro+) into plans.feature_caps ─────────────────
UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'research_library', false
), updated_at = now() WHERE id = 'basic';

UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'research_library', true
), updated_at = now() WHERE id = 'pro';

UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'research_library', true
), updated_at = now() WHERE id = 'business';

UPDATE public.plans SET feature_caps = feature_caps || jsonb_build_object(
  'research_library', true
), updated_at = now() WHERE id IN ('enterprise', 'custom');

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.research_documents;
  RAISE NOTICE '182_research_module: ready. research_documents=%', n;
END $$;

COMMIT;