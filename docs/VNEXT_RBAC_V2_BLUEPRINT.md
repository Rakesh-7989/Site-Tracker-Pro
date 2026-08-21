# SiteTrack Pro VNext — RBAC V2 & Layered Authorization Master Blueprint

> **Authority Document:** Redesigned Role-Based & Attribute-Based Access Control (RBAC/ABAC) architecture for SiteTrack Pro VNext, harmonizing 4 industry editions (Construction, Architecture, Interior Design, Consultancy) with Separation of Duties (SoD), Resource Scoping, and Multi-Tenant RLS isolation.

---

## 1. The 11-Step Layered Authorization Pipeline

Instead of a simplistic identity union (`role === "manager"`), SiteTrack Pro VNext evaluates access decisions through an **11-step deterministic pipeline**:

```text
                           ┌─────────────────────────────────────┐
                           │            ACCESS REQUEST           │
                           │ User + Org + Project + Resource+ Cap│
                           └──────────────────┬──────────────────┘
                                              │
                     ┌────────────────────────▼────────────────────────┐
                     │ 1. Identity Verification (Auth Token)           │
                     ├─────────────────────────────────────────────────┤
                     │ 2. Organization Membership (Tenant Context)     │
                     ├─────────────────────────────────────────────────┤
                     │ 3. Project Assignment & Role Tier               │
                     ├─────────────────────────────────────────────────┤
                     │ 4. Resource Scope Resolution                    │
                     ├─────────────────────────────────────────────────┤
                     │ 5. Capability Profile / Matrix Resolution       │
                     ├─────────────────────────────────────────────────┤
                     │ 6. Module Gate (Feature Enabled for Org?)       │
                     ├─────────────────────────────────────────────────┤
                     │ 7. Plan Gate (Subscription Quota / Tier?)       │
                     ├─────────────────────────────────────────────────┤
                     │ 8. Workflow State Guard (Allowed in State?)     │
                     ├─────────────────────────────────────────────────┤
                     │ 9. Explicit Deny Check (Profile / ACL / Org)    │
                     ├─────────────────────────────────────────────────┤
                     │ 10. Separation of Duties (Self-Approval Check)  │
                     ├─────────────────────────────────────────────────┤
                     │ 11. Database-Level RLS Enforcement              │
                     └────────────────────────┬────────────────────────┘
                                              │
                                              ▼
                                   ┌────────────────────┐
                                   │   FINAL DECISION   │
                                   │  (Allow or Deny)   │
                                   └────────────────────┘
```

---

## 2. Industry-Specific Role Profiles & Authorization Matrices

### 📐 1. Architecture Industry Edition
| Role Profile | Key Capabilities | Restricted Operations |
|---|---|---|
| **Design Head / Principal** | `phase:manage`, `fee:manage`, `drawings:approve`, `decision:approve` | Cannot self-approve submitted RFIs without co-review. |
| **Senior Architect** | `drawings:upload`, `drawings:review`, `drawings:compare`, `consultant:manage` | Cannot modify firm billing rates or financial ledgers. |
| **Project Architect** | `drawings:upload`, `task:create`, `task:update`, `timesheet:submit` | Cannot issue official GFC drawings without Design Head signoff. |
| **Junior Architect / CAD** | `drawings:upload`, `task:update`, `timesheet:submit` | Read-only access to consultant fee structures. |
| **Consultant (MEP/Struct)** | `drawings:upload`, `deliverable:submit`, `timesheet:submit` | Isolated to assigned project submittals; no client billing access. |
| **Client** | `drawings:review`, `client:approve`, `export:pdf` | Strict deny on internal markups, draft notes, and consultant hourly rates. |

---

### 🛋️ 2. Interior Design Industry Edition
| Role Profile | Key Capabilities | Restricted Operations |
|---|---|---|
| **Interior Design Head** | `room:manage`, `moodboard:manage`, `ffe:approve`, `po:approve`, `margin:view` | Cannot bypass dual-authorization for orders exceeding ₹5,00,000. |
| **Interior Designer** | `room:manage`, `moodboard:manage`, `ffe:create`, `ffe:update` | Cannot self-approve own FF&E selections for client release. |
| **Procurement / Admin Lead**| `po:create`, `po:approve`, `vendor:manage`, `material:price:view` | Cannot modify design specifications or aesthetic palettes. |
| **Site Installation PM** | `snag:create`, `snag:resolve`, `delivery:receive`, `install:verify` | Restricted from vendor trade discounts and wholesale cost sheets. |
| **Client** | `moodboard:review`, `selection:approve`, `payment:view` | Strictly blocked from vendor cost margins and designer markups. |

---

### 💼 3. Consultancy Industry Edition
| Role Profile | Key Capabilities | Restricted Operations |
|---|---|---|
| **Consultancy Head** | `engagement:manage`, `scope:manage`, `deliverable:approve`, `billing:manage` | Audit trail immutable; cannot backdate deliverable signoffs. |
| **Senior Consultant** | `scope:manage`, `deliverable:create`, `timesheet:submit`, `audit:conduct` | Cannot self-approve submitted deliverables or fee revisions. |
| **Site Auditor / Inspector** | `audit:conduct`, `finding:create`, `capa:assign`, `export:pdf` | Strict deny on financial ledgers, retainer invoices, and fee splits. |
| **Client** | `deliverable:review`, `finding:view`, `report:download` | Restricted from internal consultant utilization and cost metrics. |

---

### 🏗️ 4. Construction Industry Edition
| Role Profile | Key Capabilities | Restricted Operations |
|---|---|---|
| **Project Manager** | `project:update`, `dpr:review`, `task:assign`, `po:create`, `rabill:verify` | Cannot self-approve own Purchase Orders (SoD Rule #1). |
| **Site Engineer** | `dpr:create`, `task:update`, `issue:create`, `material:request` | Cannot certify contractor RA bills or modify contract amounts. |
| **Quality / Safety Inspector** | `inspection:conduct`, `issue:create`, `safety:incident:create` | Read-only audit access; strictly blocked from commercial billing. |
| **Contractor / Subcon** | `task:update`, `dpr:create`, `quote:submit`, `message:send` | Cannot approve own RA bills or view competitor tenders. |

---

## 3. Separation of Duties (SoD) Catalog

1. **SoD-01 (Purchase Order Dual Control):** The user who creates a Purchase Order (`po:create`) cannot approve the same Purchase Order (`po:approve`).
2. **SoD-02 (Design Selection Dual Control):** An Interior Designer who drafts an FF&E item (`ffe:create`) cannot self-approve it for client release (`ffe:approve`).
3. **SoD-03 (Consultancy Deliverable Dual Control):** A consultant submitting a milestone deliverable cannot be the sole approver.
4. **SoD-04 (Inspector Financial Isolation):** Site Inspectors and Safety Officers are explicitly denied financial modifications (`finance:manage`, `invoice:manage`, `payment:record`).
5. **SoD-05 (Client Margin Privacy):** Client users can review selections and totals but are strictly denied internal unit cost and profit margin fields (`profit:margin:view`).
6. **SoD-06 (Vendor Anti-Collusion Guard):** Vendors and subcontractors are strictly denied access to competitor quotes and unassigned project records (`competitor:quote:view`).

---

## 4. Technical Module Structure

```text
src/auth/
├── roles.ts                           // Canonical identity roles
├── capabilities.ts                    // Capability enumeration
├── permissions-matrix.ts              // Base matrix mapping
├── RoleResolver.ts                    // Matrix resolver engine
│
├── authorization/
│   ├── resolveAccess.ts               // Unified 11-step pipeline resolver
│   ├── scopes.ts                      // Resource, Org, Project scopes
│   ├── separationOfDuties.ts          // SoD dual-control rules
│   ├── explicitDeny.ts                // Explicit deny precedence engine
│   ├── workflowGuards.ts              // Lifecycle state authorization
│   ├── projectRoleRules.ts            // Project tier capability contribution
│   ├── clientScope.ts                 // Client portal restricted scoping
│   ├── vendorScope.ts                 // Vendor / Subcon scoping
│   └── inspectorScope.ts              // Site Inspector audit scoping
│
├── policies/
│   ├── core.ts                        // Core platform admin policy
│   ├── architecture.ts                // Architecture edition role profiles
│   ├── interior.ts                    // Interior edition role profiles
│   └── consultancy.ts                 // Consultancy edition role profiles
│
└── audit/
    └── authorizationAudit.ts          // Tamper-evident decision logger
```

---

## 5. Database Schema & Tables

1. `rbac_capabilities`: Canonical catalog of capabilities and domain groupings.
2. `rbac_role_profiles`: Pre-packaged and custom role profiles with segment tagging.
3. `rbac_profile_bindings`: Explicit allow/deny capability bindings per profile.
4. `rbac_profile_assignments`: User-to-profile bindings within an organization.
5. `resource_acl_entries`: Fine-grained object-level ACL overrides (`allow` / `deny`).
6. `client_portal_permissions`: Project-scoped client capabilities.
7. `vendor_project_scopes`: Project-scoped vendor/subcontractor boundaries.
8. `authorization_audit`: Cryptographically chained authorization decision events.

---

## 6. Migration Sequence & Cutover Roadmap

| Step | Identifier | Target Deliverable | Cutover Strategy |
|---|---|---|---|
| **Step 1** | `RBAC-201` | Capabilities Catalog V2 Schema | Non-breaking DDL |
| **Step 2** | `RBAC-202` | Role Profiles V2 Seed Data | Additive profiles |
| **Step 3** | `RBAC-203` | Profile Capability Bindings V2 | Seed allow/deny rules |
| **Step 4** | `RBAC-204` | Org Professional Tier Bindings | Bind org roles |
| **Step 5** | `RBAC-205` | Permission Overrides Table | Enable org custom overrides |
| **Step 6** | `RBAC-206` | Resource ACL Entries Table | Object-level security |
| **Step 7** | `RBAC-207` | Client Portal Permissions Table | Client scope gating |
| **Step 8** | `RBAC-208` | Vendor Project Scopes Table | Vendor boundary isolation |
| **Step 9** | `RBAC-209` | Authorization Audit Logger | Event hashing & audit log |
| **Step 10** | `RBAC-210` | Role Backfill Script | Map legacy roles to profiles |
| **Step 11** | `RBAC-211` | RLS Policy Hardening | Verify cross-tenant isolation |
| **Step 12** | `RBAC-212` | Resolver Cutover | Shadow ➔ Read ➔ Enforce |
