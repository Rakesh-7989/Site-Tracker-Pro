# SiteTrack Pro Backend Plan

Owner: Backend Engineer Agent (drafted) + Tech Lead (approver)
Date: 2026-05-22
Status: Draft for review — blocks production SaaS claims (see `BUSINESS_MODEL.md` R-002, `QUALITY.md` R-002)

## Purpose

Move SiteTrack Pro from a single-browser localStorage demo to a real multi-tenant SaaS backend. This document defines the target architecture, schema, security policies, file storage, migration path, and rollout phases. It is a plan, not yet committed code. Backend Engineer Agent drafted this; Tech Lead approval and Product Owner sign-off are required before any production deploy.

## Goals

- Replace browser `localStorage` (`sitetrack_v2`) with server-side persistence.
- Enforce roles (Architect / PM / Contractor / Client) on the server, not just the UI.
- Store drawings, photos, invoices, RA bills, permits, and message attachments in object storage.
- Provide an immutable audit log (currently a frontend "Activity" feed).
- Keep the existing demo path working as a "Try without signup" option.

## Non-Goals (out of scope for v1 backend)

- Native mobile app.
- Real-time collaborative editing (CRDT-style).
- Offline-first sync with conflict resolution (roadmapped; see `BACKLOG.md`).
- Custom AI / ML model training. Rule-based AI Insights stay client-side until data volume justifies it.
- Replacing the React frontend.

## Recommended Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Database + Auth | Supabase (Postgres + Auth + Storage + RLS) | India SME friendly free tier, Postgres native, RLS for role policies, file storage built-in, fastest path from demo to paid pilot. |
| Frontend host | Vercel (already configured) | Existing `vercel.json` works. Zero-config Vite deploy. |
| File storage | Supabase Storage (S3-compatible) | Bundled with auth + RLS, signed URLs for client-safe sharing. |
| Email | Supabase + Resend (or SendGrid) | Magic-link login, drawing-release notifications, weekly reports. |
| Background jobs | Supabase Edge Functions (or Vercel Cron) | Daily report PDF generation, scheduled WhatsApp dispatch. |
| Observability | Supabase logs + Sentry (free tier) | Error tracking, slow query alerts. |

**Why not Firebase?** Firestore NoSQL is awkward for SiteTrack's relational data (project → milestones → tasks; project → drawings with revision FK; project → invoices → milestone). Postgres with RLS keeps the schema explicit.

**Why not a custom Node/Express backend?** Adds ops burden (servers, auth from scratch, file storage glue, RLS reimplementation). Supabase compresses 6-8 weeks of work into days.

## Phase Plan

| Phase | Scope | Outcome | Effort |
| --- | --- | --- | --- |
| B0 | This plan + Tech Lead approval | Decision logged | 1 day |
| B1 | Supabase project + schema + RLS + dev environment | Schema deployed to dev project | 3-4 days |
| B2 | Auth flow (email + magic link + role assignment) | Real login replaces demo role picker | 2-3 days |
| B3 | Project + milestones + updates + issues sync | First module on backend | 4-5 days |
| B4 | Remaining modules (drawings, materials, vendors, POs, invoices, RA bills, labour, safety) | Full module coverage | 7-10 days |
| B5 | File storage (drawings, photos, attachments, message files) | All uploads go to Supabase Storage with signed URLs | 3-4 days |
| B6 | Audit log + notifications + WhatsApp share | Immutable activity trail, server-sent notifications | 3-4 days |
| B7 | Paid pilot hardening: backups, monitoring, rate limits | Production-ready | 3-5 days |

Total: ~4-6 weeks for one engineer.

## Schema (Postgres / Supabase)

The full SQL lives in `/scripts/supabase/01_schema.sql` (to be created in B1). High-level tables and relations:

```
profiles (extends auth.users)
  ├── id (uuid, FK to auth.users)
  ├── name, avatar
  └── role: architect | pm | contractor | client

organizations
  └── slug, name, plan: basic | pro | business | custom

org_members
  ├── org_id, profile_id
  └── role (org-level; overrides profile.role for project assignments)

projects
  ├── org_id (multi-tenant boundary)
  ├── architect_id (FK profiles)
  ├── client_email (used for client project visibility)
  └── name, location, lat, lng, status, progress, budget, dates

project_members
  ├── project_id, profile_id
  └── project_role: architect | pm | contractor | client
  -- Replaces email-only matching for client visibility

milestones, tasks, site_updates, issues, materials, drawings
  └── all FK project_id

drawings
  ├── title, type, revision, status (current | superseded)
  ├── superseded_by (self-FK)
  ├── released_to text[] -- ['pm','client','contractor']
  └── storage_path (Supabase Storage)

attachments (polymorphic)
  ├── entity_type: site_update | issue | drawing | message | invoice | rfi | ...
  ├── entity_id
  ├── storage_path
  ├── original_name, size, mime, kind
  └── geo: { lat, lng, captured_at } -- for photo metadata feature

vendors (org-scoped global)
purchase_orders, invoices, ra_bills, labour_register
boq_items (NEW — see BOQ feature below)
inventory_transactions (NEW — see Inventory ledger feature below)

activity_log (append-only, immutable)
  ├── project_id, type, action, detail
  ├── by_profile_id, by_role
  └── created_at

notifications
  └── user_id, title, message, read, link

messages (per-project chat)
  └── project_id, sender_id, text, created_at
```

### New tables for top-missing features

```sql
-- BOQ (Bill of Quantities)
create table boq_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  code text,                          -- e.g. "1.2.3" hierarchical code
  description text not null,
  unit text,                          -- cum, sqm, kg, nos
  qty numeric(14,3),
  rate numeric(14,2),                 -- per-unit rate INR
  amount numeric(16,2) generated always as (qty * rate) stored,
  category text,                      -- Civil, MEP, Finishing
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Inventory ledger (inward + outward + GRN)
create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  txn_date date default current_date,
  material text not null,
  unit text,
  qty numeric(14,3) not null,         -- positive
  direction text check (direction in ('inward','outward','return','wastage')) not null,
  source text,                        -- supplier name (inward) or location (outward)
  ref_no text,                        -- GRN/DC number
  po_id uuid references purchase_orders(id),
  recorded_by uuid references profiles(id),
  notes text,
  attachments jsonb default '[]',
  created_at timestamptz default now()
);

-- Photo metadata (already on attachments.geo, but indexed for site-photo search)
create index idx_attachments_geo_captured on attachments using btree (captured_at)
  where entity_type = 'site_update';
```

## Row Level Security (RLS) Policies

The core security model — all policies enforce that a user can only see data inside their org and inside their assigned projects (or matching client email).

```sql
-- Helper functions
create or replace function current_profile() returns profiles
  language sql stable as $$ select * from profiles where id = auth.uid() limit 1 $$;

create or replace function current_role_text() returns text
  language sql stable as $$ select role from profiles where id = auth.uid() $$;

create or replace function user_project_ids() returns setof uuid
  language sql stable as $$
    select project_id from project_members where profile_id = auth.uid()
    union
    select id from projects p
      where current_role_text() = 'architect'
        and p.org_id in (select org_id from org_members where profile_id = auth.uid())
    union
    select id from projects p
      where current_role_text() = 'client'
        and p.client_email = (select email from auth.users where id = auth.uid())
  $$;

-- Enable RLS on every business table
alter table projects enable row level security;
alter table milestones enable row level security;
alter table site_updates enable row level security;
alter table issues enable row level security;
alter table materials enable row level security;
alter table drawings enable row level security;
alter table tasks enable row level security;
alter table boq_items enable row level security;
alter table inventory_transactions enable row level security;
alter table invoices enable row level security;
alter table ra_bills enable row level security;
alter table labour_register enable row level security;
alter table purchase_orders enable row level security;
alter table activity_log enable row level security;

-- READ: every project-scoped table follows the same pattern
create policy "read_project_scoped" on projects for select
  using (id in (select user_project_ids()));

create policy "read_project_scoped" on milestones for select
  using (project_id in (select user_project_ids()));

-- ... repeat per table ...

-- WRITE: role-gated
create policy "architect_create_project" on projects for insert
  with check (current_role_text() = 'architect');

create policy "architect_pm_update_milestone" on milestones for update
  using (current_role_text() in ('architect','pm')
         and project_id in (select user_project_ids()));

-- Client never writes business data
create policy "client_no_write_invoice" on invoices for all
  using (current_role_text() != 'client');

-- Drawings: only architect releases; everyone in role can read released current
create policy "architect_manage_drawings" on drawings for all
  using (current_role_text() = 'architect'
         and project_id in (select user_project_ids()));

create policy "read_released_current_drawings" on drawings for select
  using (status = 'current'
         and current_role_text() = any (released_to)
         and project_id in (select user_project_ids()));

-- Activity log: anyone in project can read, only system/trigger writes
create policy "read_activity_log" on activity_log for select
  using (project_id in (select user_project_ids()));

revoke insert, update, delete on activity_log from authenticated;
-- Inserts go through a SECURITY DEFINER function only
```

## File Storage (Supabase Storage)

Three buckets with distinct policies:

| Bucket | Purpose | Visibility | Naming |
| --- | --- | --- | --- |
| `drawings` | Released drawings (PDF/DWG/DXF/RVT) | Private; signed URLs by role | `{project_id}/{drawing_id}/{rev}/{original_name}` |
| `site-photos` | Daily update photos, issue evidence | Private; signed URLs by project membership | `{project_id}/{yyyy}/{mm}/{photo_id}.jpg` |
| `documents` | Invoices, RA bills, permits, RFI attachments | Private; signed URLs by project membership | `{project_id}/{entity_type}/{entity_id}/{file}` |

Storage RLS policies mirror table RLS — a file is readable only if the requesting user has read access to the parent row.

**Photo metadata flow** (feature #7 from MARKET_ANALYSIS):
1. Frontend captures `navigator.geolocation` + `captured_at` (current timestamp from device).
2. On upload, metadata is attached to the row in `attachments.geo` JSONB column.
3. Server-side trigger refuses upload if `captured_at` is more than 7 days in the past (anti-backdating).
4. Reports/exports stamp date+time+lat,lng on each photo card.

## Auth Flow

1. **Sign up**: Architect signs up first (creates org). Adds PM/Contractor/Client by email invite → triggers Supabase invite → invitee sets password → row created in `profiles` with assigned role.
2. **Sign in**: email + password OR email magic link. JWT contains `role` and `org_id` claims.
3. **Client invite**: Architect "shares" a project with a client email → row inserted in `project_members`. Client signing up with that email auto-links to project.
4. **Demo mode**: A "Try Demo" button on login still uses the old localStorage path. No backend calls. Demo data clearly labelled.

## Migration From localStorage

Backwards-compatible plan so existing demos do not break:

1. Add a `BACKEND_MODE` env flag (`VITE_BACKEND=supabase | local`).
2. Wrap `useLS(key, default)` in a higher-level `usePersistent(key, default)` hook that picks the right driver based on the flag + auth state.
3. Ship behind a feature flag — first paid pilot toggles it on. Demo deploy keeps `local`.
4. One-time client-side migration: on first backend login, prompt user to import existing localStorage data (or discard).

## Audit Log

- All writes that change business state insert into `activity_log` via Postgres triggers (so the UI cannot forget to log).
- `activity_log` is append-only (revoke UPDATE/DELETE).
- Frontend Activity view reads from `activity_log` instead of an in-memory array.
- Useful for QC, compliance review, dispute resolution between contractor and client.

## API Surface

Supabase auto-generates a PostgREST API from the schema. No hand-written Express needed.

Edge Functions reserved for:
- `generate-daily-report` — assemble PDF, store in `documents`, return signed URL.
- `whatsapp-share` — push DPR PDF link to a WhatsApp Business webhook.
- `release-drawing` — wraps the drawing release + auto-supersede in a transaction with audit log entry.

## Backups, Rollback, Disaster Recovery

| Item | Plan |
| --- | --- |
| Daily backup | Supabase Pro tier auto-backups daily, retained 7 days. Bump to 30 days before paid pilot. |
| Point-in-time recovery | Enabled (Supabase Pro feature). |
| Storage backup | Cron Edge Function dumps bucket listings + checksums to a secondary bucket weekly. |
| Disaster recovery RTO | 4 hours. |
| Disaster recovery RPO | 1 hour (last backup). |
| Rollback (failed deploy) | Vercel instant rollback to previous build; DB migration via reversible scripts only. |

## Compliance / Sensitive Data

| Concern | Action |
| --- | --- |
| Personal data (workers, Aadhaar, EPF, ESI) | Encrypt at rest (Supabase default). Mask Aadhaar in UI by default; full only on demand with audit log entry. |
| GST/TDS calculations | Keep transparent and editable in UI; do not claim auto-compliance until a chartered accountant reviews. |
| Payment data | Out of scope for v1. Razorpay/UPI integration is a separate decision. |
| Client share links | Always go through Supabase Auth — no public share URLs (current `?share=p1` flow gets retired). |

## Cost Model (Supabase)

| Tier | Cost | Fits |
| --- | --- | --- |
| Free | $0 | First 2-3 paid pilots; up to 500MB DB, 1GB storage, 50K auth users |
| Pro | $25/mo | First production customer; daily backups, PITR, 8GB DB, 100GB storage |
| Team | $599/mo | Multi-org enterprise |

Pricing in `docs/PRICING.md` (Pro plan ₹2,999/mo) covers Supabase Pro for the first 5-10 customers easily.

## Open Questions For Tech Lead

1. **Org boundary**: do we want each builder to be a separate Supabase project (strong isolation, higher cost) or shared with org_id (cheaper, RLS-enforced)? Recommended: shared with strict RLS, fall back to dedicated project only for "Custom" plan customers.
2. **WhatsApp Business**: official API has a verification process (2-3 weeks). Until then, scheduled DPR delivery uses email + a "Share via WhatsApp" button that opens `wa.me/?text=...`.
3. **Search**: Postgres full-text search is enough for v1. Migrate to Typesense/Meilisearch only after one customer hits 50+ projects.
4. **AI Insights**: keep as deterministic rules until 10+ customers generate enough data to train.

## Verification Plan (when implemented)

| Check | Owner | Pass criteria |
| --- | --- | --- |
| RLS policy test matrix | QA + Security agents | Architect/PM/Contractor/Client each get their expected rows and zero unexpected rows on 10 test scenarios. |
| Migration dry-run on real localStorage dump | Backend Engineer | Lossless round-trip of one full demo dataset. |
| File storage signed URL expiry | Security Agent | Expired URL returns 401 within 60s of expiry. |
| Backup restore drill | DevOps Agent | Restore a 24-hour-old backup to a staging project and validate row counts. |
| Cost projection | Product Manager | Project monthly Supabase cost for 1, 5, 20 customers. |

## Decision Log

| Date | Decision | Owner | Status |
| --- | --- | --- | --- |
| 2026-05-22 | Choose Supabase over Firebase for relational fit + RLS | Backend Engineer Agent | Pending Tech Lead approval |
| 2026-05-22 | Keep localStorage demo path alongside backend mode | Backend Engineer Agent | Pending |
| 2026-05-22 | Retire public `?share=p1` URLs in favor of auth-gated client invites | Security Agent | Pending |
| 2026-05-22 | Add BOQ + inventory ledger as first-class tables | Domain Analyst Agent | Pending |
