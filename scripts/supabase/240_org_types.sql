-- SiteTrack Pro — migration 240: organization FIRM TYPES.
--
-- Research input: "Role Intelligence Study" (Zoho-for-Startups + AEC OS
-- direction, Aug-2026). A firm's TYPE decides which ROLE TEMPLATES apply
-- (a builder's site engineer and an architect's junior architect are both
-- 'field/design staff', but their dashboards, nav and AI agents differ).
--
-- `segments` (mig 228) answers "which INDUSTRY modules does this org see".
-- `org_type` answers "what KIND of business runs this org" — orthogonal,
-- finer-grained:
--   developer        real-estate developer (sells units, runs projects)
--   builder          building contractor executing others'/own projects
--   architecture_firm
--   interior_firm
--   contractor       civil/MEP subcontractor firm
--   consultant       structural/MEP/pmc consultant practice
--   pmc              project-management consultancy
--   vendor           material/equipment vendor organisation
--
-- NULL = legacy/unclassified (falls back to segment-derived behaviour), so
-- nothing breaks and classification can happen progressively (onboarding
-- asks new orgs; existing orgs get classified from segments where unambiguous).
--
-- Backfill (unambiguous only):
--   segments ⊇ {architecture}            -> architecture_firm
--   segments ⊇ {interior}                -> interior_firm
--   segments = {consultancy}             -> consultant
--   construction/multiple stay NULL      -- cannot guess developer-vs-builder
--                                           -vs-contractor without asking.

alter table public.organizations
  add column if not exists org_type text;

do $$
begin
  alter table public.organizations
    add constraint organizations_org_type_check
    check (org_type in (
      'developer','builder','architecture_firm','interior_firm',
      'contractor','consultant','pmc','vendor'
    ));
exception when duplicate_object then null;
end $$;

create index if not exists idx_organizations_org_type on public.organizations(org_type);

-- Unambiguous backfill from segments (array column, mig 228).
update public.organizations
   set org_type = 'architecture_firm'
 where org_type is null and segments @> '{architecture}'
   and not segments && '{construction,interior,consultancy}';

update public.organizations
   set org_type = 'interior_firm'
 where org_type is null and segments @> '{interior}'
   and not segments && '{construction,architecture,consultancy}';

update public.organizations
   set org_type = 'consultant'
 where org_type is null and segments = '{consultancy}';

do $$ begin
  raise notice '240_org_types: org_type column + constraint + segment backfill live';
end $$;
