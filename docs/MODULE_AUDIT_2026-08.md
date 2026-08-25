# SiteTrack Pro — Module-by-Module Production Status Audit (Part 3)

> Date: 2026-08-24 · Method: direct code/live-DB inspection of `main` (`90826ba`+).
> This is the "Part 3" codebase audit recommended by the external deep-dive
> (ChatGPT "App Build Deepdive", Aug 2026). Supersedes its Part-2 assumptions:
> several items it listed as open were ALREADY SHIPPED here — each row below is
> verified against current evidence, not the audit's snapshot.
>
> Status legend: 🟢 production-ready · 🟡 needs work (owner noted) · 🔴 missing · ⚪ deferred by product decision

## Scorecard

| Module | Current state | Risk | Status | Action |
|---|---|---|---|---|
| Auth (login/session/MFA/signup rate-limit) | V3 login shell, auto-profile heal, rate limiting, MFA | Low | 🟢 | Maintain |
| RBAC / authorization | RBAC v2 + Policy Core (fail-closed, vendor SoD, multi-org isolation) — Phase 0/1 gates `[x]` | Complexity | 🟢/🟡 | Stabilize v2, NO v3 |
| RLS / cross-tenant isolation | Harnesses: cross-tenant **506/506**, lifecycle 21/21, quota 13/13, teams 52/52, risk 26/26, coverage matrix 150/150, column-drift CI gate | High impact | 🟢 | Continuous tests |
| Offline engine | **CONSOLIDATED 2026-08-24** (`fabdec8`): single canonical IndexedDB engine (`offlineQueue.ts`: status machine, backoff, GC, kind whitelist), legacy blob/localStorage system deleted, TopBar pill reads real depth, 17 engine tests | Medium | 🟢 | Attachment queue next (mobile P1) |
| DPR / field capture | Composer→voice→geotag photo→submit→history→detail→retry + PDF export + delivery log + nightly risk-signal cron (mig 225/226) | Medium | 🟢 | Make mobile-first when Capacitor lands |
| Pricing / plans | Frontend ₹5,999/₹11,999/₹19,999 == migration 94 == `plans` table; trial⇒Pro effective plan; subscriptions read grant fixed (mig 230) | Low | 🟢 | Keep DB canonical |
| Payments ledger immutability | `payments` has UPDATE **and DELETE** policies (mig 160); no version columns | Data loss / dispute | 🟡 | Design optimistic-locking (`expected_version`) + restrict DELETE |
| Versioned concurrency | **mig 238** (2026-08-24): `version`+`updated_at` + trigger-forced monotonic bump on milestones/tasks/issues/invoices/ra_bills/payments; guarded UI writes (task/issue/milestone tabs) surface typed conflicts; harness **39/39** (`test:rls:versions`, CI-wired) | Medium | 🟢 | Extend guard pattern to future native/mobile writers |
| Financial chain invariants | **mig 239** (2026-08-24): payment guard — target existence/same-project + Σpayments ≤ receivable cap (invoice net = amount×(1+gst−tds), RA net = bill×(1−retention)); `chk_ra_paid_range`; harness **18/18** (`test:rls:finance`, CI-wired). Landed while payments table still empty (pre-launch). | Medium | 🟢 | BOQ-vs-RA caps remain a product decision (deliberately not enforced) |
| Approval invariants | SoD approver≠requester enforced server-side (Phase 1.3 `[x]`) | Low | 🟢 | Maintain |
| Audit immutability | Mig **100**: `audit_log_v2`+`activity_log` mutation-proof triggers (GUC escape hatch for DPDP erasure); `download_events` grant-immutable (159) | Low | 🟢 | Maintain |
| SECURITY DEFINER hygiene | Live survey 2026-08-24: 157 definer fns; **6 unpinned ours → fixed mig 237** (`search_path = public, extensions, pg_temp`); extension-owned allowlisted; `check:definer --strict` CI gate added | High→Low | 🟢 | Gate enforces continuously |
| Storage buckets | 7 buckets (deliverables, dpr-media, research-docs, chat-files, +3) — all private, folder-scoped org/project policies via `storage.foldername(name)[1]` pattern | Medium | 🟢 | Verify-in-CI candidate |
| Edge Functions | Shared `_shared/auth.ts` gate + hardened CORS echo; register_org confirm-email fixed (generateLink dispatch); cron secrets via `notify_config` | Medium | 🟢 | Rotate stale secrets when flagged |
| Cross-tenant attack pass | SEC-04 CT-000..005 matrix green (506 assertions) | High impact | 🟢 | Re-run per new table |
| Restore drill | Backup ✅ + JSON export drill ✅ + **dump path proven** (2026-08-25: live public schema dumped 824 KB via standalone pg_dump 17.5 in 12s — see AGENTS.md for tooling). **Restore verification deferred to pre-pilot** (founder decision: no customer data yet; re-run when real data lands). Scratch-target creation needs dashboard (access token is project-scoped, can't create projects). | Disaster recovery | 🟡 deferred | FOUNDER (pre-pilot): create free scratch project → restore dump → row-count/policy verification → record RTO |
| Migration-from-empty replay | Ledger runner exists; old migrations rely on live-state (benign pre-existing fails) | Medium | 🟡 | Scratch-project replay test |
| Tenant deletion / DPDP erasure | `delete_organization` RPC (92/122) + unified lifecycle | Medium | 🟢 | Drill annually |
| Sentry error tracking | `initSentry()` wired in main.tsx; **DSN unset** | Blind spots | 🟡 | FOUNDER: create free sentry.io project, set `VITE_SENTRY_DSN` |
| Uptime monitoring | `scripts/uptime-check.mjs` + nightly live probe + docs ready; **external monitor absent** | Detection delay | 🟡 | FOUNDER: UptimeRobot 2 monitors (10 min) |
| Incident / rollback runbook | `GO_LIVE_RUNBOOK.md` + `?shell=legacy` escape hatch + PR-path rollback proven twice | Medium | 🟡 | Write 1-page incident comms template |
| Alerting | Nightly workflow red-X only | Slow detection | 🟡 | Wire uptime/Sentry → email alert |
| Mobile (Capacitor) | Docs+runbook exist; **no native project/deps** | Product gap | 🔴 | Foundation phase when user gives go (API-36 target day-one) |
| AI layer | ai.ts + intelligenceEngine + intentParser + nightly risk signals (live) | Low | 🟡 | Defer depth until real users (P2) |
| Blockchain/Polygon anchoring | Digest pipeline scaffold only | Low | ⚪ | Deferred by product decision |

## Residual P0 queue (verified 2026-08-24)

**Agent-implementable (needs user go):**
1. ~~Versioned concurrency~~ ✅ mig 238 (2026-08-24)
2. ~~Financial-chain invariant RPC/triggers~~ ✅ mig 239 (2026-08-24) — payment cap/target guards; BOQ-vs-RA caps deliberately left as a product decision
3. Migration-from-empty replay harness (scratch DB)

**Founder actions (minutes each, agent cannot do):**
4. ~~Restore drill~~ → **DEFERRED to pre-pilot** (2026-08-25 founder decision — dump path already proven; full restore+verify when real customer data lands)
5. Sentry DSN — free account → set `VITE_SENTRY_DSN` env
6. UptimeRobot — free account → 2 monitors (frontend + Supabase REST)

**Blocked on product decision:**
7. Capacitor foundation (audit P1) — recommend AFTER founder ops actions above
