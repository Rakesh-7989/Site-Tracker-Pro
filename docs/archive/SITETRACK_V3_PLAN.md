# SiteTrack Pro v3 — Architecture, Mistakes, 90-Day Build Plan
*Synthesized from June 2026 deep-research + repo audit*

## TL;DR

- **Asalu problem idi**: Solo founder lo build-trap — 21 stub features shipped, but ZERO paying customers, despite 37 SQL migrations, 8 edge functions, blockchain Solidity, and Cashfree integration. Day 30 KPI of "first paying customer" missed entirely.
- **Chosen architecture**: **SiteTrack Pro v3 — Hyderabad-First Edition** — 1 workflow deep (WhatsApp DPR + Telugu voice), 10 named Hyderabad mid-size builders as design partners, BuildNow Telangana as the unfair-advantage integration moat, pricing repositioned at INR 49,999/yr Pro (30% under Powerplay's INR 71,999, NOT 70% under).
- **Next 15 days**: HARD feature-freeze. Hide all 21 stubs behind staff-only flag. Run 10 customer reconnaissance interviews (5 ex-Powerplay + 5 Hyderabad targets) to VERIFY gaps before any more code. Book 5 in-person founder meetings at Banjara Hills / Gachibowli / Kondapur builder offices.
- **Day 90 target**: 2 signed paid pilots minimum (INR 59,998 ARR floor), 1 marquee Hyderabad logo (My Home / Aparna / Sumadhura / Vasavi / Lansum tier) on the wall, VERIFIED_GAPS_MATRIX backed by 8+ signed quotes — not assumption.

---

## 1. Where you are mistaking (top 10, ranked)

Meeku straight ga cheppali — research + repo audit lo kanipinchina pattern okate: **engineer brain unna founder, sales brain ledu**. Below table is ranked by revenue-impact-per-fix, not by code-complexity.

| # | Mistake | Category | Severity | Evidence | Fix |
|---|---------|----------|----------|----------|-----|
| 1 | Building 21 stub features instead of shipping 1 paying customer | prioritization | CRITICAL | 12 shipped vs 21 stubs. RERA-TG/KA/MH edge functions explicitly labelled SCAFFOLD or return STUB- acks. Solo dev shipped 37 SQL migrations + 8 edge functions + 19 roles + Solidity + Cashfree + WhatsApp Cloud + Sentry — and ZERO customers. Day 30 KPI missed. | Freeze ALL new feature work 14 days. Pick ONE workflow (WhatsApp DPR — validated by BuildNow Telangana). Sell to 3 Hyderabad builders. Delete/hide every stub. |
| 2 | Treating RERA/GSTN/blockchain as moats without verifying Powerplay's gaps | strategy | CRITICAL | Research Point 7 (verified): "Could NOT confirm Powerplay's product LACKS RERA/GSTN/kiosk/blockchain/vernacular UI." COMPETITOR_COMPARISON_V2.md still positions these as BEAT verdicts. (verified: research/Point-7/UNVERIFIED-gaps) | Book 30-min calls with 5 ex-Powerplay customers via LinkedIn THIS WEEK. Get written evidence. Downgrade all unverified BEAT verdicts to UNVERIFIED until proof lands. |
| 3 | Pricing at 1/6th of Powerplay anchor without testing willingness-to-pay | positioning | CRITICAL | SiteTrack Pro = INR 36,000/yr vs Powerplay Pro = INR 71,999/yr. SiteTrack Business = INR 96,000/yr vs Powerplay Pro+ = INR 1,19,999/yr. (verified: Powerplay/INR 71,999/Pro tier, INR 1,19,999/Pro+ tier) | Reprice Pro to INR 49,999-59,999/yr, Business to INR 89,999-1,09,999/yr — 15-30% below, not 70% below. Run 5 willingness-to-pay calls at INR 75k before locking. |
| 4 | Zero named Hyderabad pilot pipeline despite Powerplay's empty Hyderabad case-study wall | gtm | CRITICAL | Research Point 3 (verified 3-0): Powerplay's case studies feature ZERO Hyderabad marquee builders. Founder lives in Hyderabad. Day -2 plan is "compile a list of 50 RERA-registered builders" — not even started. (verified: research/Point-3/zero-Hyderabad-marquee) | Name 10 specific targets THIS WEEK: My Home, Aparna, Sumadhura, Vasavi, Lansum, Trendset, Hallmark, Vamsiram, Anuhar, Rajapushpa. Book 5 in-person meetings in next 14 days. |
| 5 | Ignoring BuildNow Telangana as native integration surface | architecture | HIGH | Research Point 4 (verified): buildnow.telangana.gov.in (Feb 2025) uses blockchain audit trails + WhatsApp-first status updates as CORE features. Direct govt precedent for SiteTrack's two main differentiators. Repo has zero BuildNow integration code. (verified: BuildNow/Feb-2025/blockchain+WhatsApp) | Sprint 2 must ship `supabase/functions/buildnow_anchor/` — pull project metadata from BuildNow API, mirror approval status, display state-govt-verified badge. |
| 6 | English-only UI in a Telugu-speaking site-supervisor market | ux | HIGH | Repo has no `src/i18n/te.json`. Powerplay markets "multilingual support" (verified: Powerplay/multilingual-marketing) but ZERO evidence of Telugu-first voice UX with on-device transcription. Site supervisors in Hyderabad speak Telugu, not translated-string-table English. | Sprint 2: ship Telugu voice DPR with Bhashini API primary, AWS Transcribe fallback. Telugu must be the DEFAULT, not a toggle. |
| 7 | Per-user pricing model not exploited as anti-Powerplay positioning | positioning | HIGH | Powerplay charges per-seat (INR 71,999 / 15-20 users = ~INR 4,000/user/yr). SiteTrack chose per-org but does not weaponize the message. Builders get punished by Powerplay for adding site supervisors. | Lead every sales conversation with "you don't get punished for adding your site supervisor." Per-org becomes the wedge, not the discount. |
| 8 | Promoter (the buyer) gets a web dashboard, not WhatsApp digest | gtm | HIGH | Builder promoters (Mr. Rameshwar Rao, Mr. Suresh Sumadhura type) at 7am with coffee will NEVER log into a dashboard. Procore/Buildertrend lose deals at this exact layer. Repo has WhatsApp Cloud API but no promoter-digest cron. | Sprint 3: daily 7am WhatsApp digest per project — cost-to-date, schedule variance, top 3 risks, photo of yesterday's pour. |
| 9 | Blockchain (AuditAnchor.sol) built but no handover-packet use case | tech-debt | MEDIUM | Solidity contract shipped, but no PDF-generation pipeline that anchors merkle root on-chain for buyer handover. Blockchain currently = engineering ego, not customer value. | Sprint 4: ship handover-packet PDF generator. Merkle-root on-chain, scannable QR. THIS is the blockchain story for buyers, not a generic "audit trail" pitch. |
| 10 | No founder-led on-site activation runbook for INR 29,999/yr pilots | gtm | MEDIUM | Repo has `scripts/seed_pilot_org.mjs` mentioned but no 90-min activation runbook. Pilots will churn at 30 days without founder hand-holding. | Sprint 2: ship `docs/sales/PILOT_ONBOARDING_RUNBOOK.md` + Telugu supervisor training video. Founder physically visits each pilot office in week 1. |

**Pattern observation**: 6 of top 10 mistakes are gtm/positioning/strategy. Only 1 is pure tech-debt. Idi confirm chesthondi — founder doesn't have a tech problem, has a customer-discovery problem.

---

## 2. The market reality

Konni vishayalu unnayi market lo, vaatini straight ga chudali — no founder-narrative coating:

### 2.1 The incumbent

**Powerplay** is the dominant Indian construction-SaaS, full stop. (verified: Powerplay/$7.14M-Series-A/Sept-2022-Accel-led). Their stack is mature: labour tracking + payables, vendor payables, project management, material tracking, subcontractor management, expense tracking, mobile app. Positioning is "multilingual support + 7-day adoption" vs Procore/Buildertrend who lose Indian deals on price and on-the-ground complexity. (verified: Powerplay/Pro-INR-71999/Pro+-INR-119999)

### 2.2 The credit-fintech move

Powerplay launched **embedded credit in Hyderabad in March 2026** — 60-day tenor, INR 10L-50L collateral-free, procurement-linked via their marketplace only. (verified: Powerplay/March-2026/embedded-credit-Hyderabad)

Idi serious signal: Powerplay is monetizing CAC by becoming a fintech layer. If SiteTrack wants to compete on price alone, Powerplay will subsidize seats with credit margin. **Don't compete on price. Compete on Hyderabad depth.**

### 2.3 The Hyderabad gap (the wedge)

Research Point 3 (verified 3-0 adversarial): **Powerplay's public case studies feature ZERO Hyderabad marquee builders.** No My Home, no Aparna, no Sumadhura, no Vasavi, no Lansum, no Trendset, no Hallmark, no Vamsiram. (verified: research/Point-3/zero-Hyderabad-marquee/3-0-adversarial)

This is the single most valuable competitive intel in the entire deck. Founder lives in Hyderabad. Window to plant a flag with ONE marquee Hyderabad name is closing — 6-12 month estimate before Powerplay closes My Home or Aparna.

### 2.4 The govt precedent (the moat)

**Telangana BuildNow portal** (Feb 2025, buildnow.telangana.gov.in) uses blockchain audit trails + WhatsApp-first status updates as CORE features. (verified: BuildNow/Feb-2025/blockchain+WhatsApp-core)

This is gold. Govt has done the customer education FOR you. When you pitch "blockchain audit trail" to a builder, they don't say "what?" — they say "oh like BuildNow." Powerplay (Bengaluru-based) does not have native BuildNow integration. This compounds with every TG state release.

### 2.5 SaaS adjacency health

**Freshworks FY2025**: $838.8M revenue (+16% YoY), first profitable year ($183.7M net income vs $95.4M loss prior). (verified: Freshworks/FY2025/$838.8M/+16%) — Indian SaaS adjacency is healthy. Series A/B money is available for Hyderabad-based vertical-SaaS with verified ARR.

### 2.6 Real-estate liquidity

**Square Yards** $35M raise 2025 at $935M valuation, Rs 2,000 cr IPO planned CY2026. (verified: Square-Yards/$35M/$935M-valuation/2025) — buyer-side real-estate tech is hot. Construction-side tech rides the same wave.

### 2.7 The honest caveat

Research Point 7 (verified): **Could NOT confirm Powerplay's product LACKS RERA/GSTN/kiosk/blockchain/vernacular UI.** Absence from marketing copy is not proof of absence in product. (verified: research/Point-7/UNVERIFIED-gaps)

Mistake #2 above is BUILT on this finding. Every founder positioning slide that says "Powerplay doesn't have X" must be downgraded to UNVERIFIED until 5 ex-Powerplay customer interviews land.

### 2.8 Market reality summary

| Finding | Verdict | SiteTrack action |
|---------|---------|------------------|
| Powerplay = dominant, $7.14M, mature | Confirmed | Don't fight on feature breadth. Compete on depth + locality. |
| Powerplay launched embedded credit Mar 2026 | Confirmed | Don't fight on price alone — they have credit margin to subsidize. |
| Powerplay has ZERO Hyderabad marquee logos | Confirmed 3-0 | **PLANT A FLAG.** Sign My Home or Aparna in 90 days. |
| BuildNow TG = blockchain + WhatsApp govt precedent | Confirmed | Build native BuildNow integration — Sprint 2 priority. |
| Freshworks profitable; SaaS healthy | Confirmed | Series A pitch in 12 months is realistic IF ARR is verified. |
| Square Yards $935M, IPO 2026 | Confirmed | Real-estate adjacency tailwind exists. |
| Powerplay's product-level gaps | **UNVERIFIED** | Interview 5 ex-Powerplay customers BEFORE building more "moat" features. |

---

## 3. Three architecture paths — and the chosen one

Mundu architecture options moodu pettali table lo — assume karchi compare cheyyali:

### 3.1 Path A — SiteTrack Pro v3 (Hyderabad-First Edition)

10 named Hyderabad mid-size builders within 90 days. Win on 3 vectors Powerplay cannot match from Bengaluru: (1) BuildNow Telangana native integration; (2) Telugu-first product UX with on-device voice; (3) in-person founder-led sales engineering at builder offices. Pricing INR 49,999/yr Pro (30% under Powerplay), 1 workflow deep (WhatsApp DPR), not 21 features wide. Founder physically present in the market.

### 3.2 Path B — Pan-India RERA Multi-State Edition (hypothetical)

Build RERA-TG + RERA-KA + RERA-MH + RERA-MH + RERA-GJ + RERA-UP edge functions production-grade. Sell to 50-builder cohort across 6 states. Differentiator = "the only platform that files RERA across all major states." Pricing per-state add-on (INR 19,999/state/yr). Heavy compliance moat, low locality moat.

### 3.3 Path C — Generic Marketplace-Plus-Credit Edition (hypothetical)

Mimic Powerplay's playbook: build a materials marketplace, bolt embedded credit, monetize via finance margin not seat-fee. Pricing free seat / pay-on-marketplace-volume. Requires fintech NBFC partnership, KYC stack, 12-month regulatory runway.

### 3.4 The verdict

**Path A wins.** Reasoning anchored in mistakes #1, #4, #6 and research Points 3 + 4:

| Decision dimension | Path A | Path B | Path C |
|-------------------|--------|--------|--------|
| Time-to-first-paid-customer | **30 days** | 90+ days | 180+ days |
| Founder leverage (Hyderabad-based) | **MAX** | Low | Low |
| Powerplay-gap exploited | **Hyderabad marquee (3-0 verified)** | Unverified (Point 7) | Powerplay is ahead |
| Capital required | **Solo dev sustainable** | 2-3 hires needed | NBFC + fintech team |
| Regulatory risk | Low | Medium (multi-state) | HIGH (NBFC) |
| Moat compounding | **BuildNow + Telugu voice** | Compliance breadth | Marketplace network effect (slow) |

**Graft from Path B**: keep RERA-TG (only TG, not all 6 states) as a Sprint 2 deliverable — BuildNow integration already touches TG-RERA, so marginal cost is low. Multi-state RERA goes into Business tier as a future-promise, not a Day 90 deliverable.

**Graft from Path C**: keep AuditAnchor.sol but pivot its use case from "generic audit trail" to "handover-packet blockchain anchor for buyer trust" (mistake #9). Do NOT build a marketplace or embedded credit — that's Powerplay's home turf with March 2026 head start.

**Why Path A specifically**: 
- Founder lives in Hyderabad (mistake #4 fix)
- Powerplay has no Hyderabad case study (research Point 3, verified 3-0)
- BuildNow TG validates blockchain + WhatsApp (research Point 4)
- Telugu voice UX is impossible to replicate from Bengaluru without on-the-ground supervisor research
- One workflow deep (WhatsApp DPR) directly fixes mistake #1 (21 stubs)
- Pricing at INR 49,999/yr fixes mistake #3 (15-30% under, not 70% under)

---

## 4. The chosen v3 architecture

Inka concrete ga chudali layer-by-layer — components, differentiators, risks, pricing.

### 4.1 Layer 1 — Hyderabad Field Layer (site-supervisor-first)

**Purpose**: The only surface a site supervisor or junior engineer ever touches. Designed for 4-inch Android phones on 3G in a basement parking lot, in Telugu, with one-thumb operation. The wedge.

**Components**:

| Component | Why it matters |
|-----------|----------------|
| Telugu-first voice DPR (on-device Whisper-tiny + Bhashini API) | Powerplay's "multilingual" is translated string tables, not voice-native |
| WhatsApp Flows check-in (no app install for vendors/labour contractors) | 80% of vendors won't install another app |
| Offline-first photo capture with EXIF + geofence proof | Basement parking = reality, not edge case |
| One-tap material received receipt (OCR Telugu/English/Hindi) | Removes 5-min manual entry per delivery |
| Labour attendance via face-recognition selfie + geofence | Anti-ghost-worker, signed locally |
| Vernacular safety checklist with audio prompts | Literacy-aware — high-rise scaffolding EHS for Hyderabad gated communities |

### 4.2 Layer 2 — BuildNow Telangana Integration Layer

**Purpose**: The unfair advantage. Compounds with every state-government release.

**Components**:

| Component | Why it matters |
|-----------|----------------|
| BuildNow project-ID sync (official API or scrape-fallback) | Native govt-mirror status |
| RERA-TG filing assistant (one-click submit) | Quarterly progress reports auto-prefilled |
| GHMC building-permit milestone tracker | Auto-flag out-of-sync phase progress |
| TG labour-cess 1% auto-calc + challan generation | Tied to recorded labour days |
| TG Pollution Control dust/noise compliance log | For Banjara Hills residential-complaint sites |
| TG Industries dept handoff for mixed-use projects | Native govt routing |

### 4.3 Layer 3 — Promoter / Owner Layer (the buyer's surface)

**Purpose**: WhatsApp-first, English+Telugu, optimized for 7am cup-of-coffee scan. **The economic buyer is here, not on a dashboard.** Procore/Buildertrend lose deals at exactly this layer.

**Components**:

| Component | Why it matters |
|-----------|----------------|
| Daily 7am WhatsApp digest per project | Cost-to-date vs budget, schedule variance, top 3 risks, yesterday's pour photo |
| Weekly Saturday-morning branded PDF | Forward to bankers/investors with builder logo |
| Voice-query bot in Telugu/Hinglish | "Vasavi Vista lo cement stock enti?" → voice reply |
| Blockchain-anchored handover packet | AuditAnchor.sol gets a real use case |
| Promoter peer-benchmark (anonymized cost-per-sqft) | Only possible because 10 named builders on platform |
| Family-office mode (groomed successor view) | Curated annotations from promoter |

### 4.4 Layer 4 — Engineering Plumbing (existing, harden don't expand)

| Component | Status | Sprint 1 action |
|-----------|--------|-----------------|
| 37 SQL migrations | Shipped | Audit, consolidate, freeze |
| 19 roles | Shipped | Audit for over-engineering |
| WhatsApp Cloud API | Shipped | Harden idempotency + retry |
| Cashfree integration | Shipped | Keep — pilot collections route through this |
| Sentry | Shipped | Keep |
| AuditAnchor.sol | Shipped | Repurpose for handover packet only |
| 8 RERA/GSTN/blockchain edge functions | **STUBS** | Hide behind staff-only flag |
| 21 stub UI views | **STUBS** | Hide behind staff-only flag |

### 4.5 Differentiators (the one-line pitch per persona)

| Persona | The one-line pitch |
|---------|-------------------|
| Hyderabad builder promoter | "BuildNow audit trail + 7am WhatsApp digest. You don't log in. Ever." |
| Site supervisor | "Telugu lo voice note. Photo. Send. Aithe ayipoyindi." |
| Site engineer | "All your DPRs already filed to RERA-TG. Stop typing." |
| Builder's CFO | "Per-org pricing. Add 200 supervisors. No extra cost. (Powerplay charges per seat.)" |
| Builder's promoter's son (successor) | "Family-office mode. Annotations from dad. Cost-per-sqft vs peer Hyderabad builders." |

### 4.6 Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Powerplay ships Telugu voice in 60-day sprint after seeing marketing site | Medium | Sprint 1 customer interviews lock in 5 design partners BEFORE marketing site goes public |
| BuildNow API access denied or rate-limited | Medium | Scrape-fallback documented in `supabase/functions/buildnow_anchor/`; relationship-building with TG IT dept Sprint 3 |
| Pilots churn at 30 days without founder hand-holding | High | Founder-led 90-min on-site activation runbook (Sprint 2 deliverable) |
| INR 29,999/yr pilot price anchors too low for Pro upsell | Medium | 24-mo lock + 3-mo logo exclusivity per micro-segment makes it a partnership, not a discount |
| Solo dev burns out maintaining 4 layers | High | Layer 4 is FROZEN — no new plumbing. Sprint 5 hire first contractor for Telugu QA. |
| Powerplay ships BuildNow integration first | Low-Medium | Founder relationships with TG IT dept beat Bengaluru cold outreach |

### 4.7 Pricing tiers vs Powerplay

| Tier | SiteTrack Pro v3 | Powerplay | Delta | Positioning |
|------|------------------|-----------|-------|-------------|
| Pilot (design partner) | INR 29,999/yr, first 5 builders, 24-mo lock, 3-mo logo exclusivity | N/A | — | Partnership, not discount |
| Pro | **INR 49,999/yr per org**, ≤25 users, ≤10 projects, BuildNow sync, Telugu+English, WhatsApp DPR, RERA-TG, founder onboarding | INR 71,999/yr, 15-20 users | **−30%** | "Per-org, not per-seat" |
| Business | **INR 89,999/yr per org**, ≤60 users, unlimited projects, multi-state RERA (TG+AP+KA), GSTN e-invoice, blockchain handover, Hyderabad CSM, quarterly on-site | INR 1,19,999/yr, 30 users | **−25%** | "Adds your site supervisor free" |
| Enterprise | INR 2,49,999/yr starting, custom users, white-label promoter app, API, on-prem audit log mirror, named sales engineer | Custom | — | "Handover ceremony branded" |

Critical rule: **never quote a price under INR 49,999/yr to a non-pilot.** Mistake #3 was leaving 40-60% revenue on the table. INR 36,000 → INR 49,999 is a 39% revenue uplift per customer with zero feature change.

---

## 5. 90-day sprint-by-sprint build plan

Aaru sprints, 15 days okkati. Founder discipline edi — every sprint has a deliverable table + success criteria. Miss a success criteria → don't start the next sprint until fixed.

### Sprint 1 — Freeze Build, Field-Verify Powerplay Gaps (Day 1-15)

**Goal**: Halt all new feature work. Kill 18+ stub features from the UI. Produce written customer-verified evidence (5 ex-Powerplay + 5 Hyderabad target builders) of which of RERA/GSTN/blockchain/vernacular/WhatsApp-DPR are REAL gaps before any further build.

| Title | Files | Days |
|-------|-------|------|
| Feature-freeze guardrail + stub-hiding flag matrix | `docs/planning/FEATURE_FREEZE.md`, `scripts/supabase/49_feature_flags_freeze.sql`, `src/lib/featureFlags.js`, `src/features/shell/index.jsx` | 1.5 |
| Hide all 21 stubs behind staff-only flag; surface ONE workflow (WhatsApp DPR) on home shell | `src/features/views/RERAKarnatakaView.jsx`, `src/features/views/RERAMaharashtraView.jsx`, `src/features/views/VendorPortalView.jsx`, `src/features/views/GSTNEInvoiceView.jsx`, `src/features/views/DrawingDiffView.jsx`, `src/features/views/AIRecommenderView.jsx`, `src/features/shell/Nav.jsx`, `src/App.jsx` | 2 |
| Powerplay reconnaissance script — 10 structured customer interviews (5 ex-Powerplay + 5 Hyderabad targets: My Home, Aparna, Sumadhura, Vasavi, Lansum) | `docs/research/POWERPLAY_RECON_SCRIPT.md`, `docs/research/INTERVIEW_LOG_2026-06.md`, `docs/research/VERIFIED_GAPS_MATRIX.md` | 5 |
| Re-cut COMPETITOR_COMPARISON_V2: flip every unverified BEAT verdict to UNVERIFIED until interview evidence lands | `docs/business/COMPETITOR_COMPARISON_V2.md`, `docs/business/POSITIONING.md` | 1 |
| Pilot pricing & exclusivity contract (INR 29,999/yr design-partner, 24-mo lock, 3-mo logo exclusivity per micro-segment) | `docs/business/PRICING.md` | 2 |
| Daily WhatsApp-DPR demo recording (60-sec Loom) + 5 in-person founder meetings booked at Banjara Hills / Gachibowli / Kondapur builder offices | `docs/sales/DEMO_SCRIPT_DPR.md`, `docs/sales/MEETING_LOG_2026-06.md`, `public/demos/whatsapp_dpr_60s.mp4` | 3 |

**Success criteria**:
- Zero stub features visible to non-staff users (verified by `scripts/ci/smoke.mjs` assertion + Playwright nav test)
- `VERIFIED_GAPS_MATRIX.md` contains signed quotes from ≥8 of 10 interviews mapping RERA/GSTN/blockchain/vernacular/WhatsApp-DPR to one of {Powerplay has it, doesn't have it, builder doesn't care}
- 5 confirmed paid-pilot meetings on calendar for Sprint 2 (named builder + decision-maker + date)
- All COMPETITOR_COMPARISON_V2 BEAT verdicts either backed by interview quote or downgraded to UNVERIFIED

### Sprint 2 — Ship WhatsApp DPR + Telugu Voice MVP (Day 16-30)

**Goal**: Ship a production-grade WhatsApp Daily Progress Report flow with Telugu voice-to-text from site supervisor to builder-promoter, anchored to BuildNow Telangana audit trail. Convert ≥2 of 5 booked meetings into signed pilot contracts at INR 29,999/yr.

| Title | Files | Days |
|-------|-------|------|
| WhatsApp DPR send Edge Function — production hardening (idempotency, retry, delivery receipts, builder-promoter routing) | `supabase/functions/whatsapp_dpr_send/index.ts`, `supabase/functions/whatsapp_dpr_send/idempotency.ts`, `supabase/functions/_shared/whatsapp_client.ts`, `scripts/supabase/50_dpr_delivery_log.sql`, `tests/edge/whatsapp_dpr_send.test.ts` | 3 |
| Supervisor mobile DPR composer — Telugu/Hindi voice note + photo + geotag, offline-first, works on Rs 8,000 Android / 2GB / 2G | `src/features/views/DPRComposerView.jsx`, `src/features/dpr/VoiceNoteRecorder.jsx`, `src/features/dpr/PhotoGeotagCapture.jsx`, `src/lib/offlineQueue.js`, `src/i18n/te.json`, `src/i18n/hi.json` | 4 |
| Telugu/Hindi voice-to-text pipeline (Bhashini API primary, AWS Transcribe fallback) with on-device caching | `supabase/functions/voice_transcribe/index.ts`, `src/lib/voiceTranscribe.js`, `scripts/supabase/51_voice_transcripts.sql`, `tests/edge/voice_transcribe.test.ts` | 2.5 |
| BuildNow Telangana audit-trail integration — anchor each DPR submission to portal API + display state-govt verified badge | `supabase/functions/buildnow_anchor/index.ts`, `src/features/views/DPRDetailView.jsx`, `src/components/BuildNowBadge.jsx`, `scripts/supabase/52_buildnow_anchors.sql` | 2 |
| Pilot onboarding kit — founder-led 90-min on-site activation runbook + Telugu UI screenshots + supervisor training video | `docs/sales/PILOT_ONBOARDING_RUNBOOK.md`, `scripts/seed_pilot_org.mjs` | 1.5 |
| Sign 2 paid pilots — push contracts through, collect first INR 59,998 of ARR (2 × 29,999) | | 2 |

**Success criteria**:
- End-to-end DPR demo: supervisor speaks Telugu voice note on 2GB Android in basement parking, message lands on promoter's WhatsApp with photo + geotag + transcription within 60 sec when signal returns
- ≥2 signed pilot contracts (INR 59,998 ARR floor) — minimum 1 from named Hyderabad target
- BuildNow audit-trail badge visible on shipped DPR detail view, anchored to real (or scrape-fallback) BuildNow data

### Sprint 3 — Promoter Layer + Founder-Led Activation (Day 31-45)

**Goal**: Ship the promoter (buyer) WhatsApp daily digest. Activate 2 signed pilots on-site at their offices. Close 2 more pilots (target: 4 total paid).

| Title | Files | Days |
|-------|-------|------|
| Daily 7am WhatsApp promoter digest cron (cost-to-date, schedule variance, top 3 risks, photo) | `supabase/functions/promoter_digest_cron/index.ts`, `supabase/functions/_shared/digest_renderer.ts`, `scripts/supabase/53_digest_subscriptions.sql` | 3 |
| Saturday weekly branded PDF generator (builder logo, forward-to-banker ready) | `supabase/functions/weekly_pdf_render/index.ts`, `src/features/views/PromoterReportView.jsx`, `scripts/supabase/54_pdf_audit.sql` | 2 |
| On-site founder activation visits — 2 pilots, Banjara Hills + Gachibowli | | 3 |
| Voice-query bot in Telugu/Hinglish — "cement stock enti?" → voice reply | `supabase/functions/voice_query/index.ts`, `src/lib/voiceQueryClient.js`, `tests/edge/voice_query.test.ts` | 2.5 |
| Close 2 more pilots from Sprint 1 pipeline | | 2 |
| Sprint 3 customer feedback loop — capture 20+ specific feature requests from 4 active pilots | | 2 |

**Success criteria**:
- 4 paid pilots active (INR 1,19,996 ARR floor)
- Daily 7am digest delivered to 4 promoter WhatsApp numbers for 7 consecutive days, ≥95% delivery success
- ≥20 captured customer requests in `PILOT_FEEDBACK_LOG`, prioritized for Sprint 4

### Sprint 4 — Handover-Packet Blockchain + RERA-TG Filing (Day 46-60)

**Goal**: Repurpose AuditAnchor.sol from "engineering ego" to "buyer-trust artifact" (mistake #9). Ship RERA-TG one-click filing assistant for design partners with active quarterly filings.

| Title | Files | Days |
|-------|-------|------|
| Handover-packet PDF generator with merkle root + on-chain anchor + QR code | `supabase/functions/handover_packet/index.ts`, `src/features/views/HandoverPacketView.jsx`, `contracts/AuditAnchor.sol`, `scripts/supabase/55_handover_packets.sql` | 4 |
| RERA-TG filing assistant — quarterly progress report auto-prefill + one-click submit | `supabase/functions/rera_tg_file/index.ts`, `src/features/views/RERATGFilingView.jsx`, `scripts/supabase/56_rera_tg_filings.sql`, `tests/edge/rera_tg_file.test.ts` | 4 |
| Per-org pricing weaponization — billing UI + "punishment-free supervisor add" calculator | `src/features/views/BillingView.jsx`, `src/components/SupervisorCalculator.jsx` | 2 |
| Close 2 more pilots (target: 6 total) | | 2.5 |
| Marquee pursuit — book 2 in-person meetings with My Home or Aparna or Sumadhura | | 2.5 |

**Success criteria**:
- ≥1 handover packet generated for real project with on-chain merkle anchor verifiable via public block explorer
- ≥1 RERA-TG quarterly filing submitted end-to-end for a pilot builder (not a test org)
- 6 paid pilots active (INR 1,79,994 ARR floor)
- ≥1 confirmed in-person meeting with a Hyderabad marquee builder (My Home / Aparna / Sumadhura)

### Sprint 5 — Marquee Close + First Contractor Hire (Day 61-75)

**Goal**: Convert 1 marquee Hyderabad builder pilot. Hire first contractor (Telugu QA + supervisor training). Reposition publicly with verified evidence.

| Title | Files | Days |
|-------|-------|------|
| Marquee proof-of-concept — 7-day pilot for My Home / Aparna / Sumadhura on a real active project | `scripts/seed_marquee_pilot.mjs` | 5 |
| Public website re-cut with VERIFIED moats only — drop UNVERIFIED gaps, lead with BuildNow + Telugu voice + 6 named pilot logos (with permission) | `apps/marketing/`, `public/case-studies/`, `docs/business/POSITIONING.md` | 3 |
| First contractor hire — Telugu QA + supervisor training contractor at INR 60K/mo | | 1.5 |
| Promoter peer-benchmark engine (anonymized cost-per-sqft vs Hyderabad peer builders) — needs ≥6 builders on platform | `supabase/functions/peer_benchmark/index.ts`, `src/features/views/PeerBenchmarkView.jsx`, `scripts/supabase/57_benchmark_aggregations.sql` | 3 |
| Sign 2 more pilots (target: 8 total) | | 2.5 |

**Success criteria**:
- ≥1 marquee Hyderabad builder (My Home / Aparna / Sumadhura / Vasavi / Lansum tier) in 7-day POC, with one named project on platform
- 8 paid pilots active (INR 2,39,992 ARR floor)
- Public website carries ≥6 named pilot logos with written permission
- First contractor onboarded, doing Telugu QA + supervisor training video production

### Sprint 6 — Marquee Conversion + Pro-Tier Migration + Series A Prep (Day 76-90)

**Goal**: Convert marquee POC into paid contract. Migrate first 2 pilots from INR 29,999 design-partner price to INR 49,999 Pro tier with verified value-evidence. Prepare Series A readiness pack with 10-builder ARR floor.

| Title | Files | Days |
|-------|-------|------|
| Marquee POC → paid contract conversion (target: INR 49,999 Pro tier minimum) | | 3 |
| Pilot → Pro tier migration script with auto-billing through Cashfree | `supabase/functions/tier_migration/index.ts`, `src/features/views/UpgradeView.jsx`, `scripts/supabase/58_tier_migrations.sql` | 2.5 |
| Co-authored case study with first marquee builder (1500-word, 4 quotes, 1 metric) | `public/case-studies/marquee_v1.html`, docs/business/CASE_STUDY_TEMPLATE.md | 2 |
| Series A readiness pack — ARR proof, 10-builder logo wall, BuildNow moat narrative, VERIFIED_GAPS_MATRIX as appendix | | 3 |
| Sign 2 more pilots (target: 10 total) | | 2.5 |
| Day 90 retro + v4 architecture decision doc | | 2 |

**Success criteria**:
- ≥1 marquee builder on signed Pro-tier contract (INR 49,999/yr minimum)
- ≥2 pilots migrated from INR 29,999 to INR 49,999 Pro tier
- 10 paid customers total — ARR floor INR 3,89,990 to INR 4,99,990 depending on tier mix
- Series A readiness pack reviewed by ≥2 external advisors

---

## 6. Success metrics by Day 90

Quantifiable targets, no founder-narrative inflation:

| Metric | Day 30 floor | Day 60 floor | Day 90 floor | Day 90 stretch |
|--------|-------------|-------------|-------------|----------------|
| Paid pilot contracts signed | 2 | 6 | 10 | 12 |
| ARR (INR) | 59,998 | 1,79,994 | 3,89,990 | 5,99,988 |
| Marquee Hyderabad logos (My Home/Aparna/Sumadhura/Vasavi/Lansum tier) | 0 | 0 | 1 | 2 |
| Customer interviews completed | 10 | 25 | 40 | 50 |
| `VERIFIED_GAPS_MATRIX` signed quotes | 8 | 20 | 30 | 40 |
| Stub features hidden from non-staff UI | 18+ | 21 | 21 | 21 |
| Sprint completion rate (success criteria met) | 1/1 | 3/3 | 6/6 | 6/6 |
| New features shipped (production-grade, customer-validated) | 1 (WhatsApp DPR) | 4 | 8 | 10 |
| Founder in-person builder meetings at Banjara Hills / Gachibowli / Kondapur | 5 | 12 | 20 | 25 |
| Repo: stub edge functions removed/promoted to production | 0 | 2 | 4 | 5 |
| Repo: SQL migrations frozen vs new | freeze | +4 | +10 | +12 |
| Co-authored case studies published | 0 | 0 | 1 | 2 |

**The one number that matters**: 1 marquee Hyderabad logo. Mistake #4 said the window is closing 6-12 months. Day 90 cannot pass without this.

---

## 7. Open questions to resolve

Inka clarity raalede kondari mida — research inconclusive lo unna prashnalu:

| # | Open question | Why it matters | How to resolve | By when |
|---|--------------|----------------|----------------|---------|
| 1 | Does Powerplay's product ACTUALLY lack RERA filing? (research Point 7, UNVERIFIED) | If they have it, "multi-state RERA" is not a moat — it's parity | 5 ex-Powerplay customer interviews, ask "how do you handle quarterly RERA progress reports today?" | Day 15 (Sprint 1) |
| 2 | Does Powerplay's product ACTUALLY lack GSTN e-invoice integration? | Same as above for Business tier | Same interview script | Day 15 |
| 3 | Does Powerplay's product ACTUALLY lack vernacular UI (Telugu voice)? | If they have translated strings but not voice, "Telugu voice" is still a moat | Specific interview question: "show me how you enter a daily report in Telugu" | Day 15 |
| 4 | Does Powerplay's product ACTUALLY lack on-chain audit anchoring? | Blockchain handover-packet pitch depends on this | Web search Powerplay + blockchain; ask in interviews | Day 15 |
| 5 | Will BuildNow Telangana grant API access to a private vendor (SiteTrack)? | If no, scrape-fallback is the only path, fragile | Meeting with TG IT dept via Hyderabad ecosystem connections | Day 30 (Sprint 2) |
| 6 | Will My Home / Aparna / Sumadhura / Vasavi / Lansum accept a founder cold-meeting in 14 days? | Marquee strategy hinges on this | Direct LinkedIn outreach to procurement heads + family-office introductions | Day 15 |
| 7 | What is the actual willingness-to-pay among Hyderabad mid-size builders at INR 49,999 Pro vs INR 89,999 Business? | Mistake #3 pricing fix depends on field data | 5 willingness-to-pay calls at INR 75k anchor before locking Sprint 4 billing | Day 15 |
| 8 | Will Bhashini API quality on Telugu site-supervisor voice be production-grade in basement-3G conditions? | Sprint 2 voice MVP depends on this | 1-day spike with real supervisor on a real Hyderabad site | Day 18 |
| 9 | Will AuditAnchor.sol gas costs on Polygon be viable for per-handover anchoring at scale? | Sprint 4 handover-packet depends on this | Cost modeling at 100 handovers/month, evaluate L2 alternatives | Day 50 |
| 10 | Will Powerplay launch BuildNow integration before Day 90? | Sprint 5 moat depends on first-mover | Monitor Powerplay marketing weekly; LinkedIn alerts for "BuildNow" + Powerplay employees | Continuous |
| 11 | Will the embedded-credit-in-Hyderabad March 2026 launch eat into mid-size builder budgets for SaaS? | If builders are credit-stretched, INR 49,999/yr Pro becomes harder sell | Interview question: "how does Powerplay credit change your annual SaaS budget?" | Day 30 |
| 12 | What is the actual size of the Hyderabad mid-size builder market (10-50 active projects, INR 100-500 cr annual revenue)? | TAM sizing for Series A pitch | RERA-TG registry pull + filtering by project count | Day 60 |

**Anchor rule for all open questions**: do NOT build a feature whose value depends on an unresolved open question. If question #1 stays UNVERIFIED through Sprint 4, RERA-TG filing assistant gets de-prioritized to Sprint 5 or killed.

---

*End of document. Total: 6 sprints, 10 paid customers, 1 marquee Hyderabad logo, INR 3.9-6L ARR floor by Day 90.*