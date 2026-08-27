# Sprint 2 DPR Foundation — Research File

> Tracking doc for the Sprint 2 DPR (Daily Progress Report) foundation work executed via the SiteTrack Pro AI agent team. Deep-dive findings + agent execution plan + live execution log.

---

## 1. Foundation Summary (scaffolds, libs, EFs, i18n)

- **Frontend DPR surface is REAL and fully wired**: compose → voice → photo → preview → submit → history → detail → retry. All RBAC-gated (`dpr:submit` / `dpr:view`).
- **Backend provider calls are STUBS** (the "non-real" part end-to-end):
  - `voice_transcribe` EF — `transcribeBhashini` / `transcribeAws` are shells; only `mock` works.
  - `whatsapp_dpr_send` EF — `sendViaMetaCloudApi` is a dry-run stub (`SITETRACK_DRY_RUN`); real Meta call not wired.
  - `buildnow_anchor` EF — `fetchViaApi` / `fetchViaScrape` shells; only `mock` works.
  - `promoter_digest_cron` EF — shell-only.
- **Real Meta client exists** in `supabase/functions/whatsapp-send/index.ts` but is NOT reused by `whatsapp_dpr_send` (TODO references a never-created `_shared/whatsapp_client.ts`).

## 2. DPR Views — Built vs Missing

| View | Status | Missing |
|------|--------|---------|
| `DPRComposer.tsx` | Real | i18n wiring (hardcoded English); no projectId collection; mock transcript in practice |
| `VoiceNoteRecorder.tsx` | Real | i18n wiring (fully hardcoded) |
| `PhotoGeotagCapture.tsx` | Real | no component render test |
| `DPRHistoryView.tsx` | Real | i18n; pagination; filter UI |
| `DPRDetailView.tsx` | Real | i18n; delivery-log detail display |
| `BuildNowBadge.tsx` | Real + i18n'd | — |
| `DPRStatusBadge.tsx` | Real + i18n'd | — |
| `VoiceConfidenceBar.tsx` | **Dead code** | never imported by any view |
| Offline banner | Inline in DPRComposer | not a standalone component |

## 3. Client Library API Surface

- **`src/lib/voiceTranscribe.ts`** — `SUPPORTED_LANGUAGES`, `ALL_PROVIDERS`, `FULL_PROVIDER_ORDER=['bhashini','aws','mock']`, `pickProviderOrder`, `hashAudio`, `mockTranscribe`, `transcribe(audio,{lang,provider,env,transport,efClient})`, `meetsAccuracyBar`.
- **`src/lib/buildnowAnchor.ts`** — `generateBadgeUrl`, `canonicalizeDprPayload`, `computeAnchorHash`, `pickAcquisitionPath` (api→scrape→mock), `mockFetchProjectMetadata`, `fetchProjectMetadata`, `badgeStateFor`.
- **Offline** — `src/lib/offlineQueue.ts` (IndexedDB `sitetrack-offline-v1`; `enqueue`, `drain`, `queueDepth`, `clearAll`, `makeMemoryAdapter`/`makeIndexedDbAdapter`); `src/lib/offline.ts` (blob store + localStorage `queueOpAdd`/`drain`, `isOnline`, `onConnectivityChange`); `src/lib/dprOfflineSync.ts` (`drainDprQueue`, `useOfflineSync`).
- **Geotag** — `src/features/dpr/PhotoGeotagCapture.tsx` (EXIF → device GPS → Hyderabad bbox) + `src/lib/photoStorage.ts` (`extractExif`, `validateGeotag`, `uploadPhoto`).

## 4. Edge Functions — Wired vs Stubs

| EF | Class | Notes |
|----|-------|-------|
| `whatsapp-send` | **LIVE** | Only real Meta client (template+text), rate limit, `whatsapp_log` |
| `voice_transcribe` | PARTIAL | cache-first real; bhashini/aws shells; mock real |
| `whatsapp_dpr_send` | PARTIAL | idempotency/retry/quota real; Meta send stub |
| `buildnow_anchor` | PARTIAL | hash/upsert real; api/scrape stubs; mock real |
| `anchor-digest` | PARTIAL | live w/ signer dep |
| `promoter_digest_cron` | SHELL | renderer real; send stub |
| cashfree-*, notify-deliver, register/signup/review, invite/create_org, refresh_dau, remove_member, send-staff-invite | LIVE | — |
| tg/mh/ka-rera-submit, gstn-einvoice | STUB/PARTIAL | RERA scrapers stub; GSTN mocks |

## 5. i18n String Inventory

- `dpr.composer.*`, `dpr.status.*`, `dpr.errors.*`, `voice.*`, `buildnow.*`, `common.*` all present + translated in hi/te.
- **BUT** `DPRComposer`, `VoiceNoteRecorder`, `DPRHistoryView`, `DPRDetailView` hardcode English despite the keys existing.
- Badge components use `tDpr(lang, key)` from `src/lib/i18nDpr.ts` (lang-param translator, untyped keys).
- Parity test (`tests/i18n/i18n.test.ts`) covers only 12 namespaces — **`dpr`/`voice`/`buildnow` NOT enforced**.

## 6. Test Coverage

- **Covered**: dprDraft (13), dprQueries (7), dprSubmit (20), offlineQueue (16), voiceTranscribe (31), buildnowAnchor (28), BuildNowBadge (15), DPRStatusBadge (10), voiceConfidenceBar (20), efAuthWiring (5), photoStorage geotag subset.
- **Missing**: EF internals (voice cache/retry/idempotency/quota), DPRComposer render/submit, VoiceNoteRecorder, PhotoGeotagCapture component, DPRDetailView/HistoryView unit tests, i18n parity for `dpr`/`voice`/`buildnow`.

---

## 7. Priority 1 Execution Plan (5 UI components + backend + tests)

| # | Work item | Agent | Files |
|---|-----------|-------|-------|
| 1 | Research file (this doc) | team-lead/documentation | `docs/SPRINT_2_DPR_RESEARCH.md` |
| 2 | `_shared/whatsapp_client.ts` (extract real Meta client) + wire `whatsapp_dpr_send` to reuse it | backend-engineer | `supabase/functions/_shared/whatsapp_client.ts` (new), `supabase/functions/whatsapp_dpr_send/index.ts`, `supabase/functions/whatsapp-send/index.ts` |
| 3 | UI #1 `OfflineQueueBanner` standalone component | frontend-engineer | `src/features/dpr/OfflineQueueBanner.tsx` (new), `DPRComposer.tsx` |
| 4 | UI #2 `VoiceNoteRecorder` i18n | frontend-engineer | `VoiceNoteRecorder.tsx` + 3 locale JSONs |
| 5 | UI #3 `DPRComposer` i18n | frontend-engineer | `DPRComposer.tsx` + 3 locale JSONs |
| 6 | UI #4 `DPRDetailView` i18n | frontend-engineer | `DPRDetailView.tsx` + 3 locale JSONs |
| 7 | UI #5 `DPRHistoryView` i18n | frontend-engineer | `DPRHistoryView.tsx` + 3 locale JSONs |
| 8 | Tests: i18n parity `dpr`/`voice`/`buildnow` + DPR component tests | qa-test | `tests/i18n/i18n.test.ts`, new test files |
| 9 | Verify gate | v4-verify | — |
| 10 | Deploy (push prod, verify 200, ff main) | v4-deploy | — |

**Dependency chain**: Banner → VoiceRecorder → Composer → DetailView → HistoryView. EF `whatsapp_client.ts` is independent. Bhashini/BuildNow real integrations stay **blocked on founder-provided API keys** (no code change needed; documented in `.env.example`).

## 8. Agent Prompts (how each agent was invoked)

- **frontend-engineer**: "Implement approved UI in React/Vite using design-system tokens (`.bg-card`, `.text-fg-secondary`, `.border-border` — never raw palette classes), `useT`/`tDpr` i18n, plugin catalog for routes. Gate work with lint/tsc/build/smoke/unit."
- **backend-engineer**: "Design/harden Supabase schema, RLS, RPCs, storage. Idempotent migrations (IF NOT EXISTS guards). Don't regress the 28 benign pre-existing db:apply failures."
- **v4-verify**: "Run gate-by-gate: lint → tsc → build → smoke (233) → vitest (~114 files / ~1454 tests). Fix only what a failing gate points at; report pass/fail."
- **v4-deploy**: "Confirm clean tree, `npm run test` green, push prod, watch CI + Vercel, curl 200, ff main."

## 9. Failure Handling Protocol

| Failure | Detection | Fix |
|---------|-----------|-----|
| Lint error | v4-verify #1 | fix at file:line; re-run |
| TS error | v4-verify #2 | fix types; re-run |
| Build error | v4-verify #3 | fix import/route; ignore benign INEFFECTIVE_DYNAMIC_IMPORT |
| Smoke fail | v4-verify #4 | update `scripts/ci/smoke.mjs` markers |
| Test fail | v4-verify #5 | fix code or test; re-run file |
| i18n parity | parity test | add missing hi/te keys |
| EF runtime | manual test:ef | env var names must match `.env.example`; auth() wired |

---

## 10. Execution Log

| Step | Date | Result |
|------|------|--------|
| Research + plan | 2026-08-06 | 5 explore deep-dives complete; Priority 1 plan drafted (this doc) |
| Backend: shared Meta client | 2026-08-06 | `supabase/functions/_shared/whatsapp_client.ts` created; `whatsapp-send` refactored to reuse it; `whatsapp_dpr_send` stub `sendViaMetaCloudApi` replaced with real body-composition + `sendWhatsAppMessage` call. Retry/short-circuit + dry-run unchanged. |
| UI #1: OfflineQueueBanner | 2026-08-06 | Extracted inline composer banner → standalone `src/features/dpr/OfflineQueueBanner.tsx` (props `queued`/`draining`, `useT()`, renders null when 0). |
| UI #2–5: i18n-wire views | 2026-08-06 | `VoiceNoteRecorder` (10 strings + 3 error msgs), `DPRComposer` (title/subtitle/steps/labels/badges/buttons/success-card), `DPRHistoryView` (title/summary/sort/empty/details), `DPRDetailView` (section heads/back link/attempts/retry — plus `retryOk` boolean replacing brittle `startsWith("Send ok")` variant). All via `useT()`. |
| i18n keys | 2026-08-06 | Added `dpr.offline.*`, `dpr.recorder.*`, `dpr.history.*`, `dpr.detail.*` + 19 new `dpr.composer.*` keys to `en/hi/te.json`; `voice.language.*` labels now drive the composer language `<select>`. |
| Tests | 2026-08-06 | `tests/i18n/i18n.test.ts` parity extended to `dpr`/`voice`/`buildnow` (flat) + deep-key parity for `dpr.*`; new `tests/dpr/offlineQueueBanner.test.tsx` (4 render cases). |
| Verify gate | 2026-08-06 | lint ✓ · tsc --noEmit ✓ · build ✓ (8.8s) · vitest 118 files / 1502 tests ✓ · smoke 233 ✓. |
| Deploy | 2026-08-06 | (pending) commit on `prod` → push → verify 200 → ff `main`. |
