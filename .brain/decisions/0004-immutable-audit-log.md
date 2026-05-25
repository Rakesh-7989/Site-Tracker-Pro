---
status: active
date: 2026-05-25
deciders: Rakesh, Claude
---

# 0004 — Immutable audit log (append-only, server-ready)

## Context

The existing `activity` feed in App.jsx is per-user, mutable, and
client-side only. It's enough for the in-app notification ribbon but
fails three real needs:

1. **Compliance / dispute resolution** — when a client argues "you never
   sent me Rev B of the drawing", we need an audit row proving the
   release action with a timestamp, actor, and resource id.
2. **Cross-tenant safety review** — super admin needs to see who
   approved / rejected / impersonated across all orgs in one place.
3. **Forensic recovery** — if a row mysteriously disappears, the audit
   log shows when, by whom, with the before/after diff.

## Decision

New `src/lib/audit.js` exposes `recordAudit(currentLog, entry)` that
returns a NEW array (immutable). Caller is required to pass the result
back into `setAuditLog()`. Hard cap of 5,000 rows in localStorage; oldest
dropped beyond that.

Action vocabulary kept stable (used by filter dropdowns):
`CREATE | UPDATE | DELETE | APPROVE | REJECT | RELEASE | UPLOAD | LOGIN |
 IMPERSONATE | EXPORT | PAYMENT | DELEGATE`

Resource vocabulary kept stable too. CSV export uses `escape.js csvRow`
so audit data is safely exportable even with formula-injection attempts.

When Supabase backend lands, the same `recordAudit()` call writes
server-side via Edge Function — no UI change needed.

## Consequences

- ✅ Wired into 6 key flows in App.jsx (Batch 3): project create,
  impersonation start/stop, delegation create/revoke, branding
  org/project update + clear, labour clock-in/out, snapshot freeze.
- ✅ AuditLogV2View provides filter (actor/action/resource/date/q) +
  stats dashboard + CSV export.
- ⚠️ Many other CRUD points still write only to `activity` — wiring
  remaining flows (drawing release, RA approval, RFI, change orders,
  expenses, materials) tracked in BACKLOG as a follow-up batch.
- ⚠️ 5,000-row cap is conservative for high-activity prod tenants; the
  Supabase migration removes this entirely.
