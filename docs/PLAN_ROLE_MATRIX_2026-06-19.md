# SiteTrack Pro Plan Role Matrix

Date: 2026-06-19

This is the implementation note for the plan-aware role defaults now encoded in
`src/auth/planRoleMatrix.ts` and persisted to `plans.feature_caps` by
`scripts/supabase/112_plan_role_defaults.sql`.

## R&D Baseline

- Procore and Autodesk Construction Cloud separate company/account level access
  from project-level permissions. SiteTrack should keep the current 3-axis
  resolver: identity role, org tier, and project tier.
- Buildertrend exposes default internal roles and custom roles for teams whose
  org chart no longer fits defaults. SiteTrack should keep standard roles in
  all plans and unlock custom roles at Business and above.
- Indian construction apps make DPR, labour, materials, photos, and local
  language support entry-tier table stakes. SiteTrack Basic must remain useful
  for a small site team, not just a read-only demo.
- Pro and Business should differ by operating scale: Pro adds specialist
  execution, drawings/RFI/finance/approvals; Business adds governance,
  custom roles, audit/export, filings, automations, and priority support.
- Enterprise/custom orgs should not be artificially constrained by the public
  self-serve bundle. They get the full customer role catalog plus custom roles.

## Plan Defaults

| Plan | Role intent | Org roles | Project role shape | Custom roles |
| --- | --- | --- | --- | --- |
| Basic | Small site team: owner, PM, architect, site engineer, contractor, client. | admin, pm, architect, contractor, client | Core construction/interior execution only. | No |
| Pro | Multi-site operations with specialist consultants and vendor collaboration. | Basic plus vendor | Basic plus project admin, senior/junior architect, DA, MEP/structural, consultant, designer. | No |
| Business | Governance and automation for larger firms. | Same as Pro | Pro plus design head, consultant head, site inspector. | Yes |
| Enterprise | Full customer catalog with bespoke controls. | All org roles | All project roles. | Yes |
| Custom | Enterprise behavior with scoped commercial terms. | All org roles | All project roles. | Yes |

## Code Contract

- Source of truth: `src/auth/planRoleMatrix.ts`.
- DB mirror: `plans.feature_caps.default_identity_roles`,
  `default_org_roles`, `default_project_roles`, and `role_matrix_version`.
- People UI: `/org/members` filters org role dropdowns by active plan while
  preserving any already-assigned role so existing data is not broken.
- Roles UI: `/org/roles` shows current plan defaults and uses `<PlanGate
  feature="custom_roles">` for the custom role editor.
- Platform helper: `planUnlocksCustomRoles()` now starts at Business to match
  `FEATURE_MIN_PLAN.custom_roles`, migration 96, pricing copy, and PlanGate.

## Follow-Up Checks

- When project team add/edit becomes real, reuse `projectTierRolesForPlan()`.
- If a future plan introduces partial custom roles, add a new flag rather than
  overloading `custom_roles`.
- If live DB has older plan rows, apply migration 112 after migration 96.

## R&D Source Links

- Procore permissions matrix: https://v2.support.procore.com/process-guides/permissions-matrix/
- Procore company/project permission levels: https://developers.procore.com/documentation/tutorial-user-permissions
- Autodesk project member roles/access levels: https://help.autodesk.com/view/DOCS/ENU/?guid=Manage_Project_Members
- Buildertrend internal roles/custom roles: https://buildertrend.com/help-article/internal-users-overview/
- Onsite app languages/access control: https://play.google.com/store/apps/details?id=com.app.onsite
- Powerplay app field features: https://play.google.com/store/apps/details?id=in.powerplay.android.fieldapp
