# Supabase Migration Scripts

These SQL files implement the schema described in `docs/archive/BACKEND_PLAN.md`. Tech Lead approval is required before running on any production project.

## Run order

```sh
# 1. Provision a Supabase project (free tier is fine for B1).
# 2. Open SQL Editor → New query → paste each file in order:
01_schema.sql      -- tables, indexes, FK constraints
02_rls.sql         -- RLS policies + activity_log SECURITY DEFINER
04_rls_tests.sql   -- 18-assertion verification matrix across all 4 roles
# Coming in follow-up commits:
# 03_storage.sql   -- bucket creation + signed-URL policies
# 05_seed_demo.sql -- minimal demo data for the dev project
```

After `04_rls_tests.sql` runs you should see ~18 `PASS` notices in the Supabase SQL Editor output. Any `WARNING ... FAIL` means an RLS regression — do not promote that build past Phase B2.

## Pre-flight checks

- `auth.users` table exists (Supabase Auth must be enabled).
- The `gen_random_uuid()` extension is enabled by default on Supabase.
- The `btree_gist` extension is required for the `exclude using btree` constraint on `drawings`. Run once:

  ```sql
  create extension if not exists btree_gist;
  ```

## Schema matches the frontend

These tables intentionally mirror the `INIT_*` mock data shapes in `src/main.tsx` so the eventual frontend migration is mostly state-management plumbing, not data remodeling:

| Frontend `INIT_*` | SQL table |
| --- | --- |
| `INIT_PROJECTS` | `projects` |
| `INIT_MILESTONES` | `milestones` |
| `INIT_UPDATES` | `site_updates` |
| `INIT_ISSUES` | `issues` |
| `INIT_DRAWINGS` | `drawings` |
| `INIT_MATERIALS` | `materials` |
| `INIT_LEDGER` | `inventory_transactions` |
| `INIT_BOQ` | `boq_items` |
| `INIT_VENDORS` | `vendors` |
| `INIT_POS` | `purchase_orders` |
| `INIT_INVOICES` | `invoices` |
| `INIT_RA` | `ra_bills` |
| `INIT_LABOUR` | `labour_register` |
| `INIT_ACTIVITY` | `activity_log` |

## RLS verification

After running `02_rls.sql`, manually test with 4 different demo users (one per role) and confirm:

| Role | Expected behavior |
| --- | --- |
| Architect | Sees every project in their org; can write everywhere. |
| PM | Sees only assigned projects; can write updates/issues/BOQ/inventory/POs/labour; cannot create projects. |
| Contractor | Sees only assigned projects; can write updates/issues/inventory/RA bills; cannot see invoices or labour. |
| Client | Sees only projects where `client_email = their auth email`; can only SELECT; never sees POs, RA bills, labour, or non-current/non-released drawings. |

A scripted version is queued as `04_rls_tests.sql`.

## Rollback

Each migration is additive. To revert, drop in reverse order:

```sql
drop table if exists attachments cascade;
drop table if exists activity_log cascade;
-- ... etc ...
drop function if exists log_activity cascade;
drop function if exists user_project_ids cascade;
drop function if exists current_email cascade;
drop function if exists current_role_text cascade;
```

## Backups

Supabase Pro tier auto-backups daily (7-day retention). Enable PITR before paid pilot. Run a restore drill on a staging project at least once before the first customer.
