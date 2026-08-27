# SiteTrack Pro — RBAC Security Analysis & Industry Comparison

*Generated: 2026-06-21 | Security & Permissions Agent*

---

## 1. Industry RBAC Pattern Research

### 1.1 Procore

| Feature | Procore Approach |
|---------|-----------------|
| **Permission model** | Role-based permission templates per project. Templates = reusable sets of tool-level permissions. |
| **Tiers** | Company-level (Account Admin) → Project-level (Project Admin → Project Members) |
| **Access levels** | None → Read Only → Standard → Admin, per individual tool (Documents, Photos, RFIs, etc.) |
| **Granularity** | Tool-level + folder-level (Documents). Separate permission per feature domain. |
| **Customization** | Custom permission templates. Folder-level permission groups based on document metadata. |
| **Audit trail** | Comprehensive at both account and project level. |
| **Notable** | Supports "Read Only" for external stakeholders. Permission inheritance via project templates. |

### 1.2 Autodesk Build / BIM 360

| Feature | Autodesk Approach |
|---------|------------------|
| **Permission model** | 3-tier: Account Admin → Project Admin → Project Member |
| **Tiers** | Account level (billing, users) → Project level (settings, members) → Role-based (actions) |
| **Access levels** | View Only → Upload/Download → Edit → Full Control. Applied per-folder. |
| **Granularity** | Folder-level + file-level. Role-based + company-based permission groups. |
| **Customization** | Custom roles within Account Admin. Folder-level permission groups (by company, role, or individual). |
| **Audit trail** | Comprehensive activity logging. |
| **Notable** | ISO 19650 compliance support. AES-256 encryption. Revit workflow integration with Full Control on specific folders. |

### 1.3 Current SCM

| Feature | Current SCM Approach |
|---------|---------------------|
| **Permission model** | Team-level RBAC + Project-level RBAC |
| **Tiers** | Team (org-wide) → Project (per-project custom roles) |
| **Granularity** | 220+ custom permissions available. 12 default project roles. |
| **Customization** | Highly customizable per-project roles with granular permission picker. |
| **Audit trail** | Logs every login event, data view, data modification (with previous state). |
| **Notable** | SSO via Microsoft/Google, 2FA, segregated client access, remote logout. |

### 1.4 Industry Best Practices Summary

| Practice | Adoption |
|----------|----------|
| Least-privilege principle | Universal |
| Tiered access (Account → Project → Member) | Universal |
| Read-only roles for external stakeholders | Universal |
| Folder-level granularity | Advanced (Procore, Autodesk) |
| Separation of duties (create vs approve) | Common in finance domains |
| Custom roles / permission templates | Common in enterprise tiers |
| Comprehensive audit logging | Universal |
| Time-bound access / just-in-time elevation | Emerging |
| Automated provisioning via IAM | Enterprise pattern |

---

## 2. SiteTrack Pro Current RBAC Assessment

### 2.1 Architecture Strengths

- **3-axis capability resolution** (Identity + Org-tier + Project-tier) — more sophisticated than most competitors' flat role models
- **145 granular capabilities** vs typical tool-level permissions — finer-grained than Procore's per-tool model
- **Superadmin override system** — allows emergency grants/revokes per-role per-org
- **Custom roles (HRMS pattern)** — enterprise-grade, on par with Current SCM
- **Plan-gated role availability** — business-model integration
- **Comprehensive test coverage** — 1225 tests, 92 files
- **Capability labels + grouping** — developer-friendly UX
- **Project-type scoped roles** — construction-specific role catalog per project type

### 2.2 Architecture Gaps vs Industry

| Gap | Severity | Industry Reference |
|-----|----------|-------------------|
| **No folder-level permissions** | Medium | Procore, Autodesk Build |
| **No separation of duties enforcement** | High | PCI, SOX, ISO 27001 |
| **No time-bound / temporary access** | Low-Medium | Just-in-time access pattern |
| **No permission inheritance model** | Low | Procore templates |
| **No emergency break-glass** | Medium | ISO 27001 |
| **Approval chain not integrated with RBAC** | Medium | Procore workflow engine |
| **Staff area scoping limited** | Low | Procore Account Admin |
| **No automated permission review reminders** | Low | IAM best practice |

### 2.3 Capability-Level Gap Analysis

#### Missing Capabilities Identified

| Missing Capability | Required By | Priority |
|-------------------|-------------|----------|
| `project:delete` | superadmin only (irreversible) | Medium |
| `material:delete` | orgadmin, pm | Medium |
| `update:delete` | orgadmin, pm, senior_architect | Low |
| `safety:report` | site_engineer (identity tier) | Already present |
| `safety:close` | pm, senior_architect | Medium |
| `photo:geotag:override` | superadmin, orgadmin | Low |
| `export:csv` | architect, senior_architect | Low |
| `notification:configure` | orgadmin (org tier) | Medium |
| `material:price:view` | orgadmin, pm | Medium |

#### Roles Missing Key Capabilities

| Role | Missing | Risk |
|------|---------|------|
| `promoter` (identity) | `project:create`, `project:archive` | Promoter as firm owner can't create projects without org-admin tier |
| `project_admin` (project-tier) | `po:create` | Creates invoices but can't initiate POs |
| `vendor` (identity) | `material:price:edit` (vendor sets their prices) | Need vendor price management capability |
| `site_inspector` | `audit:read` already present ✅ | OK |
| `prospector` | `export:pdf`, `export:csv` | Can't export prospect data |

### 2.4 Security Concerns

| Concern | Details | Risk Level |
|---------|---------|------------|
| **SoD violation: PM creates AND approves POs** | pm has both `po:create` + `po:approve` in identity + project tier | **High** — same person can commit fraud |
| **SoD violation: PM creates AND approves change orders** | pm has both `changeorder:create` + `changeorder:approve` | **High** |
| **SoD violation: PM creates AND approves RA bills** | pm has both `rabill:create` + `rabill:approve` | **High** |
| **SoD violation: PM creates AND approves expenses** | pm has both `expense:add` + `expense:approve` | **High** |
| **SoD violation: Project Admin creates AND approves invoices** | project_admin has both `invoice:create` + `invoice:approve` | **High** |
| **SoD violation: Project Admin creates AND approves RA bills** | project_admin has both `rabill:create` + `rabill:approve` | **High** |
| **orgadmin has ALL org caps including approve + create** | Admin tier consolidates create+approve for everything | **Medium** — acceptable for firm owner but risky for delegated admins |
| **site_engineer can approve DPRs** | `dpr:approve` granted to site_engineer who also submits DPRs | **Medium** |
| **No `project:delete` exists** | Irreversible action not gated behind any capability | **Medium** |
| **site_inspector has `rera:file`** | External role can file statutory returns | **Medium** — should be read-only except for assigned filings |

---

## 3. Recommendations

### 3.1 Immediate (High Priority)

#### Separation of Duties Fixes

Remove self-approval capability from PM and Project Admin roles. A user should not be able to both create and approve the same financial document.

| Role | Remove | Reason |
|------|--------|--------|
| `pm` (identity + project) | `po:approve` | PM creates POs; orgadmin approves |
| `pm` (identity + project) | `changeorder:approve` | PM creates change orders; orgadmin approves |
| `pm` (identity + project) | `rabill:approve` | PM creates RA bills; orgadmin/project_admin approves |
| `pm` (identity + project) | `expense:approve` | PM adds expenses; orgadmin approves |
| `project_admin` (identity + project) | `invoice:approve` | Project admin creates invoices; orgadmin approves |
| `project_admin` (identity + project) | `rabill:approve` | Project admin creates RA bills; orgadmin approves |

Add `export:csv` and `export:pdf` to `prospector` role for sales reporting.

Add `project:delete` capability and grant only to `superadmin`.

### 3.2 Medium Priority

- Add `notification:configure` to org-tier `admin` capabilities (currently in identity but not org-tier)
- Add `material:price:view` to `orgadmin`, `pm` identity caps
- Implement folder-level permission model for Document Management (future sprint)
- Add `update:delete` to `orgadmin`, `pm`, `senior_architect`
- Add `material:delete` to `orgadmin`, `pm`

### 3.3 Low Priority

- Implement time-bound / temporary access elevation
- Add break-glass emergency access protocol
- Implement automated quarterly permission review reminders
- Add permission change audit trail UI

---

## 4. Immediate Code Changes

Apply Separation of Duties fixes and capability gap fixes to `src/auth/permissions-matrix.ts`.

### SoD Removals from PM Identity Tier

- Remove `po:approve`, `changeorder:approve`, `rabill:approve`, `expense:approve`
- Keep `po:create`, `changeorder:create`, `rabill:create`, `expense:add`

### SoD Removals from PM Project Tier

- Remove `po:approve`, `changeorder:approve`, `rabill:approve`, `expense:approve`

### SoD Removals from Project Admin Identity Tier

- Remove `invoice:approve`, `rabill:approve`
- Keep `invoice:create`, `rabill:create`

### SoD Removals from Project Admin Project Tier

- Remove `invoice:approve`, `rabill:approve`

### Capability Additions

| File | Role | Add |
|------|------|-----|
| IDENTITY_CAPS | `prospector` | `export:pdf`, `export:csv` |
| IDENTITY_CAPS | `orgadmin` | `material:price:view` |
| IDENTITY_CAPS | `pm` | `material:price:view` |
| IDENTITY_CAPS | `orgadmin` | `material:delete` |
| IDENTITY_CAPS | `pm` | `material:delete` |
| IDENTITY_CAPS | `senior_architect` | `export:csv` |
| IDENTITY_CAPS | `architect` | `export:csv` |
| IDENTITY_CAPS | `pm` | `update:delete` |
| IDENTITY_CAPS | `senior_architect` | `update:delete` |
| IDENTITY_CAPS | `orgadmin` | `update:delete` |
| ORG_TIER_CAPS | `admin` | `notification:configure` |
| PROJECT_TIER_CAPS | `pm` | `update:delete` |

---

## 5. RLS & SQL Considerations

Each capability change should be reflected in:
- `scripts/supabase/66_rls_role_catalog_sync.sql` — capability identifier comments
- Row-level security policies that reference these capabilities (via JWT claims or function gates)

No RLS changes needed for the SoD fixes above — SoD is enforced at the application layer via capability gating. RLS is scoped to tenant isolation (org-level + project-level), which is unchanged.

---

## 6. References

- `src/auth/permissions-matrix.ts` — current capability matrix
- `src/auth/capabilities.ts` — capability definitions
- `src/auth/roles.ts` — role definitions
- `src/auth/RoleResolver.ts` — 3-axis composition engine
- `src/auth/capabilityOverrides.ts` — override mechanism
- `src/auth/customRoles.ts` — custom role support
- `docs/ROLE_FEATURES.md` — auto-generated role → features doc
- `docs/ROLE_ARCHITECTURE.md` — v2 architecture doc
- `docs/archive/SECURITY_AUDIT_2026-06.md` — prior security audit
- `tests/auth/permissionsMatrix.test.ts` — capability matrix tests
