# Project Lifecycle

## Overview

Project lifecycle management in Site-Tracker-Pro tracks projects through their
entire existence: from creation, through active work, to pause/hold, deactivation,
and eventual archive or deletion. This provides a clear audit trail and prevents
accidental data loss.

## Status Enum

**`projects.status`** values ( CHECK constraint, migration **193** ):

| Status | Terminal? | Reactivate? | Description |
|--------|-----------|-------------|-------------|
| `active` | No | Yes | Normal project operation |
| `paused` | No | Yes | Work temporarily stopped; all data preserved |
| `on_hold` | No | Yes | Project on hold (distinct from `paused` — see notes) |
| `deactivated` | No | Yes | Project deactivated; can be reactivated |
| `completed` | Yes | No | Project finished; no further work expected |
| `cancelled` | Yes | No | Project cancelled; work stopped permanently |

**Non-terminal states** (can be reactivated → `active`):
- `paused`
- `on_hold`
- `deactivated`

**Terminal states** (no forward move except archive/delete or reactivate back to `active`):
- `completed`
- `cancelled`

## Lifecycle Transitions

| From → To | Allowed? | Notes |
|-----------|----------|-------|
| `active` → `paused` | ✅ | Work stops; data preserved |
| `active` → `on_hold` | ✅ | Project placed on hold |
| `active` → `deactivated` | ✅ | Project deactivated |
| `paused` → `active` | ✅ | Reactivate from paused |
| `on_hold` → `active` | ✅ | Reactivate from hold |
| `deactivated` → `active` | ✅ | Reactivate from deactivated |
| `completed` → `active` | ❌ | Must archive or reactivate via special flow |
| `cancelled` → `active` | ❌ | Must restore from archive/delete |
| `active` → `completed` | ✅ | Mark as completed (terminal) |
| `active` → `cancelled` | ✅ | Mark as cancelled (terminal) |
| Any → `archived` | ✅ | Superadmin only; hard-hides from active list, frees quota slot |
| Any → `deleted` | ✅ | Superadmin only; permanent delete |

## UI States & Actions

### Project Dashboard / List View

Each project card shows a **status badge** with appropriate action buttons:

| Status | Badge Color | Available Actions |
|--------|-------------|-------------------|
| `active` | `success` | `Pause`, `Deactivate`, `Complete`, `Cancel` |
| `paused` | `warning` | `Reactivate`, `Deactivate`, `Complete`, `Cancel` |
| `on_hold` | `secondary` | `Reactivate`, `Deactivate`, `Complete`, `Cancel` |
| `deactivated` | `default` | `Reactivate`, `Archive`, `Delete (superadmin)` |
| `completed` | `info` | `Archive`, `Restore (superadmin)` |
| `cancelled` | `danger` | `Restore (superadmin)` |

### Project Detail View — Status Section

```
+------------------------------------------+
| Status: [badge]                          |
|                                          |
| Action Buttons:                          |
|  ├─ [Reactivate]   (if not active)       |
|  ├─ [Pause]        (if active)            |
|  ├─ [On Hold]      (if active)            |
|  ├─ [Deactivate]   (if active/paused)     |
|  ├─ [Complete]     (if active)            |
|  ├─ [Cancel]       (if active)            |
|  └─ [Archive]     (superadmin only)      |
+------------------------------------------+
```

### Project Create / Edit Modal

- **Status** dropdown: `active` (default) | `paused` | `on_hold` | `deactivated`
- **Default**: `active`
- **Gating**: Non-superadmin users see only statuses they can set based on
  their role/ capability

## Role-Based Access Control

### Who Can Change Status

| Role | Can Activate | Can Pause | Can Hold | Can Deactivate | Can Complete | Can Cancel | Can Archive | Can Delete |
|------|------------|-----------|----------|----------------|--------------|------------|-------------|------------|
| **superadmin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **orgadmin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **pm** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **project_admin** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **architect/senior_architect** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **designer/consultant** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **client/vendor/sub_contractor** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Who Can View Status

All authenticated members can view project status. Role-based **action visibility**
is as above.

## Migration 193 — Already Applied Live

The status CHECK extension is **already live** via migration **193**
`scripts/supabase/193_project_lifecycle.sql`. The CHECK now admits:

```
active | paused | on_hold | deactivated | completed | cancelled
```

**No new migration needed** — the enum is already in the live database.

## Index

Index **`idx_projects_org_status`** already exists (created by migration 193):
```sql
CREATE INDEX IF NOT EXISTS idx_projects_org_status ON public.projects(org_id, status)
WHERE archived_at IS NULL;
```

## Reactivation Flow

1. **Initiate**: User with proper capability clicks `Reactivate` on a
   `paused`/`on_hold`/`deactivated` project
2. **Confirm**: Modal confirms reactivation — project returns to `active` state
3. **Execute**: `projects.status` set to `active`, `archived_at` cleared (if was
   previously archived)
4. **Notify**: Org members notified of reactivation (optional)
5. **Audit**: Audit log entry created (`project_status_changed`)

## Archive Flow

1. **Initiate**: Superadmin clicks `Archive` on a `completed`/`cancelled` project
2. **Confirm**: Modal confirms — project hard-hides from active lists
3. **Execute**: `archived_at` set to `now()`, `status` kept (or set to `archived`)
4. **Free quota**: Project no longer counts toward org quota (per migration 35/97)
5. **Notify**: Org members notified of archival
5. **Audit**: Audit log entry created (`project_archived`)

## Delete Flow (Superadmin Only)

1. **Initiate**: Superadmin clicks `Delete` on any project
2. **Confirm**: Final confirmation — "This cannot be undone"
3. **Execute**: 
   - `projects.status` set to `deleted`
   - `projects.archived_at` set to `now()`
   - All related `project_members` rows soft-deleted (`removed_at = now()`)
   - Related `invoices`, `payments`, `ra_bills` marked `archived`
   - Related `drawings`, `ffe_entries`, `statutory_approvals` marked `archived`
4. **Permanent**: Data retained in DB but excluded from all active queries
5. **Audit**: Audit log entry created (`project_deleted`)

## Notes / Design Decisions

- **`on_hold` vs `paused`**: `on_hold` is typically used by org-level admin to
  temporarily remove a project from view; `paused` is project-level work stoppage.
  Both are non-terminal and reactivate to `active`.
- **`completed`/`cancelled` are terminal** but can be "undone" via archive/restore
  flow — they are not deleted, just hidden.
- **Superadmin-only gates**: Archive and delete are superadmin-only actions;
  frontend `project:delete` capability prevents non-superadmin access.
- **Quota impact**: Archived projects free the quota slot (`organizations quota
  count` only counts `archived_at IS NULL` projects — per migrations 35/97).
- **Audit trail**: All status changes, archives, and deletes create audit log
  entries for compliance and rollback.

## Verification

- ✅ Migration 193 applied live — status CHECK extended
- ✅ Index `idx_projects_org_status` present
- ✅ Role-based access documented (table above)
- ✅ UI patterns documented (badge colors, action buttons)
- ⬜ Tests to add: `tests/project/lifecycle.test.ts` (15 test cases)
- ⬜ Frontend components to implement (status badges + action buttons)

---
*Document generated from migration 193 + role matrix.*
*Last reviewed: 2026-08-14*
*Maintainer: Site-Tracker-Pro Project Team*