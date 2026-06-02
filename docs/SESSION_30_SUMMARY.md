# SiteTrack Pro — Session 30 Complete Summary
*From Session 29.3 deploy → Sprint 2 Day 16 foundation + Sprint Coach agent*
*Generated June 2, 2026 · Session 30.4*

This document is the step-by-step record of everything that happened across
sessions 30 → 30.4. Founder reference card — keep open while running Sprint
1+2 field work.

---

## TL;DR

| Metric | Sprint 1 start | Now |
|--------|----------------|-----|
| Repo commits | `e1ac538` (Session 29.3) | `b159ea9` (Session 30.4) — **9 new commits** |
| Unit tests | 556 | **660** (+104) |
| Smoke checks | 320 | **324** (+4) |
| SQL migrations | 48 | **52** (49 + 50 + 51 + 52, all applied to prod) |
| Edge Functions | 8 | **11** (whatsapp_dpr_send + voice_transcribe + buildnow_anchor) |
| Marketing-site falsified claims | 11 | **0** |
| Sprint 1 task list | 73 tasks | **88 tasks** — all completed except founder field-work in Days 3-15 |
| Production URL | `sitetrack-rakesh.vercel.app` | Same, with **VITE_STAFF_EMAILS configured** + freeze gate live |
| Stub views hidden from non-staff | 0 | **16** — see `docs/FEATURE_FREEZE.md` |
| Pricing tiers | ₹999/2,999/7,999 monthly (falsified anchor) | **₹29,999/49,999/89,999/2,49,999+ annual per-org** — verified vs Powerplay |
| Demo Hyderabad Builder org seeded in prod | No | **Yes** (`8eaaa1e7-c4e1-463c-9812-f5e48f5c1587`) |
| Sprint Coach agent for founder field work | No | **Yes** — `.claude/agents/sprint-coach.md` |

---

## Step 1 — Session 30: Production auth panel (demo logins removed)

**Commit**: `9a7b8dc` `feat(auth): Session 30 — production auth panel, demo role login removed`

The starting point was the user asking to fix login + signup auth professionally and PERMANENTLY remove the demo role-tile UI.

| What | File |
|------|------|
| Drop 6 demo role-tile picker cards from LoginScreen | `src/features/shell/index.jsx` |
| Drop "Continue as Architect" CTA + "Or try a demo role below" eyebrow | Same |
| Move WORKSPACE DATA controls to local-mode-only fallback (never render with backend) | Same |
| Add ARIA: role="tab" + aria-selected, aria-label on show/hide button | Same |
| Email regex validation (blur-triggered) | Same |
| Password show/hide eye toggle on sign-in + sign-up | Same |
| Password strength meter on signup (4-bar Weak → Strong) | Same |
| Friendly error mapping (15+ Supabase errors → plain English) | Same |
| Inline alert banners replace flat-status pills | Same |
| Resend-email link in sent state | Same |
| Autofocus on mode change; lowercase+trim email; Stripe-style Forgot password placement | Same |
| Add 6 Ic icons: mail, eyeOff, info, loader (animate-spin), refresh | `src/components/ui.jsx` |

**Validation**: lint 0 errors, smoke 320/320, tests 556/556 → all PASS.

**Deployed** to `https://sitetrack-rakesh.vercel.app`.

---

## Step 2 — Session 30.1: Friendly error mapping + E2E spec

**Commit**: `6e23baa` `test(auth): Session 30.1 — E2E spec + friendly error map for Supabase "is invalid"`

Live cloud auth test surfaced that Supabase's `"Email address X is invalid"` was leaking through raw. Added pattern matching.

| What | File |
|------|------|
| Map "is invalid" / "unable to validate email" → friendly text | `src/features/shell/index.jsx` |
| Map "signups not allowed" / "user not found" / "captcha" → friendly text | Same |
| 14-test Playwright spec across cloud-mode / local-mode-fallback / responsive | `tests/e2e/auth-panel.spec.js` |
| Tests: email validation pill, password tab + eye toggle, Forgot password, signup 4 inputs + 3 plan tiles, strength meter Weak → Strong, plan-picker aria-pressed flip, email survives mode-switch, mobile + tablet layouts | Same |
| playwright.config.js baseURL → `localhost` (was `127.0.0.1`) | `playwright.config.js` |

**Validation**: 12/12 active Playwright tests pass; 2 auto-skip when backend enabled.

---

## Step 3 — Deep research workflow (Hyderabad SaaS landscape)

**Workflow ID**: `wz3yologq` — 109 agents, 2.9M subagent tokens, 624s duration.

Three categories researched in parallel: construction-management SaaS, real-estate proptech, Indian B2B SaaS. Four outputs per category: features+pricing, named adopter companies in Hyderabad, market size+ARR+funding, gaps SiteTrack Pro can exploit.

### Key verified findings (3-0 adversarial)

| Finding | Source |
|---------|--------|
| **Powerplay** = dominant Indian construction-SaaS. $7.14M Series A (Sept 2022, Accel). Pricing: Pro ₹71,999/yr (15-20 users), Pro+ ₹1,19,999/yr (30 users). Features: labour tracking + payables, vendor payables, project management, material tracking, subcontractor, expense tracking, mobile app | SoftwareFinder + getpowerplay.in + Inc42 + Accel investment note |
| **Powerplay March 2026 embedded credit launch in Hyderabad**: 60-day tenor, ₹10L-50L collateral-free, procurement-linked via their marketplace only | Telangana Today + RealtynMore + Content Media Solution |
| **CRITICAL GAP**: Powerplay's public case studies feature ZERO Hyderabad marquee builders (My Home, Aparna, Sumadhura, Vasavi, Lansum, Trendset, Hallmark, Vamsiram) | Direct WebFetch of getpowerplay.in/resources/case-studies/ |
| **Telangana BuildNow portal** (Feb 2025, buildnow.telangana.gov.in) uses blockchain audit trails + WhatsApp-first status updates as core features — direct govt precedent for SiteTrack Pro's two main differentiators | buildnow.telangana.gov.in primary source + KSandK legal analysis |
| **Freshworks FY2025**: $838.8M revenue (+16% YoY), first profitable year $183.7M net income | SEC 10-K filing |
| **Square Yards**: $35M raise 2025 at $935M valuation, ₹2,000 cr IPO planned CY2026 | Entrackr + Inc42 |
| **UNVERIFIED**: Could NOT confirm Powerplay's product LACKS RERA / GSTN / kiosk / blockchain / vernacular UI. Absence from marketing copy is NOT proof of absence in product | Adversarial verification 0-3 on these claims |

---

## Step 4 — SiteTrack v3 plan synthesis

**Commit**: `34d3be1` `docs(plan): SiteTrack Pro v3 — research-backed architecture + 90-day build plan`
**Workflow ID**: `w957hlybp` — 9 agents, 515K tokens, 917s

Multi-phase orchestrated workflow:

1. **Audit** (3 parallel) — technical / business / product-differentiator audits of the repo
2. **Diagnose** — 12 brutally-honest founder mistakes ranked critical → low
3. **Design** (3 parallel) — Hyderabad-first / Compliance-moat / Field-first architecture proposals
4. **Workflow** — 6-sprint 90-day build plan
5. **Synthesize** — full markdown doc

### Top 4 critical mistakes the audit caught

| # | Mistake | Fix |
|---|---------|-----|
| 1 | Building 21 stub features instead of shipping 1 paying customer | Freeze all new feature work 14 days. Pick ONE workflow (WhatsApp DPR). Sell to 3 Hyderabad builders. Hide every stub. |
| 2 | Treating RERA/GSTN/blockchain as moats without verifying Powerplay's gaps | 5 ex-Powerplay customer interviews THIS WEEK on LinkedIn. Get evidence before more building. |
| 3 | Pricing at 1/6th of Powerplay anchor without testing willingness-to-pay | Reprice Pro to **₹49,999/yr** (30% under, not 70% under). Run 5 WTP calls at ₹75k anchor. |
| 4 | Zero named Hyderabad pilot pipeline despite Powerplay's empty Hyderabad case-study wall | Name 10 targets (My Home, Aparna, Sumadhura, Vasavi, Lansum, Trendset, Hallmark, Vamsiram, Anuhar, Rajapushpa). Book 5 in-person meetings in 14 days. |

### Chosen architecture: Path A — Hyderabad-First Edition

- **One workflow deep** (WhatsApp DPR + Telugu voice), not 21 features wide
- **BuildNow Telangana** native integration as unfair-advantage moat
- **Founder physically in Banjara Hills / Gachibowli / Kondapur** doing 90-min on-site activations
- **Telugu-first product UX** (Bhashini + on-device Whisper) — Powerplay can't replicate from Bengaluru
- **Pricing tiers**: Pilot ₹29,999 (first 5) → Pro ₹49,999 → Business ₹89,999 → Enterprise ₹2,49,999+

### 90-day plan in 6 sprints

| Sprint | Days | Goal |
|--------|------|------|
| 1 | 1-15 | Freeze build, run 10 customer recon interviews, book 5 in-person meetings |
| 2 | 16-30 | Ship WhatsApp DPR + Telugu voice MVP, sign 2 pilots |
| 3 | 31-45 | Promoter daily WhatsApp digest + on-site activation, close 2 more pilots |
| 4 | 46-60 | Handover-packet blockchain + RERA-TG real filing |
| 5 | 61-75 | Marquee close + first contractor hire + peer benchmark |
| 6 | 76-90 | Marquee POC → paid Pro, Series A readiness pack |

**Day 90 target**: 10 paid pilots, ≥₹3.9L ARR, ≥1 marquee Hyderabad logo, VERIFIED_GAPS_MATRIX backed by 30+ signed quotes.

**The one number that matters**: 1 marquee Hyderabad logo by Day 90. Window closing 6-12 months before Powerplay closes My Home or Aparna.

**Document**: `docs/SITETRACK_V3_PLAN.md` (388 lines).

---

## Step 5 — Sprint 1 Day 1: Feature Freeze + Hyderabad-First wedge

**Commit**: `8884b79` `feat(sprint-1): Feature Freeze + Hyderabad-First wedge + pilot motion`

### Code (D1 + D2)

| File | What |
|------|------|
| `src/lib/featureFlags.js` | `STUB_VIEWS` Set with 16 frozen view ids, `STUB_TABS` Set, `isStubView`, `isStubTab`, `isStaffUser` (3 bypass paths: is_staff flag, role==superadmin, VITE_STAFF_EMAILS allowlist), `isViewStubBlocked`, `isTabStubBlocked` |
| `scripts/supabase/49_feature_flags_freeze.sql` | `staff_only_features` audit table seeded with 16 view ids + freeze reasons + un-freeze tracking + RLS + `is_staff` column on profiles + `list_staff_only_features()` RPC |
| `src/features/dpr/index.jsx` | New `DailyProgressView` placeholder — hero, 3 feature cards, Sprint 2 honesty banner, pilot interest capture form persisting to localStorage |
| `src/App.jsx` | `effectiveView` gated by `isViewStubBlocked`; `case "dpr"` route added |
| `src/lib/permissions.js` | `canOpenView` allows `dpr` universally (matches `help` pattern) |
| `src/features/shell/index.jsx` | Sidebar adds `dpr` nav entry at top of tenant nav; filter chain extended with `stubBlocked` + `UNIVERSAL_NAV` Set |

**Net effect**: 16 stub views (RERA mocks, GSTN mock-IRN, broken-persistence admin surfaces, hardware-pending kiosks) hidden from non-staff users. Only the WhatsApp DPR placeholder surfaces as the ONE workflow being sold.

### Docs (D3-D6)

| File | What |
|------|------|
| `docs/FEATURE_FREEZE.md` | The charter — 16 frozen views with reasons + un-freeze procedure + founder rule of thumb |
| `docs/POSITIONING.md` | Canonical positioning — 5 proof points + 8 forbidden claims + ICP + WTP rules + corrected pricing comparison vs Powerplay |
| `docs/PRICING.md` | **REPRICED**. Pilot ₹29,999/yr (first 5) → Pro ₹49,999/yr (−30% vs Powerplay) → Business ₹89,999/yr (−25%) → Enterprise ₹2,49,999+/yr. Old monthly tiers retired |
| `docs/PILOT_AGREEMENT_v1.md` | 10-section design-partner contract template, 24-mo lock, 3-mo logo exclusivity, founder co-signature ready |
| `docs/COMPETITOR_COMPARISON_V2.md` | Prepended freeze notice — all unverified BEAT verdicts downgraded to UNVERIFIED |
| `docs/research/POWERPLAY_RECON_SCRIPT.md` | 10-interview script — Group A (5 ex-Powerplay) + Group B (5 named Hyderabad targets + 8 stretch alternates) |
| `docs/research/INTERVIEW_LOG_2026-06.md` | Log table + per-interview capture template + Sprint 1→2 unlock gate |
| `docs/research/VERIFIED_GAPS_MATRIX.md` | 13 Powerplay-product claims (11 currently UNVERIFIED) + decision rules + sources |
| `docs/sales/DESIGN_PARTNER_DECK.md` | 9-slide deck markdown source with founder beat sheet + 6 retired-slide explanations |
| `docs/sales/DEMO_SCRIPT_DPR.md` | 60-sec Loom beat sheet — Telugu voice on Rs 8,000 Android, real basement parking, honest BuildNow placeholder |
| `docs/sales/MEETING_LOG_2026-06.md` | Operational log for 5 founder meetings + WhatsApp templates |

**Validation**: lint 0 errors, smoke 320/320, tests 556/556, build clean → all PASS.

---

## Step 6 — Sprint 1 Day 2: Loom prep + LinkedIn recon prep

**Commit**: `4ffcb95` `docs(sprint-1): Day 2 Loom prep + Day 7 LinkedIn recon prep`

| File | What |
|------|------|
| `docs/sales/LOOM_SHOOT_CHECKLIST.md` | Printable equipment + Banjara Hills basement parking 06:30 AM timeline + 4 contingencies + consent template |
| `docs/sales/TELUGU_PHRASE_BANK_DPR.md` | Exact Telugu (TS dialect) for beats 2/3/4 + founder VO for beats 6-9 + English glosses + pronunciation hints + Hindi-mix fallback |
| `docs/sales/LOOM_STORYBOARD.md` | 12-shot storyboard mapping the 60-sec beat sheet to camera framings + transitions + on-screen text + 1h 40min editing budget |
| `docs/sales/LINKEDIN_TARGET_LIST.md` | Group A LinkedIn search recipe + Group B profiles with **verified Indeed company data** (My Home founder Dr. Rao confirmed, 201-500 employees, 4.2/5; Aparna ISO 9001+OHSAS 18001, 4.0/5; Sumadhura 40+ projects, 4.3/5 culture; Lansum LLP 4.8/5 highest accessibility) |
| `docs/sales/LINKEDIN_OUTREACH_SEQUENCE.md` | Group A question-led DMs + Group B Loom-led DMs, 3-touch cadence (T1 → T2 +5d → T3 +7d), variants per tier, reply handling for 5 common responses |
| `docs/sales/WARM_INTRO_MAPPING.md` | 6 intro-path ecosystems ranked by ROI: CREDAI Telangana (60% prob), Vasavi walk-in (50%), Lansum founder DM (40%), per-builder atlas + failure modes |

---

## Step 7 — Pending-items batch (Task #29 closed)

**Commit**: `581834f` `chore(sprint-1): pending-items batch — CHANGELOG, tests, smoke parity, marketing rewrite, prod seed`

### Code + tests + smoke

| File | What |
|------|------|
| `CHANGELOG.md` | Session 30 + 30.1 + 30.2 entries appended |
| `tests/featureFlags.test.js` | 32 unit tests across STUB_VIEWS, STUB_TABS, isStubView, isStubTab, isStaffUser (3 bypass paths), isViewStubBlocked, isTabStubBlocked + Sprint 1 never-block contract |
| `scripts/smoke.mjs` | 4 new parity checks (count parity + JS-subset-of-SQL + SQL-subset-of-JS + Sprint 1 freeze docs present) |
| `marketing/index.html` + `public/landing.html` | Surgical edits: meta tags, hero stats, hero lead, comparison table (8 rows rewritten — added Hyderabad-first / BuildNow / Telugu voice / per-org pricing rows), pricing cards (Pilot ₹29,999 / Pro ₹49,999 / Business ₹89,999 / Enterprise ₹2,49,999+), FAQ (6 questions rewritten with honest Sprint 2 answers), CTA strip |
| `scripts/seed-first-org.mjs` | Idempotent seed script — upserts 4 plan rows + creates "Demo Hyderabad Builder" org + prints all 16 frozen views from DB |

### Production operations applied

| Action | Result |
|--------|--------|
| Apply `49_feature_flags_freeze.sql` to prod Supabase | ✅ Applied — `staff_only_features` table + `is_staff` column + RPC + 16 seed rows + RLS live |
| Run `seed-first-org.mjs` against prod | ✅ Org seeded `8eaaa1e7-c4e1-463c-9812-f5e48f5c1587` ("Demo Hyderabad Builder", slug `demo-hyderabad-builder`, plan `pro`) |
| Set `VITE_STAFF_EMAILS=boyapatirakesh7989@gmail.com` in Vercel prod env | ✅ Added via `vercel env add` |
| Build + deploy + alias to `sitetrack-rakesh.vercel.app` | ✅ Live |

**Validation**: lint 0 errors, smoke 324/324 (+4 parity checks), tests 588/588 (+32 featureFlags tests), build clean.

---

## Step 8 — Sprint 2 Day 16: DPR + voice + BuildNow scaffolds

**Commit**: `8b1c01c` `feat(sprint-2): Day 16 foundation — DPR + voice + BuildNow scaffolds`

### Architecture decision doc

| File | What |
|------|------|
| `docs/SPRINT_2_ARCHITECTURE.md` | Decision log + interface contracts + day-by-day founder/code split + risks. Lays out what's buildable now vs what waits for customer signal |

### 3 SQL migrations (applied to prod)

| Migration | Tables / RPCs |
|-----------|---------------|
| `50_dpr_delivery_log.sql` | `dpr_messages` (client_token idempotency, voice/photo/geotag/buildnow_anchor columns, 6-state lifecycle) + `dpr_delivery_log` (per-attempt audit) + `dpr_delivery_slo_window` RPC + RLS |
| `51_voice_transcripts.sql` | Cache keyed by `audio_sha256` + `attempts_count` telemetry + `record_voice_cache_hit` + `voice_transcripts_stats` RPCs + RLS |
| `52_buildnow_anchors.sql` | Daily snapshots PK `(project_id, sync_date)` for idempotent re-sync + `buildnow_latest_for_project` + `buildnow_stale_anchors` RPCs + RLS |

### 3 libs (browser + Deno compatible, mock-adapter-tested)

| Lib | What |
|-----|------|
| `src/lib/voiceTranscribe.js` | `pickProviderOrder` (Bhashini → AWS → mock decision logic), `hashAudio` (SubtleCrypto sha256), mock transcribe with te/hi/en canned responses, `meetsAccuracyBar` at 0.85 threshold |
| `src/lib/offlineQueue.js` | IndexedDB-backed pending-write queue. `enqueue`/`drain`/`queueDepth`/`clearAll`. Exponential backoff (1s/4s/16s/64s/256s, MAX 5 retries). 7-day stale-failed GC. `makeMemoryAdapter` for tests + `makeIndexedDbAdapter` for runtime |
| `src/lib/buildnowAnchor.js` | Same 3-way invariant pattern as `blockchainAnchor.js`. `generateBadgeUrl` (deterministic verify URL), `canonicalizeDprPayload`, `computeAnchorHash`, `badgeStateFor` (5-state machine with staleness threshold) |

### 3 i18n string tables

| File | What |
|------|------|
| `src/i18n/en.json` | Source of truth (composer / status / errors / voice / buildnow / common) |
| `src/i18n/te.json` | Telugu (Telangana dialect, Hyderabad construction register — English loan words preserved for technical terms) |
| `src/i18n/hi.json` | Hindi mirror with Hyderabadi-Hindi register |

### 3 Edge Function shells + retry helper

| File | What |
|------|------|
| `supabase/functions/_shared/retry.ts` | Exponential backoff with shouldRetry predicate hook |
| `supabase/functions/whatsapp_dpr_send/index.ts` | UPSERT `dpr_messages` on client_token, 3-attempt Meta Cloud API retry, per-attempt `dpr_delivery_log` row write, idempotent (returns cached result on re-call). `SITETRACK_DRY_RUN` env for testing |
| `supabase/functions/voice_transcribe/index.ts` | Cache lookup → provider chain → cache write. Bhashini + AWS provider implementations are explicit stubs returning "not implemented" until Sprint 2 mid-cycle |
| `supabase/functions/buildnow_anchor/index.ts` | Same canonical-hash algorithm as the lib. `api`/`scrape`/`mock` acquisition paths. Upserts `buildnow_anchors` per-day |

### 3 test files (72 new tests, total 660)

- `tests/voiceTranscribe.test.js` — 24 tests (constants, provider selection in 8 env combinations, hash determinism, mock branch per language, public entry with mock + EF transport, accuracy bar)
- `tests/offlineQueue.test.js` — 17 tests (kinds, retry delay schedule, stale-failed detection, enqueue, queueDepth, drain in all states, retry window deferral, stale GC, exception catching, clearAll)
- `tests/buildnowAnchor.test.js` — 31 tests (constants vs SQL CHECK parity, generateBadgeUrl encoding, canonicalize keeps/rounds/ignores junk, hash determinism, acquisition path precedence, mockFetcher, public entry with mock + efClient, badgeStateFor 5-state matrix)

### Pilot onboarding runbook

| File | What |
|------|------|
| `docs/sales/PILOT_ONBOARDING_RUNBOOK.md` | Minute-by-minute 90-min on-site activation script. Pre-activation checklist + 6 timed segments + post-activation 4-hour follow-up + Day 1-7 daily WhatsApp check-in template (in Telugu) + 8 contingency scenarios + Day 14 success rubric + Day 30 outcome matrix |

### Intentionally NOT in this commit

- UI views (`DPRComposerView`, `VoiceNoteRecorder`, `PhotoGeotagCapture`, `DPRDetailView`, `BuildNowBadge`) — wait for Sprint 1 pilot interview feedback (Day 18+) so they get baked with real customer signal, not founder hypothesis
- Real Bhashini API call wiring — Bhashini account application = 5-7 days lead time; founder applies Day 16
- Real Meta Cloud API WhatsApp send wiring — pending `WHATSAPP_PERMANENT_TOKEN` per pilot org
- Real BuildNow Telangana integration — pending TG IT dept access
- Signed pilot contracts — founder field work

---

## Step 9 — Sprint Coach subagent (founder field-work guide)

**Commit**: `b159ea9` `feat(agent): Sprint Coach — founder field-work guide subagent`

| File | What |
|------|------|
| `.claude/agents/sprint-coach.md` | Claude Code subagent definition. Frontmatter (name, description, tools, model) + system prompt + 7 pre-baked playbooks + hard boundaries |
| `.agents/sitetrack-pro/founder-sprint-coach.md` | Team charter following existing agent-team pattern (153 lines) |
| `.agents/sitetrack-pro/README.md` | Updated agent team table with 12th row: Founder Sprint Coach |
| `docs/SPRINT_COACH_GUIDE.md` | Founder-facing usage guide (430 lines). How to invoke + 8 common asks with sample outputs + doc → action mapping + sample week-1 conversation flow |

### What the Sprint Coach can do (founder asks)

| Ask | Coach reads | Coach does |
|-----|-------------|-----------|
| "Today emi cheyali?" | `SITETRACK_V3_PLAN.md` + recent logs | 3-bullet day plan with time-budgets |
| "Help me prep for tomorrow's [Builder] meeting" | `MEETING_LOG_2026-06.md` + `LINKEDIN_TARGET_LIST.md` + `POSITIONING.md` + `DESIGN_PARTNER_DECK.md` | 1-page cheat-sheet with verified facts + 3 proof points + 3 forbidden claims + opening line + closing ask |
| "I just finished interviewing [Name]" | (founder verbatim report) | Confirms then updates `INTERVIEW_LOG` + `VERIFIED_GAPS_MATRIX` |
| "Draft a LinkedIn DM to [Name]" | `LINKEDIN_OUTREACH_SEQUENCE.md` + target profile | Personalised DM ≤ word ceiling |
| "How do I say [phrase] in Telugu?" | `TELUGU_PHRASE_BANK_DPR.md` | Telugu + English gloss + pronunciation hint |
| "Score me on Sprint 1 → 2 gate" | log files + matrix | Scorecard with target/current/gap/action per criterion |
| "What's the next warm-intro step for [Builder]?" | `WARM_INTRO_MAPPING.md` | Highest-strength unactivated path |
| "Bhashini API kosam apply chesta — em cheppali?" | `SPRINT_2_ARCHITECTURE.md` | Step-by-step application walkthrough |

### Hard boundaries (the coach WILL NOT do)

- Make commitments on founder's behalf
- Fabricate interview / meeting outcomes
- Promise features that haven't shipped (cross-checks `FEATURE_FREEZE.md`)
- Quote retired ₹999/2,999/7,999 monthly tiers
- Use forbidden claims from `POSITIONING.md` until VERIFIED via interview data
- Modify code, run builds, or deploy
- Skip the doc read

---

## What's live in production right now

| Layer | Status |
|-------|--------|
| URL | `https://sitetrack-rakesh.vercel.app` |
| Marketing | `https://sitetrack-rakesh.vercel.app/landing.html` — repositioned to Hyderabad-first / WhatsApp Telugu / BuildNow Telangana / per-org pricing |
| Auth | Magic-link + password + OTP fallback. Demo role logins permanently removed. 15+ Supabase errors mapped to friendly English |
| Feature freeze gate | 16 stub views hidden from non-staff users (compliance, forecast, material-prices, ar-overlay, kiosks, broken-persistence admin surfaces) |
| Staff bypass | Founder email `boyapatirakesh7989@gmail.com` in `VITE_STAFF_EMAILS` — sees full 16 stubs for QA |
| Database | 52 SQL migrations live in prod. 16 frozen views recorded in `staff_only_features` table. Demo org seeded (`8eaaa1e7-c4e1-463c-9812-f5e48f5c1587`) |
| DPR placeholder | `/?view=dpr` — hero + 3 feature cards + pilot interest capture form. Sprint 2 honesty banner |
| Edge Functions | 11 total (3 new Sprint 2 shells: `whatsapp_dpr_send`, `voice_transcribe`, `buildnow_anchor`) deployed but not yet wired to real providers |

---

## What's pending (founder field work — code cannot do)

### Sprint 1 Days 3-15

| Day | Action |
|-----|--------|
| Day 2 ✅ (code done) | Founder records 60-sec Loom in Banjara Hills basement parking 06:30 AM per `LOOM_SHOOT_CHECKLIST.md` |
| Day 3 morning | Call CREDAI Telangana for next monthly meet date; register as tech-vendor associate (~₹10k) |
| Day 3 afternoon | LinkedIn hand-research to fill A1-A5 names in `LINKEDIN_TARGET_LIST.md`; identify Lansum founder + Aparna ISO consultant |
| Day 4 | Send 15 LinkedIn DMs (10 Group A T1 + 5 Group B T1) |
| Day 4 (10 AM Tue) | Vasavi walk-in at Banjara Hills office with Loom QR + 1-pager |
| Day 5 | Coffee with first RMC plant manager |
| Day 6 | CREDAI Telangana monthly meet (if calendar aligns) |
| Day 7 | First 3 Group A interviews; update `VERIFIED_GAPS_MATRIX.md` |
| Day 9 | Send T2 follow-ups to non-responders |
| Day 14 | Send T3 finals |
| Day 15 | Sprint 1 → Sprint 2 gate decision |

### Sprint 1 → 2 unlock criteria

- [ ] ≥ 8 of 10 interviews completed and logged
- [ ] `VERIFIED_GAPS_MATRIX.md` has signed quotes for every UNVERIFIED row
- [ ] ≥ 5 Sprint 2 meetings on calendar with named builder + decision-maker + date
- [ ] ≥ 1 PILOT-YES OR ≥ 2 MAYBE-to-follow-up at ₹29,999 or higher
- [ ] Pricing decision locked (or re-anchored based on WTP data)

### Sprint 2 Days 16-30

| Days | Code | Founder field |
|------|------|---------------|
| 16 ✅ (foundation done) | SQL 50/51/52, libs, EFs, i18n, tests, runbook | Apply for Bhashini API access |
| 16-17 | — | Close 2 pilot contracts from Sprint 1 booked meetings |
| 18-19 | Day 18 customer-feedback spike → adjust UI scope | First 2 pilots signed; founder visits both sites |
| 20-22 | `DPRComposerView` + `VoiceNoteRecorder` + `PhotoGeotagCapture` | First pilot site activation (90 min on-site per runbook) |
| 23-24 | `DPRDetailView` + `BuildNowBadge` | Second pilot site activation |
| 25-27 | Production wiring: `WHATSAPP_PERMANENT_TOKEN` + `BHASHINI_API_KEY` + `BUILDNOW_API_TOKEN` env vars | Live use begins both pilots |
| 28-29 | Bug fixes from pilot feedback | Daily check-in with both supervisors |
| 30 | Sprint 2 retro + Sprint 3 unlock decision | Both pilots running ≥ 5 days; case study draft started |

### Sprint 2 Day-30 acceptance criteria

- [ ] End-to-end DPR demo: Telugu voice → promoter WhatsApp within 90 seconds on 2GB Android
- [ ] Voice transcription word-accuracy ≥ 85% on 20 site phrases
- [ ] ≥ 2 signed paid pilots at ₹29,999/yr
- [ ] Zero P1 bugs over 5 consecutive days of live use

---

## All commits in this arc

| Commit | What |
|--------|------|
| `9a7b8dc` | Session 30 — production auth panel, demo role login removed |
| `6e23baa` | Session 30.1 — E2E spec + friendly error map for Supabase "is invalid" |
| `34d3be1` | docs(plan) — SiteTrack Pro v3 research-backed architecture + 90-day build plan |
| `8884b79` | Sprint 1 — Feature Freeze + Hyderabad-First wedge + pilot motion |
| `4ffcb95` | Sprint 1 — Day 2 Loom prep + Day 7 LinkedIn recon prep |
| `581834f` | Sprint 1 — pending-items batch (CHANGELOG, tests, smoke parity, marketing rewrite, prod seed) |
| `8b1c01c` | Sprint 2 — Day 16 foundation (DPR + voice + BuildNow scaffolds) |
| `b159ea9` | feat(agent) — Sprint Coach founder field-work guide subagent |

---

## Final validation gate

- **Lint**: 0 errors (139 warnings, all pre-existing)
- **Smoke**: 324/324 PASS (includes STUB_VIEWS parity check between JS + SQL)
- **Tests**: 660/660 PASS across 33 test files (was 556; +104 new tests across featureFlags + voiceTranscribe + offlineQueue + buildnowAnchor)
- **Build**: ~7-12s clean
- **Migrations applied to prod Supabase**: 49 + 50 + 51 + 52 all live via `scripts/apply-only.mjs`
- **Production URL**: ✅ `https://sitetrack-rakesh.vercel.app`

---

## Founder rule of thumb

> Code work — this AI builds.  
> Field work — founder does.  
> Sprint Coach — orchestrates the field work.

The coach reads docs + updates logs + drafts messages + scores progress. The coach does NOT do the field work. The 90-min on-site activation, the Telugu voice note to your supervisor, the handshake with Dr. Rao at CREDAI — those are yours.

---

## What to do today (the founder)

1. Open this doc + scroll to the "What's pending (founder field work)" section.
2. Identify what Sprint Day you're on (June 1 = Day 1, June 2 = Day 2…).
3. Open Claude Code in this repo + invoke `sprint-coach: Today emi cheyali?`.
4. Coach gives you 3 concrete actions with time budgets, citing the relevant playbook section per action.
5. Execute. Report back to coach after each one so logs stay current.

If you're not in Claude Code, open `docs/SPRINT_COACH_GUIDE.md` and follow the doc → coach action mapping table manually.

---

## Edit log

- v1.0 (Session 30.4, June 2, 2026) — initial complete summary.
- v1.x — update after each major sprint milestone.
