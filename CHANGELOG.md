# SiteTrack Pro Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning will start when the first paid pilot ships.

## [Unreleased]

### Session 30.4 — Sprint Coach subagent (founder field-work guide)

The 90-day v3 plan has a clean split: code work that this AI builds + field
work that only the founder can do (interviews, in-person meetings, LinkedIn /
WhatsApp outreach, pilot signature pursuit, CREDAI presence). Session 30.4
ships a Claude Code subagent that operationalizes the field-work track.

- `.claude/agents/sprint-coach.md` — Claude Code subagent definition with
  frontmatter (name: sprint-coach, description, tools: Read/Glob/Grep/
  Edit/Write, model: sonnet). System prompt establishes persona as an
  experienced India-B2B-SaaS coach who reads the Sprint 1+2 docs literally
  and gives doc-cited next-action recommendations. Six pre-baked playbooks
  (daily check-in, pre-meeting prep, post-interview capture, draft DM,
  warm-intro next step, gate scoring, Telugu translation). Hard boundaries
  (no fabricated outcomes, no forbidden positioning claims, no code work,
  no commitments on founder's behalf, no skipping the doc read).
- `.agents/sitetrack-pro/founder-sprint-coach.md` — team charter following
  the existing agent-team pattern (team-lead, product-manager, etc).
  Mission, responsibilities, boundaries, knowledge sources, routing.
  Registered in `.agents/sitetrack-pro/README.md`.
- `docs/planning/SPRINT_COACH_GUIDE.md` — founder-facing usage guide. How to invoke,
  8 common asks with sample outputs (Today emi cheyali / pre-meeting prep
  / post-interview capture / draft LinkedIn DM / Telugu translation / gate
  score / warm-intro step / Bhashini API application). Doc → action mapping
  table. Sample week-1 conversation flow. Founder rule of thumb: coach
  reads docs + updates logs + drafts messages + scores progress; coach
  does NOT do the work. Routes code asks to the engineering agents.

Sample invocation in Claude Code:
  > Use the sprint-coach agent. Today emi cheyali?
  → Coach reads SITETRACK_V3_PLAN.md, identifies Sprint Day, returns
    3 concrete actions with time-budgets, citing the relevant playbook
    section per action.

Sample log update:
  > sprint-coach: Interview chesa — Ramesh from Sumadhura. RERA Powerplay
    lo direct ga ledhu. Telugu voice ledhu. Blockchain — 'what's that'.
  → Coach confirms ("Capture cheyamantarra?"), then appends a row to
    INTERVIEW_LOG_2026-06.md + flips 3 rows in VERIFIED_GAPS_MATRIX.md
    from UNVERIFIED to VERIFIED-ABSENT / VERIFIED-PRESENT with the
    interview as source. Suggests 4-hour WhatsApp follow-up template.

### Session 30.3 — Sprint 2 Day 16 foundation (DPR + voice + BuildNow)

`docs/architecture/SPRINT_2_ARCHITECTURE.md` — decision log + interface contracts +
day-by-day founder/code split + risks. Lays out what's buildable now vs
what waits for customer signal.

3 SQL migrations (applied to prod via scripts/db/apply-only.mjs):
- `50_dpr_delivery_log.sql` — dpr_messages (client_token idempotency
  key, voice/photo/geotag/buildnow_anchor columns, 6-state lifecycle)
  + dpr_delivery_log (per-attempt audit) + dpr_delivery_slo_window
  RPC.
- `51_voice_transcripts.sql` — cache keyed by audio_sha256;
  attempts_count telemetry; record_voice_cache_hit + voice_transcripts_stats
  RPCs.
- `52_buildnow_anchors.sql` — daily snapshots PK (project_id,
  sync_date); buildnow_latest_for_project + buildnow_stale_anchors
  helper RPCs; raw_payload jsonb.

3 libs (browser + Deno compatible, mock-adapter-tested):
- `src/lib/voiceTranscribe.js` — pickProviderOrder, hashAudio
  (SubtleCrypto sha256), mock transcribe with te/hi/en canned
  responses, public entry that hits EF, meetsAccuracyBar at 0.85.
- `src/lib/offlineQueue.js` — IndexedDB queue for basement-parking
  2G. enqueue/drain/queueDepth/clearAll. Exponential backoff (1s/4s/
  16s/64s/256s, max 5 retries). 7-day stale-failed GC.
  makeMemoryAdapter for tests + makeIndexedDbAdapter for runtime.
- `src/lib/buildnowAnchor.js` — 3-way invariant pattern (browser +
  EF + Sprint 4 handover packet use the same canonicalize + sha256
  algorithm). generateBadgeUrl, canonicalizeDprPayload (sort + drop
  volatile fields + round lat/lon to 6 decimals), computeAnchorHash,
  pickAcquisitionPath (api > scrape > mock), mockFetcher, badgeStateFor
  (5-state machine with custom staleHours threshold).

3 i18n string tables (DPR-specific keys):
- `src/i18n/en.json` (source of truth)
- `src/i18n/te.json` (Telangana dialect, English loan words preserved
  for technical terms — matches docs/sales/TELUGU_PHRASE_BANK_DPR.md
  register)
- `src/i18n/hi.json` (Hyderabadi-Hindi register)

3 Edge Function shells with idempotency contracts:
- `_shared/retry.ts` — exponential backoff with shouldRetry hook
  (don't retry validation/auth errors).
- `whatsapp_dpr_send/index.ts` — UPSERT dpr_messages by client_token,
  3-attempt Meta Cloud API retry, per-attempt dpr_delivery_log row,
  idempotent re-call returns cached terminal status. SITETRACK_DRY_RUN
  env for testing without WHATSAPP token.
- `voice_transcribe/index.ts` — cache lookup → provider chain →
  cache write. Provider implementations are explicit stubs returning
  structured "not implemented" until Sprint 2 mid-cycle wiring.
- `buildnow_anchor/index.ts` — same canonical-hash algorithm as the
  lib. api/scrape/mock paths. Upserts buildnow_anchors per-day.

Tests (72 new across 3 files, total 660 from 588):
- tests/voiceTranscribe.test.js (24 tests)
- tests/offlineQueue.test.js (17 tests)
- tests/buildnowAnchor.test.js (31 tests)

docs/sales/PILOT_ONBOARDING_RUNBOOK.md — minute-by-minute 90-min
on-site activation script. Pre-activation checklist, 6 timed segments
(arrival → product walkthrough → first project → supervisor setup →
promoter setup → commit + handoff), post-activation 4-hour follow-up,
Day 1-7 daily supervisor WhatsApp check-in template (in Telugu),
8 contingency scenarios, Day 14 success rubric, Day 30 outcome matrix.

UI views intentionally NOT in this commit (DPRComposerView,
VoiceNoteRecorder, PhotoGeotagCapture, DPRDetailView, BuildNowBadge)
— they wait for Sprint 1 pilot interview feedback (Day 18+) so they
get baked with real customer signal, not founder hypothesis. Per
Mistake #1 in docs/archive/SITETRACK_V3_PLAN.md.

### Session 30.2 — Sprint 1 Day 1+2: Feature Freeze + Hyderabad-First wedge

End of Session 30.1 we shipped polished cloud auth. Session 30.2 starts
the 90-day v3 plan (see `docs/archive/SITETRACK_V3_PLAN.md`). Sprint 1's bet:
freeze build, sell one workflow, sign 1+ Hyderabad marquee builder before
Day 90. Day 1 = repo work. Day 2 = founder field prep docs.

**Day 1 — Feature freeze guardrail + Hyderabad pivot (code)**
- `src/lib/featureFlags.js` — new module. `STUB_VIEWS` Set with 16
  view ids that are stubs or have broken persistence per audit (RERA
  TG/KA/MH mocks, GSTN mock-IRN, admin surfaces missing from TABLE_BY_KEY
  map). `isStubView()`, `isStubTab()`, `isStaffUser()` (checks
  `user.is_staff` + role==superadmin + VITE_STAFF_EMAILS allowlist),
  `isViewStubBlocked()`, `isTabStubBlocked()`. Composable atom.
- `scripts/supabase/49_feature_flags_freeze.sql` — audit table
  `staff_only_features` seeded with the same 16 view ids + freeze
  reasons. `is_staff` column on profiles. `list_staff_only_features()`
  RPC for smoke-test parity check. RLS: read open, write superadmin-only.
- `src/features/dpr/index.jsx` — new placeholder `DailyProgressView`.
  Hero + 3 feature cards (Telugu voice / Photo+geotag / WhatsApp digest)
  + Sprint 2 honesty banner + pilot-interest capture form (persists to
  localStorage `sitetrack_dpr_interest`).
- `src/App.jsx` — `effectiveView` calc gated by `isViewStubBlocked`;
  added `case "dpr"` route.
- `src/lib/permissions.js` — `canOpenView` allows `dpr` universally
  (matches `help` pattern).
- `src/features/shell/index.jsx` — Sidebar gets `dpr` nav entry; filter
  chain extended with `stubBlocked` + `UNIVERSAL_NAV` Set.

**Day 1 — Repositioning + pricing fix + sales playbook (docs)**
- `docs/planning/FEATURE_FREEZE.md` — the charter. Why 16 views are gated,
  who counts as staff, un-freeze procedure (both JS and SQL flip in
  same commit), Day 90 fewer-than-3 target.
- `docs/business/POSITIONING.md` — canonical positioning. One-line pitch
  ("Hyderabad-first construction record-keeper that runs over
  WhatsApp in Telugu, anchored to BuildNow Telangana"). ICP, 5 proof
  points, 8 forbidden claims (don't say until verified).
- `docs/business/PRICING.md` — **REPRICED**. Old INR 999/2,999/7,999 monthly
  tiers retired (anchored to falsified per-user Powerplay assumption).
  New annual per-org tiers: Pilot INR 29,999 (first 5 only) → Pro
  INR 49,999 (-30% vs Powerplay) → Business INR 89,999 (-25%) →
  Enterprise INR 2,49,999+. Old tiers preserved at bottom for audit.
- `docs/business/PILOT_AGREEMENT_v1.md` — 10-section design-partner contract.
  Pilot tier INR 29,999/yr + 18% GST, 24-month lock, 3-month micro-
  segment exclusivity, 90-min founder on-site activation, data
  ownership + portability, SLOs only for production-ready features.
- `docs/business/COMPETITOR_COMPARISON_V2.md` — prepended Sprint 1 freeze
  notice. Every unverified BEAT verdict (RERA, GSTN, blockchain,
  kiosks, vernacular) downgraded to UNVERIFIED until interview data.
- `docs/research/POWERPLAY_RECON_SCRIPT.md` — 10-interview script.
  Group A (5 ex-Powerplay) + Group B (5 named Hyderabad targets: My
  Home, Aparna, Sumadhura, Vasavi, Lansum + 8 stretch alternates).
  6 questions each, decision rules, Sprint 1->2 unlock gate.
- `docs/research/INTERVIEW_LOG_2026-06.md` + `VERIFIED_GAPS_MATRIX.md`
  — log tables + per-interview capture template + Powerplay-product
  claim matrix (11 currently UNVERIFIED, conversion rules need 2/5
  consistent quotes to flip).
- `docs/sales/DESIGN_PARTNER_DECK.md` — 9-slide pitch markdown source
  with per-slide founder beat sheet + 6 retired-slide explanations
  (AI-powered, 30x-cheaper-than-Procore, multi-state RERA, etc).
- `docs/sales/DEMO_SCRIPT_DPR.md` — 60-sec Loom beat sheet sent 48h
  before every meeting. Real Rs 8,000 Android, real Telugu voice,
  real basement parking, honest BuildNow Sprint-2 placeholder badge.
- `docs/sales/MEETING_LOG_2026-06.md` — operational log for 5 founder
  meetings. WhatsApp templates (cold reach / pre-meeting / post / maybe
  follow-up). Aggregate stats + Sprint 1->2 gate criteria.
- `docs/archive/SITETRACK_V3_PLAN.md` — synthesized v3 plan (388 lines).
  7 sections covering top-10 mistakes ranked critical-low, market
  reality, 3 architecture paths + chosen (Hyderabad-First), 90-day
  6-sprint plan with file-level deliverables, success metrics, open
  questions. Co-authored from deep-research workflow + 3-lens audit +
  diagnose + judge-panel design + synthesize.

**Day 2 — Loom shoot prep + LinkedIn recon prep (docs)**
- `docs/sales/LOOM_SHOOT_CHECKLIST.md` — printable equipment, location,
  timeline. Realme C53 / Redmi A2+ for talent. Banjara Hills 06:30 AM.
  Lighting + audio + tripod + 4 contingencies.
- `docs/sales/TELUGU_PHRASE_BANK_DPR.md` — exact Telugu (TS dialect) +
  English glosses + pronunciation hints + Hindi-mix fallbacks. Caption
  spec (Inter Bold 28pt + safety-orange number highlight).
- `docs/sales/LOOM_STORYBOARD.md` — 12-shot storyboard mapping the 60s
  to camera framings + transitions + on-screen text. Capture order +
  ~1h 40min editing budget.
- `docs/sales/LINKEDIN_TARGET_LIST.md` — Group A LinkedIn search recipe
  + Group B (M1-M5) profiles with Indeed-verified facts (My Home:
  Dr. Rao founder, 201-500 employees, 4.2/5; Aparna: ISO 9001+OHSAS
  18001, 4.0/5; Sumadhura: 40+ projects, 4.3/5 culture; Lansum: 4.8/5
  highest accessibility).
- `docs/sales/LINKEDIN_OUTREACH_SEQUENCE.md` — DM templates per
  audience + 3-touch cadence (T1 → T2 +5d → T3 +7d) + reply handling
  for 5 common responses.
- `docs/sales/WARM_INTRO_MAPPING.md` — 6 intro-path ecosystems ranked
  by ROI: CREDAI Telangana (#1, 60% prob), Vasavi walk-in (#2, 50%),
  Lansum founder DM (#3, 40%). Per-builder atlas + failure modes.

### Session 30.1 — E2E spec + friendly error mapping
- `tests/e2e/auth-panel.spec.js` — 14 Playwright tests across cloud-
  mode / local-mode-fallback / responsive. 12 active tests pass, 2
  auto-skip when backend enabled. Verified email validation pill on
  blur/clear, password tab + eye toggle + Forgot password, signup
  panel renders 4 inputs + 3 plan tiles, strength meter Weak→Strong,
  plan-picker aria-pressed flip, email survives mode-switch, mobile
  + tablet responsive layouts.
- `playwright.config.js` — baseURL changed to localhost (Vite default
  bind) so reuseExistingServer works in dev.
- `src/features/shell/index.jsx` — extended friendly() helper to map
  5 more Supabase error patterns: "is invalid" / "unable to validate
  email" (was leaking raw "Email address X is invalid"), "signups not
  allowed", "user not found", "captcha", + sentence-case fallback.

### Session 30 — Production auth panel (demo logins removed)
- `src/features/shell/index.jsx` — full LoginScreen rewrite. Removed
  the 6 demo role tiles (Super Admin / Org Admin / Architect / PM /
  Contractor / Client), "Continue as X" CTA, "Or try a demo role below"
  eyebrow. WORKSPACE DATA load/clear controls moved to local-mode-only
  fallback (never render when backend configured). Cloud-mode panel
  shows ONLY real auth: Sign in / Start a firm tabs, Magic link /
  Password method toggle, OTP fallback for Gmail link-prefetch.
- Auth UX professionalized: email regex validation (blur-triggered),
  password show/hide eye toggle, password strength meter on signup
  (4-bar Weak → Strong), friendly error mapping (15+ Supabase errors
  → plain English), inline alert banners replace flat-status pills,
  resend-email link in sent state, autofocus on mode change, lowercase+
  trim email before submit, Stripe-style "Forgot password" beside
  label. ARIA: role="tab" + aria-selected on tabs, aria-label on
  show/hide button.
- `src/components/ui.jsx` — added Ic atom: mail, eyeOff, info, loader
  (animate-spin), refresh.
- All 320 smoke checks + 556 unit tests pass; lint clean.

### Session 28 — Doc-driven gap closure (audit-found pending items)
Spawned an Explore subagent over every .md file in the repo (docs/, .agents/,
.brain/decisions/) and cross-checked promises against code. Built every
code-buildable gap that didn't require a vendor account / dashboard click.

**3 SQL migrations** (idempotent + tested):
- `31_cashfree_events.sql` — webhook event dedup. Cashfree retries on 5xx
  would otherwise double-credit subscriptions. New `cashfree_events` table
  with `event_id` PK + `record_cashfree_event()` RPC the EF calls instead
  of raw INSERT.
- `32_mb_ra_linkage.sql` — adds the long-promised `ra_bill_id` FK on
  `measurement_book` (was reserved with a comment "FK added in 11" since
  Phase 2). Plus a drift-detection trigger that audits any MB row mutation
  AFTER its parent RA bill is `approved`/`paid`, and a `sum_mb_for_ra()`
  RPC for UI auto-populate.
- `33_feature_flag_rls_extra.sql` — belt-and-braces re-enable RLS on the 3
  feature-flag tables, add audit triggers on insert/update/delete of any
  flag change (forwards through `record_audit_v2()`), assert no broad-allow
  policies exist.

**6 new pure-function libs** (118 new tests, all passing):
- `src/lib/drawingDiff.js` (30 tests) — viewport math for synchronized two-
  layer drawing comparison: pan-zoom-about-focal-point, fitToViewport, layer
  builder, canDiff guard, blend opacities, pixel-diff math. Closes the
  Procore-demo gap at the lib layer.
- `src/lib/aiFeatureRecommender.js` (17 tests) — usage-driven feature
  toggle recommendations. Suggests "disable" for zero-touch ON flags,
  "celebrate" for loved features, "upgrade" for plan-gated features that
  show engagement. Multi-language narrate() in en/te/hi.
- `src/lib/contractorMigration.js` (19 tests) — Powerplay / BuildSupply /
  Falconbrick CSV importer. Auto-detects vendor by header shape, normalizes
  to canonical columns, validates Aadhaar / GSTIN / numeric fields, returns
  per-row errors without aborting the import. `toCanonicalBatches()` shapes
  payload for direct Supabase upserts.
- `src/lib/reraKarnataka.js` (15 tests) — K-RERA adapter scaffold with
  9-stage code map, validateKaRera regex, mock + real adapters.
- `src/lib/reraMaharashtra.js` (13 tests) — MahaRERA quarterly filing
  adapter (different shape from TG / KA — quarterly not per-stage).
- `src/lib/gstn.js` (24 tests) — E-Invoice IRP payload builder per NIC
  schema v1.1. validateGstin / validateHsn / B2B/B2C/SEZWP support, CGST/SGST
  computation, mock + real adapters.

**4 new Edge Functions**:
- `supabase/functions/notify-deliver/index.ts` — push/email/SMS delivery.
  Reads user profile preferences, channels via Resend (email) + Twilio
  (SMS) + external relay (web push). Idempotent on `delivered_at`.
- `supabase/functions/gstn-einvoice/index.ts` — IRN generation. Calls
  configured GSP (NIC/ClearTax) or mock when `GSTN_USE_MOCK=true`.
- `supabase/functions/ka-rera-submit/index.ts` — K-RERA stage filing.
  Gated by `KA_RERA_SCRAPER_ENABLED`.
- `supabase/functions/mh-rera-submit/index.ts` — MahaRERA quarterly filing.
  Gated by `MH_RERA_SCRAPER_ENABLED`.

**1 new UI**:
- `src/features/vendor/index.jsx` (`VendorPortal`) — 4-tab vendor portal
  (Dashboard / POs with accept/decline / Materials / Messages). Closes the
  v2 "vendor role exists but view doesn't" gap. Lazy-loaded; route
  `case "vendor-dashboard"` added in App.jsx.

**Stale doc updates**:
- `docs/architecture/ROLE_MODEL_V2.md` header flipped from "specification deferred" → "✅ IMPLEMENTED".
- `docs/business/COMPETITOR_COMPARISON_V2.md` flipped 8 ❌ MISSED rows to ✅ CLOSED
  (BOQ import, drawing-diff, GSTN, KA/MH RERA, AI recommender, Solidity
  contract, PDF audit, bulk user CSV).
- `docs/architecture/ARCHITECTURE.md` Sentry "Planned Phase 2" → "✅ Shipped Session 27.4".

Validation: 556/556 unit tests (438 → 556 = +118) · 320 smoke · 0 lint errors.

### Session 27.4 — Polygon contract + WhatsApp EF + Sentry + diagrams
- **`contracts/AuditAnchor.sol`** — 60-line Solidity contract matching the JS lib's hard-coded `0xeecdf927` selector. Anchors daily Merkle root via `anchor(bytes32)`; emits `Anchored(root, ts, by)`. Owner-gated, no admin escape hatch, zero deps. Three deploy paths documented (Remix / Foundry / Hardhat). Cost: ~₹25-40/year on Polygon mainnet.
- **`supabase/functions/anchor-digest/index.ts`** — daily cron EF. SELECTs yesterday's `audit_log_v2`, computes Merkle root, sends signed tx via configurable signer service, polls receipt, upserts `audit_anchors`. Idempotent. Dry-run mode for testing.
- **`supabase/functions/whatsapp-send/index.ts`** — Meta Cloud API client EF. Template + free-form text sends, per-org rate limiting (10/min default), full HMAC-verified status webhook. Backed by new `whatsapp_log` table (`30_whatsapp_log.sql`).
- **`src/lib/sentry.js` + wiring** — gated, lazy-loaded Sentry init. No-op without `VITE_SENTRY_DSN` (demo + tests unaffected). PII scrubber redacts Aadhaar/PAN/GSTIN patterns + sensitive keys. `ErrorBoundary.componentDidCatch` forwards. +15 unit tests.
- **8 sequence diagrams** (`docs/architecture/sequence/`): magic-link login, Cashfree subscribe + webhook, Polygon anchor, offline sync, RERA submit, WhatsApp DPR, drawing supersede, audit record.
- **4 state-machine diagrams** (`docs/architecture/state/`): RA Bill lifecycle, Drawing revision chain, Subscription transitions, Project archive→restore→purge.

### Session 27.3 — Deploy driver + expanded env scaffold
- **`scripts/deploy/deploy-all.mjs`** — interactive 11-step driver covering every step from `.env.local` seed through final live probe. Idempotent. Auto-skips finished steps via probes.
- **`.env.example` expanded** 16→74 lines covering Cashfree, RERA TG, WhatsApp Cloud API, Polygon, AI providers, and `SUPABASE_DB_URL` for psql migration runner.
- **`npm run deploy:all`** wired in package.json.
- **gh CLI installed** via winget — enables `gh auth login --scopes workflow,repo` for future CI enablement.

### Session 27.2 — GitHub Actions CI (attempted)
- Identified that pushing `.github/workflows/*` requires a PAT with the `workflow` OAuth scope, which the current token lacks. The CI YAML continues to live at `docs/workflows/CI_WORKFLOW.yml` until the token is upgraded OR the workflow is pasted via the GitHub web UI.

### Session 27.1 — 4 SQL bugs in phase 2 migrations
- **`24_feature_flags.sql:21`** — referenced non-existent `admin_users` table. Retargeted FK to `profiles(id)`.
- **`20_workforce.sql:51-53`** — `coalesce()` in UNIQUE constraint is invalid syntax. Replaced with 2 partial UNIQUE INDEXes.
- **`15_forecast.sql:30`** — `numeric(4,2)` overflows at 100. Widened to `numeric(5,2)`.
- **`23_branding.sql:23`** — `UNIQUE (org_id, project_id)` with nullable column allows duplicate org-defaults. Split into 2 partial UNIQUE INDEXes.

### Session 27 — Architecture + ER + 20 phase-2 migrations
- **`docs/architecture/ARCHITECTURE.md` (1,100 lines)** — master technical reference (System / App / Product / Mobile / End-to-End layers).
- **`docs/architecture/DATA_MODEL_ER.md` (1,143 lines)** — two-plane data model with `organizations.id` bridge + cross-plane audit spine.
- **ER diagrams** — 3 Mermaid ER diagrams (overview / saas / tenant) rendered to PNG.
- **20 phase-2 migrations** (`09-28`) covering hierarchy / measurement_book / material_prices / delegations / daily_snapshots / compliance / forecast / process tables / handover tables / checklists / comms / workforce / field_ops / estimate / branding / feature_flags / billing_telemetry / share_tokens + RPC / audit_anchors + view / plans + 4 seeded plans. Each idempotent, RLS-enabled, indexed, with sanity `raise notice`.
- **`29_phase2_tests.sql`** — assertion harness for every expected table + RLS-enabled flag + immutability check on 5 append-only tables.
- **`eslint.config.js`** extended to Node-glob `docs/**/*.mjs`.

### Session 26 — 90-day day-by-day execution plan
- **`docs/planning/EXECUTION_PLAN_90_DAYS.md` (850 lines)** — Pre-flight + 5-phase plan covering Day-3 to Day 90. Risk register, ₹85k budget, KPI checkpoints, Path A vs B decision tree.

### Session 24 — Adversarial review + 7 real bugs caught + audit gaps
- **CRITICAL bug — wrong Polygon function selector.** `blockchainAnchor.polygonAdapter` hard-coded selector `0xf73e54d4` for `anchor(bytes32)` — verified via real `keccak256` and it was wrong. Correct value is `0xeecdf927`. Any anchoring against a deployed contract would have called a function that doesn't exist (gas wasted, no event emitted). Fixed + added `opts.selector` override for callers whose contract uses a different function name. Tests updated.
- **Audit-trail gaps on destructive actions.** LabourTab.del removed PII silently; RABills MB row delete had no audit; BOQ + Ledger deletes only logged activity, not audit. All four wired with `recordAudit DELETE` capturing full before-state (amount, scope, EPF, etc.) plus confirm dialog before each delete.
- **Wiring gaps from v2 Phase B-E.** 12 new roles existed in PERMS but were unreachable via demo login (`MOCK_USERS` only had v1 6 roles). Wired all 12 + new `vendor` role into MOCK_USERS. Expanded `canUseQuickCapture` from 5 v1 roles to include v2 construction roles. Added `architectSeniority()` + `ARCHITECT_SENIORITIES` so the sheet's "Senior/Junior Architect" split is solved by a profile field, not duplicate roles.
- **Vendor login role.** Sheet showed vendors as logged-in users, not just records. Added `vendor` role with nav `[dashboard, po, messages, notifications, material-prices]` and minimal tabs (vendor portal renders own UI). +1 PERMS test.
- **Project type chip missing from ProjectsView cards.** Users opened an Interior project, saw fewer tabs, had no way to know WHY. Added a colour-chipped type label on every project card. Made `CreateView` ask for project type FIRST (2x2 grid of clickable cards).
- **Cashfree EF CORS too open** (`Access-Control-Allow-Origin: *`). Now an explicit allow-list from `CORS_ALLOWED_ORIGINS` env var. Echoes only the matched origin + `Vary: Origin`. Refactored `json()` calls to `respond()` factory that bakes in per-request CORS headers.
- **RERA Telangana adapter referenced a non-existent Edge Function.** Built `supabase/functions/tg-rera-submit/` stub with `GET /status` + `POST /submit` endpoints, behind `TG_RERA_SCRAPER_ENABLED=true` env gate.
- **E2E test for v2 type-gate.** Playwright spec opens Heritage Mall (now `type: "interior"`) and asserts BOQ + RA Bills + Labour tabs are HIDDEN.

### Session 23 — v2 role model (Phases A-E from ROLE_MODEL_V2.md)
- **`projects.type` column** — every project declares Construction / Interior / Design / Consultant. SQL migration `06_project_types.sql` additive + idempotent.
- **12 new roles** in PERMS (`project_admin`, `prospector`, `project_head`, `mep_consultant`, `site_engineer`, `civil_engineer`, `site_inspector`, `interior_designer`, `design_architect_interior`, `designer`, `consultant`, `sub_contractor`) + SQL migration `07_role_expansion.sql`. Role groupings exported. +9 PERMS tests (54 total).
- **`src/lib/projectTypes.js`** — TYPE_TABS / TYPE_TEAM_TEMPLATES / TYPE_BOQ_PRESETS + 3-layer gate composer. DetailView now applies role + flag + type gates together. 29 tests.
- **`src/lib/contractors.js`** — sub-contractor CRUD, vendor links (idempotent), past-contract archive, reputation score. 22 tests.
- **`docs/architecture/ROLE_MODEL_V2.md`** — full spec captured from the hand-drawn architecture sheet.

### Session 22 — Major changes pack
- Cashfree Edge Functions (subscription + webhook) — real UPI AutoPay billing ready to deploy.
- `src/lib/blockchainAnchor.js` (33 tests) — Polygon-ready audit anchoring; unique vs every Indian competitor.
- AI Insights v2 — Telugu / Hindi narrative via LANG_INSTRUCTIONS table.
- `docs/setup/PLAY_STORE_PREP.md` — 8-phase Android submission runbook.
- `src/lib/reraTelangana.js` (26 tests) — TG RERA filing scaffold with mock + real adapters.

### Session 21 — Bug hunt before major changes
- White-screen fix: Session 18 onboarding useEffect violated Rules of Hooks (placed after early return).
- `pos` typo in ProjectPOTab.approve → silent crash on click.
- `useMemo` used without import in `shell/index.jsx`.
- `useMemo` abused as setState side-effect in OnboardingWizardView.
- Defensive try/catch around `migrateLocalToBackend` localStorage parse.
- Added top-level `ErrorBoundary` so a single broken chunk can never blank the page again.

### Sessions 17-20 — Production gate + onboarding + MCP toolkit
- `docs/setup/CONNECT_SUPABASE.md` + `npm run check:supabase` 9-step readiness check.
- Live "DB Live / Local mode" pill in topbar with 30s re-probe.
- Org Admin onboarding wizard (5 steps, auto-redirects first-time orgadmins).
- Public landing page (`archive/marketing/landing.html` + `archive/marketing/index.html` self-contained deploy).
- 3-minute demo video script (Telugu narration).
- 12-slide investor pitch deck (pptxgenjs builder).
- Case study template + WhatsApp Business 8-week verification runbook.
- HRMS deployment study (actual repo analysis) + DEPLOY_NOW.md unified runbook.
- `scripts/ci/setup.mjs` (`npm run setup`) — HRMS-style bootstrap.
- MCP toolkit: `.mcp.json`, `.env.mcp.example`, `npm run check:mcp`, `docs/integrations/MCP_TOOLKIT.md`.

### Sessions 13-16 — Org Admin tier + Cashfree + 37-feature toggle catalog
- `orgadmin` role with 9 Org Admin panels.
- Pure-function libs: approvalChains.js, orgIntegrations.js, templates.js, orgFeatureFlags.js (106 combined tests).
- Cashfree pure lib (24 tests).
- Supabase RLS Phase 1 (additive migration + immutable audit_log_v2 + record_audit_v2 SECURITY DEFINER RPC).
- 3-layer feature flag cascade (platform → org → default + plan gate) — 37 toggleable features.

### Fixed — Tech Lead code review pass (5 findings)
- **HIGH-1 (XSS / injection in exports)**: User-supplied strings (project name, location, description, issue title, update notes, expense description, weather, supplier, etc.) were interpolated directly into the HTML built by `exportPDF` + `buildDPR`, and into the CSV produced by `exportCSV`. Added `src/lib/escape.js` (`escapeHtml`/`h`, `escapeCsv`, `csvRow`) with formula-injection defusing for cells starting with `=`, `+`, `-`, `@`, tab, CR. Every user-string interpolation in `exportPDF` and `buildDPR` is now wrapped in `h()`. Photo `src` attributes are gated to `data:` / `https:` only via a `safePhotoSrc` helper. `exportCSV` now uses `csvRow()` which RFC-4180-quotes commas/quotes/newlines.
- **HIGH-2 (cross-project notification leak)**: `ClientPortal`, `NotifsView`, and `PMView` all called `notifs.filter(n => !n.read)` against the global notifications array — so any unread notification was visible regardless of which project/org it belonged to. Added `src/lib/notifications.js` with `notifsForUser(notifs, user, projects)`: clients see only notifications with `pid` matching a project where `client_email === user.email`; non-client roles see notifications with no `pid` (global system messages) plus those for projects they can see. The top-bar bell-badge count also routes through this filter.
- **MED-3 (localStorage quota for attachments)**: Files were read as base64 dataURLs and stored directly in localStorage. A 20MB photo became ~26MB base64 and silently blew past the 5-10MB origin quota. Reworked `readAttachment` to write the binary to IndexedDB (`putBlob`) under a generated `idbKey`, then store only the key + metadata in the attachment row. New `AttachmentRow` component lazy-loads the URL via `getBlob(idbKey)` on mount. Removing an attachment now also calls `delBlob` to avoid orphaned blobs. Falls back to inline `dataUrl` if IndexedDB is unavailable (very old browsers, private-mode Safari).
- **MED-4 (smoke tests cover only string markers)**: Added 44 new Vitest behavior tests across 3 new files: `tests/escape.test.js` (16 tests — XSS regression cases, formula injection, CSV quoting), `tests/notifications.test.js` (11 tests — Tech Lead HIGH-2 regression matrix, super-admin breadth, non-mutation guarantee), `tests/format.test.js` (17 tests — fmtDate/Time/Cur/fileKind/fmtSize edge cases). Vitest total: 36 → 80 cases.
- **LOW-5 (App.jsx is one giant file)**: First safe extracts begun. Pure helpers moved out: `fmtDate`, `fmtTime`, `fmtCur`, `fileKind`, `fmtSize` → `src/lib/format.js`. Notifications filter → `src/lib/notifications.js`. HTML/CSV escapers → `src/lib/escape.js`. `App.jsx` keeps the same exports as before via local aliases — zero behavioural change, but the modules are now individually testable and reusable. Further extracts (INIT_* mock data → `src/data/`, components → `src/views/`) queued.

### Added — Live activation (Supabase real backend + realtime + more admin features)
- **`src/lib/usePersistent.js`**: drop-in `useLS` replacement that auto-routes to Supabase when `VITE_BACKEND=supabase`, falls back to localStorage. First paint reads from cache for instant load; remote refresh happens async; writes debounced 500ms; offline writes go to queue.
- **`src/lib/supabase.js` upgrade**: `saveKey()` now actually upserts to mapped tables in batches of 100. `subscribeTable(table, onInsert)` opens a Postgres-changes channel for realtime. `migrateLocalToBackend()` walks the full localStorage blob and upserts row-by-row.
- **Real magic-link auth** in `LoginScreen`: when `VITE_BACKEND=supabase`, the login screen shows an email input that triggers `signInWithMagicLink`. Demo role tiles still appear below.
- **Session restore at mount**: `getCurrentUser()` runs on cold load and hydrates the user state from the `profiles` row.
- **Realtime subscriptions**: `subscribeTable("activity_log")`, `subscribeTable("messages")`, `subscribeTable("issues")` mounted at app level. New rows push live into the in-memory state. High-severity issues fire a `Notification`.
- **localStorage → Supabase migration** button in Admin → System Settings panel with summary feedback (keys migrated, rows migrated).
- **`AuditAdminView`** (Admin → Audit Log): cross-tenant activity stream with org/user/type/date-range filters and CSV export.
- **Impersonation** ("View as" button in Users tab → super admin assumes target user's role and view, persistent yellow banner with "Stop & return to admin").
- **`UsageAdminView`** (Admin → Usage Analytics): DAU/WAU/MAU + feature adoption bars + per-org engagement health with traffic-light dots.
- **`SupportAdminView`** (Admin → Support Inbox): cross-tenant ticket inbox with reply UI, status (open/replied/closed). 4 seeded mock tickets from sample orgs.
- **`docs/setup/GOLIVE.md`**: 30-minute step-by-step runbook (Supabase provisioning → schema → env vars → Vercel deploy → smoke → first customer invite). Cost projection for first 12 months.
- **`scripts/deploy/provision.sh`**: one-shot local bootstrap (tooling check, deps, `.env.local` wizard, optional SDK install, full test pipeline).
- **`@supabase/supabase-js`** added as a regular dependency so the dynamic import resolves at build time (still lazy-loaded at runtime via `BACKEND_MODE` gate).

### Added — Super Admin (Operations) role for multi-tenant coordination
- New 5th role `superadmin` in `src/lib/permissions.js` with admin-only capabilities (manageUsers, manageOrgs, manageBilling, manageSettings, impersonate) and dedicated nav (admin-dashboard, admin-orgs, admin-users, admin-billing, admin-settings).
- `INIT_ORGS` (5 mock customer orgs across Hyderabad/Bangalore/Chennai/Kochi/Pune with mixed Basic/Pro/Business/Trial plans) + `INIT_ADMIN_USERS` (15 mock users across roles) + `PLAN_META` (Basic ₹999, Pro ₹2999, Business ₹7999, Custom).
- Login screen now shows **5 role tiles** including "Super Admin (Operations)" with slate-gold styling that signals operations-grade vs editorial-grade.
- Sidebar splits into **— Operations** (admin-only) and **— Tenant view** (everyone) sections for superadmin.
- 5 new editorial-styled admin views:
  - **SuperAdminDashboard**: MRR hero card, plan distribution bars, recent signups, churn-risk callout (orgs with no activity in 7 days), cross-org activity feed.
  - **OrgsAdminView**: list with plan/MRR/users/projects/status; inline plan change, suspend/activate, "Add Organization" with 15-day trial default.
  - **UsersAdminView**: search + role filter, invite flow, inline role change, deactivate/reactivate, super-admin row is protected from edits.
  - **BillingAdminView**: total MRR + ARR + active/trial/suspended chips, revenue mix by plan with share-of-MRR bars, Razorpay Subscriptions roadmap callout.
  - **SettingsAdminView**: toggle 6 feature flags (drawing markup, AI, DPR auto, WhatsApp, e-sign, offline queue) + integration status panel (Anthropic/OpenAI, Razorpay UPI, Supabase, WhatsApp Business, GitHub Actions CI).
- `scripts/supabase/01_schema.sql`: profiles.role check constraint now includes `superadmin`.
- `scripts/supabase/02_rls.sql`: new `is_superadmin()` helper, `user_project_ids()` unions in all projects for superadmin, new policies on `organizations`, `org_members`, `profiles` (read) for cross-tenant admin access.
- `scripts/supabase/04_rls_tests.sql`: Scenario 6 — 6 assertions verifying super admin sees both Alpha + Beta, can read organizations table, can insert projects.
- `docs/AGENTS.md`: ownership table now defines Super Admin role at the top of the boundaries section.
- `docs/archive/BACKEND_PLAN.md`: schema diagram includes `superadmin` as a role value.
- 10 new vitest cases covering PERMS shape, isSuperAdmin, cross-tenant overrides, admin nav visibility, quick-capture extension.

### Added — Competitive weaknesses pack (closes 9 gaps vs Powerplay/RDash/Procore)
- **Daily Report (DPR) PDF + WhatsApp share** (gap #5): Editorial-styled HTML→PDF auto-built from today's updates/issues/materials/worklogs/attendance/photos. WhatsApp button opens `wa.me` with formatted summary. Closes Powerplay's #1 hook for India market.
- **Measurement Book → RA Bills** (gap #8): Expandable MB grid per RA bill with location, item, qty, unit, rate. Auto-computed amount, drift detection vs bill total, "Set bill = MB total" recomputation. Closes RDash contractor-billing gap.
- **E-signature for change orders** (gap #7): Typed-name + consent-checkbox + timestamp + role + user-agent capture. Signature card renders inline with the change order. Closes CoConstruct gap.
- **Drawing markup viewer** (gap #2): Canvas overlay on image attachments with 4 colors, 3 widths, undo, clear, save. Marked-up image becomes a new attachment with `markup_of` link. Closes PlanGrid/Procore phone-redline gap.
- **Offline-first IndexedDB layer + sync queue** (gap #4): New `src/lib/offline.js` with IDB blob store, sync queue, online/offline event listener. Top bar shows offline pill + pending-op count. Site update writes queue ops when offline. Closes Onsite/Powerplay gap (Phase 1).
- **AI Insights LLM upgrade** (gap #10): New `src/lib/ai.js` with deterministic risk-score engine + Claude/OpenAI integration. Settings panel inside AI tab to paste API key (stays in browser). Editorial narrative summary on demand. Closes Procore Agent Builder direction.
- **Razorpay UPI payment** (gap #6): New `src/lib/razorpay.js` with UPI deep-link builder + Payment Link request payload. Architect configures UPI ID once → every invoice gets a "Pay via UPI" button for clients. Closes Buildertrend/Houzz Pro payment loop.
- **Capacitor native mobile scaffold** (gap #3): `capacitor.config.json` + comprehensive `docs/setup/MOBILE_BUILD.md` with plugin list, app-store flow, known gotchas. Build to iOS/Android with one `npx cap sync`.
- **Supabase persistence switch** (gap #1 prep): `src/lib/supabase.js` with `BACKEND_MODE` env flag, dynamic SDK import (no bundle bloat in demo), table mapping for all `INIT_*` keys. `.env.example` documents activation.
- **ESLint flat config (ESLint 9)** + **Prettier** with `npm run lint`, `lint:fix`, `format`, `format:check` scripts. `npm test` now runs lint first. CI workflow upgraded from placeholder to real lint step.
- **`scripts/supabase/04_rls_tests.sql`** — 18-assertion RLS verification matrix across 4 roles (Architect/PM/Contractor/Client) covering project visibility, drawing released_to rules, financial table isolation, PII access, and write blocking for clients. Tech Lead gate #2 closed.
- **Estimate tab** (feature #18 in 50-feature matrix): generates client-facing quote from BOQ totals with editable markup/overhead/contingency/GST percentages. Versioned per save. Architect/PM edit; Client read-only; Contractor hidden.
- `src/lib/permissions.js` — single source of truth for PERMS + role helpers. App.jsx imports from here so the two cannot drift.
- `scripts/supabase/01_schema.sql` + `02_rls.sql` + `README.md` — runnable Supabase schema and RLS policy templates per Backend Engineer Agent's plan.
- BOQ tab (Bill of Quantities) with code, description, category, unit, qty, rate; category totals + grand total. Architect/PM edit, Client read-only, Contractor hidden.
- Stock Ledger tab with inward/outward/return/wastage transactions; material-wise balance summary; balance turns red when negative. Architect/PM/Contractor edit, Client hidden.
- Photo metadata capture (date/time + opt-in GPS) on site update photos. Geolocation behind a "Tag photos with site location" toggle — no surprise permission popups.
- `CHANGELOG.md` (this file), `docs/archive/BACKEND_PLAN.md`, `docs/workflows/CI_WORKFLOW.yml`, `docs/setup/CI_SETUP.md`.
- GitHub Actions CI workflow as a docs/ template (manual move documented in `docs/setup/CI_SETUP.md` once a `workflow`-scoped token is available).
- Vitest scaffold + 24 unit tests covering PERMS shape, role boundaries, project visibility, view routing, drawing release logic.

### Changed
- `drawingKey({})` now returns `null` instead of `"::"` — blank drawings no longer collide with each other.
- BOQ + Ledger forms now reject negative qty/rate, empty material names, and (for Ledger) future-dated transactions. Outward/wastage transactions that exceed current stock balance are refused.
- BOQ + Ledger delete actions now require a `window.confirm` prompt with the line summary before destructive removal.
- `addDrawing` now requires both title AND type before creating a new revision.
- Smoke test bumped from 35 → 65+ checks; now also verifies that App.jsx imports PERMS from `./lib/permissions.js` and has no local `const PERMS` block.

### Removed
- `_incoming_sitetrack_pro/` legacy version snapshot (Supabase setup notes preserved into `docs/archive/BACKEND_PLAN.md`).
- `sitetrack (1).jsx` (940-line orphan file never imported).
- Inlined PERMS object and helpers in `src/App.jsx` (moved to `src/lib/permissions.js`).

### Fixed
- Geolocation permission popup no longer fires on every photo upload; only when user opts in via the new toggle.
- BOQ/Ledger inputs cannot create unrealistic numbers (>1B) or zero/negative quantities.
- Ledger guards against issuing more material than currently in stock for that material.
- Drawing release no longer risks superseding multiple blank drawings under one collision key.
- Two React Hook violations fixed in `CreateView` and `VendorsView` (early-return before `useState`) — caught by new ESLint rule `react-hooks/rules-of-hooks`.

### Known Issues
- App.jsx remains ~2,200 lines. Refactor into `src/components/`, `src/views/`, `src/data/` queued in BACKLOG.
- CI workflow now lives at `.github/workflows/ci.yml` (the `docs/workflows/CI_WORKFLOW.yml` template was removed once the push token had the `workflow` scope; see `docs/setup/CI_SETUP.md`).
- Supabase migrations have not been run on any real project. `BACKEND_PLAN.md` Phase B1 starts when Tech Lead provisions a dev project.
- No e2e/integration tests yet; Vitest only covers pure permission helpers.

## [0.0.1] — 2026-05-22 (initial repo commit)

Initial Site Tracker Pro snapshot with 20+ construction-domain modules, role-based access (Architect / PM / Contractor / Client), India-ready GST/TDS/EPF/ESI, PWA shell, localStorage demo persistence.
