-- SiteTrack Pro — B5 storage quota usage (P-H2).
-- Adds public.storage_usage_by_org(p_org_id uuid) returning per-bucket
-- usage across deliverables / dpr-media / research-docs, member-gated
-- via (storage.foldername(name))[1] matching the org_id path prefix.

BEGIN;

-- ── 1. Bucket idempotents (already live in 145/157/182; re-insert if missing) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deliverables', 'deliverables', false, 52428800, null)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dpr-media', 'dpr-media', false, 15728640, null) -- 15 MB
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('research-docs', 'research-docs', false, 52428800, null) -- 50 MB
on conflict (id) do nothing;

-- ── 2. Storage RLS policies (idempotent; match deliverables pattern) ──

-- Deliverables read: project member (mirrors 145).
drop policy if exists storage_deliverables_read on storage.objects;
create policy storage_deliverables_read on storage.objects for select
  to authenticated
  using (bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text));

-- Deliverables insert: project member, exclude client-ish roles (mirrors 145).
drop policy if exists storage_deliverables_insert on storage.objects;
create policy storage_deliverables_insert on storage.objects for insert
  to authenticated
  with check (bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text)
    and current_role_text() not in ('client','site_inspector','vendor','sub_contractor'));

-- Deliverables update: project member (mirrors 145).
drop policy if exists storage_deliverables_update on storage.objects;
create policy storage_deliverables_update on storage.objects for update
  to authenticated
  using (bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text))
  with check (bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text));

-- Deliverables delete: managers + org admin (mirrors 145).
drop policy if exists storage_deliverables_delete on storage.objects;
create policy storage_deliverables_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'deliverables'
    and (storage.foldername(name))[1] in (select user_project_ids()::text)
    and (is_orgadmin()
       or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
       or has_project_role(
         (storage.foldername(name))[1]::uuid,
         'pm','project_admin','design_head','consultant_head')));

-- DPR-media read: org member (mirrors 157).
drop policy if exists storage_dpr_media_read on storage.objects;
create policy storage_dpr_media_read on storage.objects for select
  to authenticated
  using (bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text));

-- DPR-media insert: org member (mirrors 157).
drop policy if exists storage_dpr_media_insert on storage.objects;
create policy storage_dpr_media_insert on storage.objects for insert
  to authenticated
  with check (bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text));

-- DPR-media update: org member (mirrors 157).
drop policy if exists storage_dpr_media_update on storage.objects;
create policy storage_dpr_media_update on storage.objects for update
  to authenticated
  using (bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text))
  with check (bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text));

-- DPR-media delete: org admin only (mirrors 157).
drop policy if exists storage_dpr_media_delete on storage.objects;
create policy storage_dpr_media_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
    and is_orgadmin());

-- Research-docs read: org member (mirrors 182).
drop policy if exists storage_research_docs_read on storage.objects;
create policy storage_research_docs_read on storage.objects for select
  to authenticated
  using (bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text));

-- Research-docs insert: org member (mirrors 182).
drop policy if exists storage_research_docs_insert on storage.objects;
create policy storage_research_docs_insert on storage.objects for insert
  to authenticated
  with check (bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text));

-- Research-docs update: org member (mirrors 182).
drop policy if exists storage_research_docs_update on storage.objects;
create policy storage_research_docs_update on storage.objects for update
  to authenticated
  using (bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text))
  with check (bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text));

-- Research-docs delete: org admin only (mirrors 182).
drop policy if exists storage_research_docs_delete on storage.objects;
create policy storage_research_docs_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'research-docs'
    and (storage.foldername(name))[1] in (select user_org_ids()::text)
    and is_orgadmin());

-- ── 3. Quota-usage RPC ───────────────────────────────────────────────────────
create or replace function public.storage_usage_by_org(p_org_id uuid)
returns table(
  bucket text,
  used_bytes bigint,
  total_bytes bigint,
  used_pct numeric(5,2)
) language plpgsql stable as $$
declare
  v_used bigint;
  v_total bigint;
  v_pct numeric(5,2);
begin
  -- Deliverables bucket: path <org_id>/... so foldername[1] = org_id text
  select coalesce(sum((metadata->>'size')::bigint),0) into v_used
  from storage.objects
  where bucket_id = 'deliverables'
    and (storage.foldername(name))[1] = org_id::text;
  select coalesce(sum(file_size_limit),0) into v_total
  from storage.buckets where id = 'deliverables';
  used_pct := case when v_total > 0 then (v_used::numeric / v_total * 100) else 0 end;
  return next;

  -- DPR-media bucket
  select coalesce(sum((metadata->>'size')::bigint),0) into v_used
  from storage.objects
  where bucket_id = 'dpr-media'
    and (storage.foldername(name))[1] = org_id::text;
  select coalesce(sum(file_size_limit),0) into v_total
  from storage.buckets where id = 'dpr-media';
  used_pct := case when v_total > 0 then (v_used::numeric / v_total * 100) else 0 end;
  return next;

  -- Research-docs bucket
  select coalesce(sum((metadata->>'size')::bigint),0) into v_used
  from storage.objects
  where bucket_id = 'research-docs'
    and (storage.foldername(name))[1] = org_id::text;
  select coalesce(sum(file_size_limit),0) into v_total
  from storage.buckets where id = 'research-docs';
  used_pct := case when v_total > 0 then (v_used::numeric / v_total * 100) else 0 end;
  return next;
end;
$$;

-- ── 4. Grants: anon + authenticated can read the RPC ────────────────────────
revoke all on function public.storage_usage_by_org(uuid) from public;
grant execute on function public.storage_usage_by_org(uuid) to anon, authenticated;

do $$ declare n int; begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'storage' and column_name = 'metadata';
  raise notice '200_storage_usage: buckets (deliverables/dpr-media/research-docs) + RPC storage_usage_by_org ready (1/0 = %).', n;
end $$;

COMMIT;