# SiteTrack Pro — V5 Construction-Depth + CRM-Depth Plan

Status: PLAN (2026-08-07) · Owner: Product Owner (human) · Method: agentic looping
(Deep Dive → Plan → Build → Verify per sub-task; phase after phase; then Test loop; then Live push)

## 1. Why this, now

All six V4 research gaps (A CRM, B Interior, C Consultancy-audit, D Risk, E Design-workflow, F Branding) are shipped, verified, and **live** (`prod` @ `9a7e4c6`, https://sitetrackpro.in → 200).

The **largest market segment — Construction — never got a v4 depth phase.** The V4 plan §3 named only CRM/interior/consultancy/AI/white-label/design-workflow as gaps; construction's core (site_ops, people, procurement, compliance) predates v4 and is thin versus the market's expectations (Powerplay/RDash/Onsite feature set). This phase closes those construction gaps end-to-end, then closes the two open CRM follow-ups, then runs the full testing loop and live push.

**Scope rule:** code-only (no new infra, no paid APIs). DPR-PDF WhatsApp send is env-key-gated (real when `WHATSAPP_PERMANENT_TOKEN` present, mock otherwise — Sprint 2 pattern). Next migration number: **167**.

## 2. Method — Agentic Looping (applies to EVERY sub-task)

```
for each phase:  for each sub-task:
  1. Deep Dive — read tabs-config, queries, RLS, capabilities, plan caps, i18n, tests; document the seam
  2. Plan      — write change list (files to add/edit, migration no., caps, gates, test cases)
  3. Build     — implement
  4. Verify    — npm run lint · npx tsc --noEmit · npm run build · vitest run (targeted) · npm run smoke
  5. Commit    — tiny, revertable commit (one per sub-task)
```

Then: **phase done → next phase.** After all phases: full re-check → test loop → live DB apply → `prod` push → live 200.

## 3. Phase G — Construction Segment Depth (migrations 167–169)

### G1 — Material Request → PO → GRN → Inventory (ST-018)
| Item | Scope |
|---|---|
| Migration **167** `167_material_requests_grn.sql` | `material_requests` (project_id, item, qty≥1, unit, need_date, status `requested→approved→ordered→received`, requested_by, approved_by, po_id FK nullable) + indexes + RLS (read=member, insert=member, approve=managers via `has_project_role` + identity set, delete=managers) + grants. GRN auto-post: trigger on `po_receipts` insert → inserts `inventory_transactions` inward row (item qty from the linked receipt / PO line). |
| `src/app/queries/materialRequestQueries.ts` | `MaterialRequest` type + CRUD (`listRequests`, `createRequest`, `setRequestStatus`, `attachPo`, `deleteRequest`) + pure helpers `REQUEST_NEXT`, `requestTotals`. |
| `src/app/queries/financeQueries.ts` | `createPO` accepts optional `materialRequestId`; `PurchaseOrder` gains `requestId/requestItem`. |
| UI | MaterialsTab gains **Material Requests** section (create → approve → order → link PO); POsTab create form "from request" chip + list. |
| Tests | `tests/app/g1MaterialRequests.test.ts` (status ladder, requestTotals, GRN-to-ledger mapping, attach PO mapper, error surfaces). |
| Smoke | +2 markers. |

### G2 — Checklist inspections + corrective actions on construction (ST-009)
### G3 — Shift roster + overtime + wages + EPF/ESI (Labour & Attendance)
### G4 — DPR PDF export (90-day plan Day 19)
### G5 — Generic register CSV exports (ST-014)

> Detailed tables for G2–G5 are captured in the chat plan (and will be expanded in AGENTS.md under Work State as each ships). G2: migration 168 construction_quality.sql (inspection kinds + `corrective_actions` table, result→action auto-open). G3: migration 169 (shift_roster + wages + EPF/ESI on labour register, overtime on attendance). G4: `src/app/services/dprPdf.ts` (jsPDF) + Download-PDF on DPRDetailView + env-gated WhatsApp attach. G5: `src/app/exportCsv.ts` (`toCsv`/`downloadCsv`) + export buttons on attendance/labour/materials/safety/inspections/punch.

## 4. Phase H — CRM depth (Phase A follow-ups, no migration)
H1: per-owner pipeline view (ownerId filter, `crmRollup.byOwner`, `setLeadOwner`, CrmView owner select/chips). H2: quotation→agreement auto-conversion (`agreementFromQuotation`, `acceptQuotationAsAgreement`, manager-gated "Accept & create agreement").

## 5. Phase I — Testing loop + live push
I1 full re-check (lint/tsc/build/vitest/smoke green). I2 extend `e2e-mock/role-access.spec.ts` for new gated surfaces. I3 i18n parity (en/hi/te) + parity tests + hardcoded-string grep = 0. I4 `npm run db:apply` (167–169 live) → NOTICE verify → `git push origin prod` → Vercel → live 200 + new-surface sanity.

## 6. Files touched (overview)
- Migrations: `167`, `168`, `169` under `scripts/supabase/`.
- New `src/app/`: `materialRequestQueries.ts`, `qualityQueries.ts`, `shiftQueries.ts`, `dprPdf.ts`, `exportCsv.ts`.
- Edited: `financeQueries.ts`, `crmQueries.ts`, `siteOpsQueries.ts`, tabs (`MaterialsTab`, `POsTab`, `InspectionsTab`, `LabourTab`, `AttendanceTab`, `SafetyTab`, `PunchTab`), `CrmView.tsx`, `DPRDetailView.tsx`, `tabs-config.ts` (if gates change), `src/i18n/{en,hi,te}.json`, `scripts/ci/smoke.mjs`, `e2e-mock/role-access.spec.ts`.
- Tests: ~6 new files + extended suites.
- Docs: this plan + AGENTS.md + `docs/planning/BACKLOG.md` (mark ST-018/009/014 done).

## 7. Open decisions (defaults unless you object)
- Construction depth first (largest market); CRM depth a short second phase.
- GRN auto-post is a trigger on `po_receipts` (single source of truth for inward movement).
- DPR-PDF WhatsApp attach env-key-gated, not blocking.
- Exports use CSV + jsPDF patterns; no new framework.
- Subdomain/white-label stays deferred (V4 F0).
- `external_inspectors`/`sub_contractors` orphaned tables surfaced in G2 only if cheap; else documented gap.

## Appendix — G2–G5 detail
*(expanded inline when each phase ships in the build loop; kept terse here to stay current)*