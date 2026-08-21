# SiteTrack Pro — Vertical Slice Audit: Drawings, Documents & Storage Authorization

> **Authority Document:** Complete end-to-end trace of **DrawingsTab ➔ designQueries ➔ drawings Table ➔ Supabase Storage (`deliverables`) ➔ Revision State Machine ➔ RLS Policies**.

---

## 1. Findings & Remediation Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `DRAW-001` | RLS Policy | 🔴 **P1** | **Site Inspector Drawing UPDATE Scope Leak**<br>Migration 126 (`v4_drawings_update`) permitted `site_inspector` despite being a read-only audit role. | Strictly revoke `UPDATE`/`DELETE` permissions on drawings for `site_inspector`. | ✅ Hardened |
| `DRAW-002` | Scope Isolation | 🔴 **P1** | **Drawing RLS Scope Leak via `user_project_ids()`**<br>Drawings RLS allowed org-wide access for PMs/Architects not assigned to the project. | Transition drawing SELECT/INSERT/UPDATE to `project_role_for(project_id)` check. | ✅ Targeted |
| `DRAW-003` | Authorization | 🔴 **P1** | **Coarse Row-Level UPDATE vs Action-Level Gates**<br>Generic `UPDATE drawings SET <patch>` allows updating status, design stage, and preview URL in one shot. | Implement fine-grained domain mutations: `setDrawingStatus()`, `setDrawingStage()`, `setDrawingPreview()`. | ✅ Specified |
| `DRAW-004` | Audit Integrity | 🔴 **P1** | **Browser-Supplied `releasedBy` Field**<br>`createDrawing()` trusts client payload for `releasedBy` user ID. | Resolve `released_by = auth.uid()` on server/DB layer during release mutation. | ✅ Enforced |
| `DRAW-005` | Revision Engine | 🟠 **P2** | **Split Revision Governance (DB vs UI)**<br>Optimistic `applyAutoSupersede()` in UI must reconcile with authoritative `trg_drawings_auto_supersede` in DB. | Server state authoritative; UI optimistic updates reconcile on mutation completion. | ✅ Verified |
| `DRAW-006` | Concurrency | 🟠 **P2** | **Concurrent Revision Release Race Condition**<br>Two architects simultaneously releasing Rev C and Rev D could result in inconsistent `current` flags. | Add serialization test ensuring auto-supersede trigger strictly maintains single `current` revision. | ✅ Tested |
| `DRAW-007` | Storage RBAC | 🔴 **P1** | **Identity-Role Based Storage Permissions**<br>`deliverables` bucket checks `current_role_text()` rather than project role + capability. | Map storage objects (`<project_id>/<drawing_id>/...`) to project capability checks. | ✅ Architected |
| `DRAW-008` | Storage Security | 🔴 **P1** | **Storage UPDATE Overly Permissive**<br>Generic project member could overwrite issued/contract drawing binary files. | Separate `drawing:file:upload` vs `drawing:file:replace` (only allowed in draft/unreleased stage). | ✅ Hardened |
| `DRAW-009` | Storage Delete | 🟢 **P2** | **Storage DELETE Properly Protected**<br>Checks `has_project_role()` across lead roles (pm, design_head, etc.). | Retained as sound architectural pattern. | ✅ Verified |
| `DRAW-010` | Path Isolation | 🟢 **P2** | **File Path Isolation & Sanitization Sound**<br>Uses `<project_id>/<drawing_id>/<file_name>` with strict regex sanitization. | Retained as defensive standard across all storage uploads. | ✅ Verified |
| `DRAW-011` | Bucket Coupling | 🟠 **P2** | **Shared `deliverables` Bucket Creates Policy Coupling**<br>Drawings and general deliverables share the same storage bucket. | Implement unified storage policy dispatcher based on path prefix and capability mapping. | ✅ Architected |
| `DRAW-012` | Code Quality | 🟠 **P2** | **`getClient()` Called Directly in Feature Component**<br>`DrawingsTab` directly orchestrates Supabase, Storage, and Queries. | Consolidate into `DrawingService` boundary separating UI presentation from data orchestration. | ✅ Refactored |
| `DRAW-013` | Business Logic | 🔴 **P1** | **Drawing "Approve" Grouped Under Generic `canEdit`**<br>Workflow stage advancement and GFC final approval both gated by `drawings:upload`. | Create distinct `drawing:workflow:approve` / `design:approve` capability separate from drafting. | ✅ Separated |

---

## 2. Industry-Specific Lifecycle & Role Matrix

```text
                                DRAWING LIFECYCLE
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ↓                            ↓                            ↓
     1. CREATION / DRAFT           2. REVIEW ROUNDS             3. GFC RELEASE
     (Junior / Architect)       (Senior / Consultants)        (Design Head / PM)
           │                            │                            │
           ▼                            ▼                            ▼
  drawing:file:upload           drawing:workflow:advance     drawing:workflow:approve
```

### 1. Construction Industry
- **Site Engineer:** Upload site drawings / as-built references.
- **Architect:** Create and revise technical drawings.
- **Senior Architect:** Review structural/architectural consistency.
- **Project Manager (PM):** Final GFC release and client signoff.
- **Site Inspector:** View and download released drawings only (Strictly Read-Only).
- **Client:** View Good-For-Construction (GFC) released drawings only.

### 2. Interior Industry
- **Interior Designer:** Create concepts, mood boards, and detailed layout drawings.
- **Design Architect:** Technical review and MEP clearance.
- **Design Head:** Approve for procurement and client presentation.
- **Site Engineer:** Execute approved drawings on site.
- **Client:** View released client drawings.

### 3. Design & Architecture
- **Junior Architect:** Draft initial CAD revisions.
- **Architect:** Update revisions based on client / lead feedback.
- **Senior Architect:** Quality audit and consultant coordination.
- **Design Head:** Final signoff and stamping.

### 4. Consultancy
- **Consultant:** Create specialist structural / MEP / HVAC calculations and drawings.
- **Senior Consultant:** Review calculations against local codes.
- **Consultant Head:** Authorize release to lead architect and PM.

---

## 3. Unified Policy Core Architecture

```text
                                 UNIFIED POLICY CORE
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
              PROJECT ROLE & TIER                         CAPABILITY
                     │                                         │
                     └────────────────────┬────────────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
           DATABASE RLS POLICIES                     STORAGE OBJECT POLICIES
           (projects, drawings, etc)                 (deliverables, drawings, etc)
                     │                                         │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                                UNIFIED DECISION (ALLOW/DENY)
```
