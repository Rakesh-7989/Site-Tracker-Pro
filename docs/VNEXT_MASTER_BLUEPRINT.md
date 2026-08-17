# VNext 1.0 — Master Blueprint (One Platform, Multiple Industry Modules)

*Authoritative strategy doc. Status: baseline committed + deployed live (`91c46cd`, 2026-08-17).*
*Companion: `AGENTIC_LOOPING_METHODOLOGY.md` (execution loop), `docs/END_TO_END_PLAN.md` (phase ledger).*

## 1. Why this blueprint

SiteTrack Pro already ships a **segment substrate** (C0: `organizations.segment`,
construction/architecture/interior/consultancy) and a **module system** (Phase 1–3:
11 modules + plugin registry + per-industry templates + `ModuleGate`). What it does
**not** yet have — despite past claims — are the **shared engines** that make new
industry workflows cheap to add, and the **industry engines** that make each segment
feel complete. Verified against the committed repo (2026-08-17): no `workflow_engine`,
no `form_engine`, no durable event `outbox` (only an in-memory `eventBus.ts`), no
domain boundary map. This blueprint closes that gap and then executes the
segment-depth roadmap.

### Current-state audit (committed, 2026-08-17)
| Area | Status | Evidence |
|------|--------|----------|
| Segment substrate (C0) | ✅ shipped | `organizations.segment` (mig 134), `segmentConfig.ts`, segment-gated nav/tabs |
| Module system (Ph1–3) | ✅ shipped | `src/modules/`, `src/plugins/`, `ModuleGate`, 12 module ids (mig 155/161/182/206) |
| RBAC (legacy) | ✅ shipped | `capabilities.ts`, `permissions-matrix.ts`, role resolver |
| **RBAC V2** | ✅ shipped | `src/auth/rbac2/`, migrations 203–205, `RbacView`, applied live |
| **Spatial hierarchy** | ✅ shipped | migration 206 (sites→buildings→spatial_floors→zones→rooms), `src/features/space/`, applied live |
| Workflow engine | ❌ absent | no `workflow_engine` anywhere |
| Form engine | ❌ absent | no `form_engine` anywhere |
| Event outbox | ❌ absent | only in-memory `src/lib/eventBus.ts` |
| Domain boundary map | ❌ absent | no doc/registry of module↔engine↔domain boundaries |

## 2. Blueprint story

> A construction firm signs up and picks **Construction**. A design studio picks
> **Architecture**. An interior firm picks **Interior**. A consultancy picks
> **Consultancy**. Each gets a tailored product — not a shared app with toggles off.
> Every workflow (submission, approval, inspection, review, purchase, handover) runs
> on the **same workflow engine**. Every form (checklist, timesheet, RA bill, NOC)
> renders from the **same form engine**. Every event that matters (approved,
> rejected, delivered, missed-sla) is published to the **same outbox** and lands in
> the right inbox, notification, or integration. Industry depth is built once per
> segment on those shared rails.

## 3. Blueprint pillars (VNEXT-001 … 005)

| Id | Pillar | One-liner | Gap today |
|----|--------|-----------|-----------|
| VNEXT-001 | **Workflow engine** | Define approval/review/state-machine flows declaratively; run them consistently across every register (RA bill, purchase order, corrective action, statutory NOC, drawing review). | None — each tab hand-rolls its own `NEXT` ladder + RLS gate |
| VNEXT-002 | **Form engine** | Schema-driven forms (fields, validation, layout) so checklists, inspections, timesheets, quotations render from one engine. | None — every form is bespoke JSX |
| VNEXT-003 | **Event outbox + delivery** | Durable `outbox` table (transactional insert alongside the write) feeding inboxes, notifications, Digests, WhatsApp/email (B4), webhooks. | `eventBus.ts` is in-memory only; notifications are ad-hoc `send_org_notification` |
| VNEXT-004 | **Domain boundary map** | One registry documenting module→engine→table→capability→RLS boundaries so new modules slot in without cross-wiring. | Absent; module ownership is scattered across tabs-config, catalog, nav-config |
| VNEXT-005 | **Spatial engine** | Site/Building/Floor/Zone/Room hierarchy as the cross-industry location context (field ops, attendance, DPR, AR overlay, utilisation). | Migration 206 + `src/features/space/` shipped but mostly dead code (SiteNavigator has zero consumers) |

## 4. Industry engines (per segment, on shared rails)

| Segment | Industry engines to build on VNEXT-001/002/003 |
|---------|------------------------------------------------|
| **Construction** | Material request→PO→GRN (✅ G1), quality corrective actions (✅ G2), shift/overtime/EPF-ESI (✅ G3) — extend the workflow engine onto these ladders |
| **Architecture** | Drawing register (✅ D1), design workflow (✅ PhE), diff overlay (✅ D2) — formalize as workflow-engine definitions |
| **Interior** | FF&E schedule (✅ D3), mood boards/rooms (Phase B), procurement quotes (✅ D5) — convert to form-engine + workflow defs |
| **Consultancy** | Fee phases + time (✅ C1), retainer/hourly billing (✅ C2), utilization (✅ C1.7), audits/reports (C1–C3) — reuse the same engines |
| **AI layer (future)** | Forecast/risk analytics (✅ shipped), voice DPR transcription (B4), BuildNow — consume outbox events for training/scores |

## 5. Execution phases

Per the agentic loop (`AGENTIC_LOOPING_METHODOLOGY.md`): each sub-task runs
Deep Dive → Plan → Build → Verify → Commit; between phases, run the full gate
suite (tsc, eslint, vitest, build, smoke, e2e-mock) and push live at phase close.

### P1 — Shared engines (the rails)
| Sub | Scope | Verify |
|-----|-------|--------|
| P1.1 | `workflow_engine` — migration (definitions + instances + transition log tables, RLS), `src/app/workflowEngine.ts` (pure: `nextStates`, `canTransition`, `transit`), declare-first register (e.g. material_requests, corrective_actions, statutory) | unit tests + live-apply + one register migrated |
| P1.2 | `form_engine` — schema-driven field renderer (`src/components/ui/SchemaForm.tsx`) + validation; convert one checklist (inspection_checklists) | unit tests + tsc/build green |
| P1.3 | `event_outbox` — migration (`outbox` table, `publish()` RPC, delivery worker EF or cron), wire to inboxes + notifications; replace ad-hoc broadcast call sites | unit tests + live-apply + probe row |
| P1.4 | `spatial engine` wiring — make `SiteNavigator`/`useLocationContext` real consumers (field ops, DPR geotag, attendance); delete dead code | unit tests + live-apply |
| P1.5 | `domain boundary map` — `docs/DOMAIN_BOUNDARY_MAP.md` + a `src/app/domainMap.ts` registry + catalog test locking module↔route↔engine parity | doc + test green |

### P2 — Industry engines (on the rails)
| Sub | Scope |
|-----|-------|
| P2.1 | Re-express 3 existing ladders as workflow-engine definitions (material request, corrective action, statutory NOC) |
| P2.2 | Convert 2 existing forms to the form engine (inspection checklist, procurement quote) |
| P2.3 | Publish 3 real events through the outbox (invoice generated, quote accepted, corrective action opened) into inboxes/Digest |
| P2.4 | Spatial-aware attendance + DPR location context (per VNEXT-005) |

### P3 — Testing loop + release
- Full gate suite on every P2 sub-task; fix pre-existing `role-access.spec.ts` mock-e2e gaps; final `db:apply` + `git push origin prod` + live 200 verification.

## 6. Definition of done (per sub-task)
1. Migration (if any) written with idempotent guards + applied live + verified via pg.
2. Pure logic in `src/app/` or `src/lib/` with unit tests.
3. UI wired through existing gating (capability + plan + module + segment), no raw palette classes.
4. Full gate suite green (tsc 0 · eslint 0 err · vitest green · build clean · smoke ≥398 · e2e-mock 11/11).
5. Commit to `main`, fast-forward `prod`, push, live 200.

## 7. Out of scope (this blueprint pass)
- White-label subdomains, native mobile, real WhatsApp/Twilio delivery (blocked on provider keys), DWG/DXF/SKP preview, blockchain anchors, payment gateway depth.

## 8. Master execution plan (segments → engines)

### 8.1 Segment story map
| Segment | Who | Core job | Already live | Blueprint adds |
|---------|-----|----------|--------------|----------------|
| Construction | Builder/GC/PM | Site ops, procurement, labour, compliance | Material→PO→GRN (G1), quality CA (G2), shift/OT/EPF-ESI (G3), DPR | Workflow engine on all ladders; spatial-attendance; outbox→Digest |
| Architecture | Design studio | Drawing register, design workflow, FF&E, statutory | Drawings (D1/D2), design workflow (PhE), FF&E (D3), statutory (D4) | Form-engine checklists; workflow defs; outbox→client approvals |
| Interior | Interior firm | FF&E, mood boards, rooms, procurement | FF&E (D3), mood boards/rooms (Phase B), quotes (D5) | Form engine; spatial zones/rooms; outbox→vendor notifications |
| Consultancy | Consultant/design firm | Fee phases, time, billing, utilization, audits | C1–C3 (phases/time/billing/utilization), audits/reports | Workflow on review rounds; outbox→invoice alerts |
| Multiple | Cross-segment org | Mix of the above per project | Segment picker + all modules | Shared engines unify it |

### 8.2 Phased agentic loop
```
PHASE 0   Baseline (done): commit RBAC V2 + spatial + fixes (91c46cd), deploy live
PHASE P1  Shared engines: P1.1 workflow → P1.2 form → P1.3 outbox → P1.4 spatial → P1.5 boundary map
          each: Deep Dive → Plan → Build → Verify (full gate) → Commit; phase-close live push
PHASE P2  Industry engines on rails: P2.1 ladders-as-defs → P2.2 forms-as-schema → P2.3 outbox events → P2.4 spatial-aware ops
PHASE P3  Testing loop (incl. role-access e2e fixes) → final db:apply → push prod → live 200
```

### 8.3 Sequence & effort
| Step | Effort | Depends on |
|------|--------|------------|
| P1.1 workflow_engine | M | — |
| P1.2 form_engine | M | P1.1 (schema shapes) |
| P1.3 event_outbox | M | P1.1 (events at transitions) |
| P1.4 spatial wiring | S–M | 206 live (done) |
| P1.5 domain map | S | all of P1 (documents what exists) |
| P2.1–P2.4 | M each | P1.x rails |
| P3 testing/release | M | P2.4 |

Total ≈ 8–10 focused sub-tasks; each lands as its own commit + unit tests, with live pushes at P1 close and P2 close.