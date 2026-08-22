-- SiteTrack Pro — Multi-segment organizations (v5 Growth).
--
-- Story: an org should be able to operate across ONE or MORE industry
-- segments (construction / architecture / interior / consultancy) — e.g. an
-- architecture firm that also does interiors and consultancy — and the
-- workspace (modules, nav, project types, tab gates) should reflect the
-- UNION of the picked segments.
--
-- Model (mirrors enabled_modules, migration 155):
--   organizations.segments text[]
--     NULL   → not configured yet: fall back to the legacy single `segment`
--              column ('multiple' expands to all four), else all-show.
--     [..]   → the org's concrete segment set (1..4 of the CORE segments;
--              'multiple' is deliberately NOT storable — it is a derived
--              legacy value).
--   The legacy `segment` column stays in sync for back-compat readers:
--     1 pick → that segment; 2+ picks → 'multiple'.
--
-- Backfill: single-segment orgs get segments = ARRAY[segment]; 'multiple'
-- and legacy-null keep NULL (resolved at read time).

BEGIN;

alter table public.organizations
  add column if not exists segments text[];

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_segments_check'
  ) then
    alter table public.organizations
      add constraint organizations_segments_check check (
        segments is null or (
          array_length(segments, 1) between 1 and 4
          and segments <@ array['construction','architecture','interior','consultancy']::text[]
        )
      );
  end if;
end $$;

create index if not exists organizations_segments_gin
  on public.organizations using gin (segments);

-- Backfill single-segment orgs; 'multiple'/null stay NULL (read-time fallback)
update public.organizations
  set segments = array[segment::text]
  where segments is null
    and segment in ('construction','architecture','interior','consultancy');

comment on column public.organizations.segments is
  'Multi-segment picks (v5): 1..4 core segments; NULL = not configured (falls back to legacy segment column).';

do $$ begin
  raise notice '228_org_multi_segment: organizations.segments text[] + CHECK + GIN + backfill done';
end $$;

COMMIT;
