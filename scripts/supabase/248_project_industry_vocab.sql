-- 248_project_industry_vocab.sql
-- Widen projects.industry_subtype beyond the construction-only vocabulary
-- (migration 133) so every project TYPE gets an optional industry/segment
-- dropdown in the create form:
--   interior   → residential/commercial/hospitality/healthcare/retail/office
--   design     → residential/commercial/institutional/industrial/landscape/urbanism
--   consultant → structural/mep/geotechnical/quantity_surveying/project_management/safety
-- Existing construction values are unchanged; the column stays optional.

alter table public.projects
  drop constraint if exists projects_industry_subtype_check;

alter table public.projects
  add constraint projects_industry_subtype_check
  check (industry_subtype is null or industry_subtype in (
    'residential','commercial','industrial','infrastructure','institutional','mixed_use',
    'hospitality','healthcare','retail','office',
    'landscape','urbanism',
    'structural','mep','geotechnical','quantity_surveying','project_management','safety'
  ));

comment on constraint projects_industry_subtype_check on public.projects is
  'Optional per-type industry tag; vocabulary = union of PROJECT_INDUSTRIES_BY_TYPE (src/auth/roles.ts).';
