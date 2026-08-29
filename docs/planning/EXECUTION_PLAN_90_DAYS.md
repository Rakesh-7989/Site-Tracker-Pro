# SiteTrack Pro — 90-Day Execution Plan (Day-by-Day, End-to-End)

Everything that's been planned, R&D'd, or scoped across Sessions 1-25 —
slotted into a 90-day calendar with day-level granularity. This is the
single source of truth for what to do, when, who owns it, what it costs,
and when it's done.

If you're picking up this plan cold, read **§1 Overview** first, then jump
to **§3 Pre-Flight (Day -3 to 0)** and start there. Every line should be
actionable; nothing is aspirational.

---

## §1 Overview — How to use this plan

**Two parallel tracks run for the full 90 days:**
- **A. Build track** — code, deploy, ship features (Days 1-90, you the founder)
- **B. Verification track** — 8-week vendor processes that must START on Day 1
  (WhatsApp Business, Cashfree merchant KYC, RERA TG access request)

Each daily entry has:
- **Goal**: what changes in the world by EOD
- **Steps**: 1-5 concrete actions
- **Owner**: YOU (default) / external (vendor / Meta / Cashfree / etc.)
- **Cost**: ₹ if any
- **Depends on**: prior day(s) that must complete first
- **DoD** (Definition of Done): the observable thing that says "done"

**Color codes used in section headers:**
- 🔴 **CRITICAL** — blocks customer onboarding; do not skip or delay
- 🟠 **HIGH** — significant revenue / risk impact
- 🟡 **MEDIUM** — important but reschedulable
- 🟢 **OPPORTUNISTIC** — fits if other work finishes early

**Maker vs manager day:**
- 🛠️ Maker — heads-down build (4-6 hrs uninterrupted)
- 📞 Manager — calls, emails, meetings (fragmented)
- ⏳ Wait — external dependency (use the time for low-energy work)

---

## §2 KPI Checkpoints

| Checkpoint | Day  | Target |
| ---------- | ---- | ------ |
| **Foundation done**  | 14   | Production Supabase live, two domains live, 3 internal testers signed in via magic link |
| **First paying customer** | 30 | ₹999/mo MRR from 1 design partner, Cashfree subscription active |
| **Product fit signal** | 60 | 5 paying customers (₹5-15k MRR), 1 written case study, 3 reference calls |
| **Series A readiness** | 90 | ₹40-50k MRR, 10 customers, demo video live, pitch deck v2, 3 angel commits |

If you miss a checkpoint by >50%, re-read **§9 Risk Register** and decide
whether to pivot, double-down, or pause.

---

## §3 Pre-Flight (Day -3 to Day 0) — Account applications

Start these 3 days BEFORE Day 1. Most are slow vendor processes — kicking
them off early means they're ready when you need them.

### Day -3 (Friday before launch week)
**Goal**: Submit every external-account application that takes >24h to provision.
- 📞 [9 AM] Open a Cashfree merchant account application. Complete KYC start
  (PAN, GST, bank, signed director letter). ETA: 5-7 business days.
- 📞 [10 AM] Apply for Razorpay (lighter KYC — for invoice one-off payments).
  Usually approved same-day.
- 📞 [11 AM] Buy domain **sitetrackpro.in** at GoDaddy or BigRock. ~₹800/year.
- 📞 [12 PM] Buy a corporate SIM card (Airtel/Jio business plan). This number
  will be the WhatsApp Business Account display number for the entire WABA
  lifetime — never use it for personal WhatsApp. Keep in a basic phone.
- 📞 [2 PM] Set up Vercel team + Supabase account if not already done. Both free.
- 📞 [4 PM] Begin Step 0 of `docs/setup/CONNECT_SUPABASE.md` — rotate ALL four
  leaked credentials (PAT `sbp_v0_…`, service_role JWT, sb_secret_…,
  sb_publishable_…). Even unused leaks are tomorrow's incident.
- ⏳ Wait notice: Cashfree KYC, Razorpay KYC, and (later) WhatsApp Business
  verification will pull on these.
- **DoD**: 4 accounts submitted, domain purchased, SIM in hand, all leaked
  credentials revoked.

### Day -2 (Saturday)
**Goal**: Local environment ready + content drafts.
- 🛠️ [Morning] `git pull` latest. `npm install`. `npm run setup`. `npm test`
  (expect 2000+/2000+). `npm run check:mcp`.
- 🛠️ [Afternoon] Draft a 200-word company-overview text for Meta WhatsApp
  Business application (business description). Write authorised signatory
  letter on company letterhead, sign + scan.
- 📞 List 50 RERA-registered builders in Hyderabad with publicly visible
  contact info (RERA portal + LinkedIn). Save to a spreadsheet — this is
  your Week 5 outreach list.
- **DoD**: Tests green locally, Meta letter signed + scanned, 50-builder list compiled.

### Day -1 (Sunday)
**Goal**: Buffer day — catch up on anything from Day -3/-2 that slipped.
- 🛠️ Review the entire stack lo last commit (`git log --oneline | head -30`)
- 🛠️ Run `npm run dev` and click through the app end-to-end as architect, PM,
  contractor, client, orgadmin. Catch any obvious bugs.
- 📞 If Cashfree / Razorpay want more docs, respond within 2 hours of the
  weekend support window.
- **DoD**: One full happy-path walkthrough completed locally.

### Day 0 (Monday — launch week begins)
**Goal**: Everything in place to start Day 1 work without blockers.
- 📞 Confirm Cashfree KYC review status. If "needs more info" — respond same-day.
- 📞 Apply for Meta Business Manager account at business.facebook.com.
  Submit Certificate of Incorporation + utility bill (last 3 months).
  ETA: 5-10 business days for the verification call.
- 🛠️ Set up `.env.mcp` with Supabase PAT + GitHub PAT + project_ref so the
  MCP toolkit works for the build track.
- ⏳ **Wait posture**: Meta + Cashfree + RERA TG access will take 2-8 weeks
  EACH. While they cook, build code-only features (Days 1-30).
- **DoD**: Meta application filed, MCP creds set, ready for Day 1.

---

## §4 Phase 1 — Days 1-14: Production Foundation 🔴

**Phase goal**: First end-to-end paying-customer-ready deployment. Real
database, real auth, two live domains, 3 internal testers signing in via
magic link without breaking.

### Day 1 (Monday)
**Goal**: Supabase project provisioned + base schema applied.
- 🛠️ [9-11 AM] Follow `docs/setup/CONNECT_SUPABASE.md` Step 1: create fresh
  Supabase project in **Mumbai (ap-south-1)** region. Strong DB password
  to 1Password. Save Project URL + anon key + service_role key + DB
  connection string.
- 🛠️ [11 AM - 1 PM] Run the 5 base SQL files via psql:
  ```bash
  psql "$SUPABASE_DB_URL" -f scripts/supabase/01_schema.sql
  psql "$SUPABASE_DB_URL" -f scripts/supabase/02_rls.sql
  psql "$SUPABASE_DB_URL" -f scripts/supabase/03_rls_phase1.sql
  psql "$SUPABASE_DB_URL" -f scripts/supabase/04_rls_tests.sql
  psql "$SUPABASE_DB_URL" -f scripts/supabase/05_rls_phase1_tests.sql
  ```
  Expect 18 PASS lines from the first test + 24+ from the second.
- 🛠️ [2-4 PM] Run the v2 + miss-fix migrations:
  ```bash
  psql "$SUPABASE_DB_URL" -f scripts/supabase/06_project_types.sql
  psql "$SUPABASE_DB_URL" -f scripts/supabase/07_role_expansion.sql
  psql "$SUPABASE_DB_URL" -f scripts/supabase/08_project_archive.sql
  ```
- 🛠️ [4-5 PM] `cp .env.example .env.local`. Fill URL + anon key + set
  `VITE_BACKEND=supabase`. `npm run check:supabase` — expect 9/9 PASS.
- 🛠️ [5-6 PM] `npm run dev` locally. Magic-link auth flow works end-to-end.
  SQL-promote yourself to superadmin.
- **DoD**: Local dev points at real Supabase, magic link works, you are superadmin in the live DB.

### Day 2 (Tuesday)
**Goal**: App deployed to `sitetrackpro.in`.
- 🛠️ [9-11 AM] `vercel login`. From repo root `vercel --prod` (project
  name: `sitetrack-app`). When prompted, accept the existing `vercel.json`.
- 🛠️ [11 AM - 12 PM] Vercel dashboard → Project Settings → Environment
  Variables. Add for Production:
  - `VITE_BACKEND=supabase`
  - `VITE_SUPABASE_URL=https://<your-project>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=<anon>`
- 🛠️ [12 - 1 PM] Redeploy so env takes effect. Add domain `sitetrackpro.in`.
  Update DNS at registrar with the CNAME Vercel shows.
- 🛠️ [2-3 PM] Wait for DNS propagation (~minutes to ~hours). Test
  `https://sitetrackpro.in` from your phone (mobile network bypasses any
  local DNS cache).
- 🛠️ [3-5 PM] Topbar pill should show green **DB Live**. Sign in via magic
  link from a clean browser session — works.
- 📞 [5-6 PM] Forward the Cashfree KYC reminder if no update yet.
- **DoD**: sitetrackpro.in is live with HTTPS, topbar pill green, magic-link login works.

### Day 3 (Wednesday)
**Goal**: Marketing site deployed to `sitetrackpro.in`.
- 🛠️ [9-11 AM] `cd marketing && vercel --prod` (project name:
  `sitetrack-marketing`). Add domains `sitetrackpro.in` AND `www.sitetrackpro.in`
  (with `www` redirecting to apex).
- 🛠️ [11 AM - 1 PM] DNS records at registrar. A record for apex, CNAME for
  www. Wait for propagation.
- 🛠️ [2-3 PM] Verify the landing page's CTAs (`Start free trial`, `Sign in`)
  resolve to `sitetrackpro.in`. Cross-domain navigation works.
- 🛠️ [3-5 PM] Replace placeholder phone number + email in
  `archive/marketing/index.html`. Replace pricing if needed. Re-deploy.
- 📞 [5-6 PM] Apply for Google Search Console + submit `sitetrackpro.in/sitemap.xml`
  (the landing is one page, so sitemap is trivial but submit anyway).
- **DoD**: sitetrackpro.in landing live, all CTAs work, GSC verification submitted.

### Day 4 (Thursday)
**Goal**: Edge Functions for Cashfree deployed (test mode).
- 🛠️ [9-12 AM] `supabase login` + `supabase link --project-ref <ref>`.
  Deploy both functions:
  ```bash
  supabase functions deploy cashfree-subscription
  supabase functions deploy cashfree-webhook --no-verify-jwt
  ```
- 🛠️ [12 - 2 PM] Supabase dashboard → Edge Functions → Secrets. Add
  `CORS_ALLOWED_ORIGINS=https://sitetrackpro.in,https://sitetrackpro.in`.
  Leave `CASHFREE_WEBHOOK_SECRET` empty until Day 8 (real Cashfree active).
- 🛠️ [2-4 PM] Local curl test against the deployed `cashfree-subscription`:
  ```bash
  curl -X POST https://<proj>.supabase.co/functions/v1/cashfree-subscription \
    -H "Authorization: Bearer <YOUR JWT from app>" \
    -H "Content-Type: application/json" \
    -d '{"org_id":"<your-org-uuid>","plan":"pro","return_url":"https://sitetrackpro.in/"}'
  ```
  Should return `400 Cashfree not configured` — correct (we have no creds yet).
- 🛠️ [4-6 PM] Re-run `npm test` against production env to confirm nothing
  cross-broke. `npx vitest run` — expect 2000+/2000+.
- **DoD**: Both Edge Functions deployed; subscription EF responds with
  documented error; no test regressions.

### Day 5 (Friday) — Buffer + retro
**Goal**: Catch up + week 1 retrospective.
- 🛠️ [Morning] Fix anything broken from Days 1-4. Update domain TXT records
  if anything failed (TXT for SPF, DKIM if email is set up).
- 📞 [Afternoon] Personal check-in: am I on track for Day 14 paying-customer-
  ready? If not, slip non-blocking work (mobile build, vendor marketplace)
  before slipping foundation work.
- 📞 [4-5 PM] Send Cashfree + Razorpay a polite reminder if no KYC update.
- 🟢 If finished early: scope out the BIM viewer integration (Forge / Autodesk
  APS) — research partnership terms.
- **DoD**: Week 1 retro written into a brief note: what shipped, what slipped, what's next.

### Day 6 (Saturday) — Wait day
**Goal**: Use cheap-energy time for content + non-build work.
- 📞 [Morning] Set up support inbox `hello@sitetrackpro.in` (Google Workspace
  ~$6/mo) + auto-responder. Forward to your real inbox.
- 📞 Polish the landing page copy after re-reading aloud — typos, tone,
  CTA strength. Push fixes.
- 🟢 Draft 3 LinkedIn posts you'll publish in Week 5: (a) "We built it",
  (b) "Per-org vs per-user pricing", (c) "Our type-gated approach".
- **DoD**: Inbox live, polished copy deployed, 3 LinkedIn drafts in Notion.

### Day 7 (Sunday) — Rest
- 🟢 No build work. Recover. Plan Week 2 in the morning.

### Day 8 (Monday)
**Goal**: Cashfree merchant approved (✅ external trigger) — wire real subscription billing.
- ⏳ Cashfree should be approved by today (Day -3 + 7 business days). If not,
  escalate via dashboard support.
- 🛠️ [9-11 AM] Generate Cashfree app_id + secret. Create webhook secret.
  Whitelist webhook URL.
- 🛠️ [11 AM - 1 PM] Create the 3 plans in Cashfree dashboard:
  - `sitetrack_basic_monthly` — ₹999
  - `sitetrack_pro_monthly` — ₹2,999
  - `sitetrack_business_monthly` — ₹7,999
- 🛠️ [2-3 PM] Sign in to sitetrackpro.in as orgadmin → My Org →
  Integrations → Cashfree → paste app_id + secret + env="sandbox".
- 🛠️ [3-4 PM] Set `CASHFREE_WEBHOOK_SECRET` in Supabase EF Secrets.
- 🛠️ [4-6 PM] Test the full flow: Org Admin → Billing → Upgrade to Pro →
  Cashfree mandate UI opens (sandbox) → use test UPI ID `success@upi` →
  webhook fires → DB subscription row flips to `active` → audit_log_v2
  gets a PAYMENT entry.
- **DoD**: One sandbox subscription created end-to-end with audit trail.

### Day 9 (Tuesday)
**Goal**: Migrate to Cashfree production mode (still your own test org).
- 🛠️ [9-11 AM] Switch the org's Cashfree integration row to `env="production"`.
- 🛠️ [11 AM - 1 PM] Upgrade your test org's subscription with a real UPI ID
  (your own ₹999/mo charge). Yes, you'll pay yourself for now — costs
  ~₹1k to validate. Receipts go into a folder for accounting.
- 🛠️ [2-4 PM] Confirm webhook works in production. View the
  `subscriptions` row + audit trail. Take screenshots — these become demo
  assets.
- 🛠️ [4-6 PM] Wire `OrgBillingView` to show subscription status from the
  database (not from `orgs.plan`) so it reflects reality.
- **DoD**: One production Cashfree subscription active (yourself); receipts captured.

### Day 10 (Wednesday)
**Goal**: Mobile app — first signed `.aab` built.
- 🛠️ [9-11 AM] `npm i -D @capacitor/core @capacitor/cli @capacitor/android`
  + `@capacitor/splash-screen @capacitor/camera @capacitor/geolocation`.
  `npx cap init --skip-appid` then `npx cap add android`.
- 🛠️ [11 AM - 1 PM] `npm run build && npx cap sync android`. Open
  `android/` in Android Studio. Resolve any Gradle sync issues.
- 🛠️ [2-3 PM] Generate release keystore per `docs/setup/PLAY_STORE_PREP.md` Step 3.
  **Back up to 1Password + 1 USB + 1 external HDD.**
- 🛠️ [3-5 PM] Wire signed build config in `android/app/build.gradle`. Export
  env vars + run `./gradlew bundleRelease`. Outputs `app-release.aab`.
- 🛠️ [5-6 PM] Sideload via bundletool → universal APK → `adb install`.
  Smoke test on a real Android phone.
- **DoD**: Signed `.aab` built; sideloaded universal APK opens + magic-link login works on phone.

### Day 11 (Thursday)
**Goal**: Play Store internal track listing live.
- 🛠️ [9-12 AM] Pay $25 Play Console signup if not already done. Create
  app listing per `docs/setup/PLAY_STORE_PREP.md` Step 6.
- 🛠️ [12-2 PM] Take phone screenshots (login, Org Dashboard, project detail
  with BOQ tab, drawing release). Generate 512×512 icon + 1024×500 feature
  graphic.
- 🛠️ [2-4 PM] Fill the Data Safety form + Content Rating questionnaire per
  the runbook. Upload the `.aab` to Internal Testing track.
- 🛠️ [4-6 PM] Add 5 internal testers (your email + 4 friends). Submit
  for review. Usually approved in 4-8 hours.
- ⏳ [Overnight] Google reviews the internal track build.
- **DoD**: Listing live in Internal Testing; review in flight.

### Day 12 (Friday)
**Goal**: Internal testers installing + reporting.
- ⏳ Google review usually complete by 9 AM Friday. If approved, internal
  testers get opt-in URL.
- 🛠️ [10 AM - 12 PM] Install on your own phone via the Play Store URL.
  Full happy-path walkthrough.
- 📞 [Afternoon] Email the 4 internal testers with a simple feedback form
  (Google Form): "Did login work? Could you create a project? Any crashes?"
- 🛠️ [4-6 PM] Wire in-app updates per `docs/setup/PLAY_STORE_PREP.md` Step 8.
  Add the `@capacitor-community/in-app-update` package + plugin.
- 🟢 If time: write Sentry init code (deferred until Day 25 — just stub).
- **DoD**: 4 testers installed; in-app update flow wired.

### Day 13 (Saturday) — Wait + content
- 📞 Polish demo video script — read aloud, cut 30 seconds.
- 📞 Reach out to 2-3 video editors on Fiverr/Behance for the demo video
  shoot. Goal: hire by Day 17.
- 🟢 Brainstorm 10 LinkedIn cold DMs for Week 5. Save to Notion.
- **DoD**: 2 editor quotes received; cold-DM messages drafted.

### Day 14 (Sunday) — Phase 1 retrospective
**Goal**: Confirm Phase 1 DoD.
- 📞 [Morning] Check each KPI:
  - ✅ sitetrackpro.in HTTPS green padlock
  - ✅ Magic-link login works
  - ✅ Cashfree subscription live on your test org
  - ✅ `.aab` in Internal Testing
  - ✅ Marketing site live
  - ✅ 3 internal testers signed in
- 📞 If any fail: do NOT proceed to Phase 2 until they pass. The blockers
  cascade.
- **DoD**: Phase 1 retrospective doc written. Decision recorded: go / no-go for Phase 2.

---

## §5 Phase 2 — Days 15-30: Real Integrations 🟠

**Phase goal**: All the "claim-truth alignment" items from the comparison
doc §17 ship as real, deployed, working systems. After this phase,
nothing in our marketing is theoretical.

### Day 15 (Monday)
**Goal**: Blockchain anchor — Solidity contract written + deployed to Polygon Mumbai.
- 🛠️ [9-12 AM] Write `contracts/SiteTrackAnchor.sol`:
  ```solidity
  pragma solidity ^0.8.20;
  contract SiteTrackAnchor {
    event Anchored(bytes32 indexed root, uint256 ts, address indexed by);
    function anchor(bytes32 root) external {
      emit Anchored(root, block.timestamp, msg.sender);
    }
  }
  ```
- 🛠️ [12-2 PM] `npm i -D hardhat ethers`. Init Hardhat project. Compile the
  contract. Verify selector `keccak256("anchor(bytes32)")` = `0xeecdf927`
  matches our lib.
- 🛠️ [2-3 PM] Deploy to Polygon Amoy (Mumbai retired) testnet:
  - Get test MATIC from `https://faucet.polygon.technology/`
  - `npx hardhat run scripts/deploy.js --network amoy`
- 🛠️ [3-4 PM] Save contract address. Update `src/lib/integrations/blockchainAnchor.ts`
  if needed — confirm `polygonAdapter` works with the real address.
- 🛠️ [4-5 PM] Write end-to-end test: anchor a fake Merkle root, verify
  the `Anchored` event on Polygonscan Amoy.
- 🛠️ [5-6 PM] Write — operator runbook
  with contract address, gas estimate, daily cron schedule.
- **DoD**: One real on-chain anchor visible at amoy.polygonscan.com.

### Day 16 (Tuesday)
**Goal**: Polygon mainnet deploy + daily cron.
- 🛠️ [9-11 AM] Acquire ~$5 worth of real MATIC at an Indian exchange
  (WazirX / CoinDCX). Send to your Hardhat deployer wallet.
- 🛠️ [11-12 PM] Deploy contract to Polygon mainnet (same code, different
  RPC URL). Save mainnet address.
- 🛠️ [12-2 PM] Write Supabase Edge Function `supabase/functions/anchor-audit-daily/`:
  ```ts
  // Runs daily via pg_cron. Reads yesterday's audit_log_v2 rows, builds
  // Merkle root via `_shared/blockchainAnchor.ts`, calls polygonAdapter,
  // stores tx_hash in a new `audit_anchors` table.
  ```
- 🛠️ [2-4 PM] Add `audit_anchors` table via migration `09_audit_anchors.sql`:
  ```sql
  create table audit_anchors (
    day date primary key,
    root_hex text not null,
    tx_hash text not null,
    block_number bigint,
    rows_count integer,
    created_at timestamptz default now()
  );
  ```
- 🛠️ [4-5 PM] Set up pg_cron schedule:
  ```sql
  select cron.schedule(
    'daily-audit-anchor',
    '0 1 * * *',  -- 1 AM IST daily
    $$ select net.http_post(url := 'https://<proj>.supabase.co/functions/v1/anchor-audit-daily') $$
  );
  ```
- 🛠️ [5-6 PM] Manually trigger the EF once — verify a row appears in
  `audit_anchors` + a tx on Polygonscan.
- **DoD**: Daily anchoring live, first mainnet tx visible.

### Day 17 (Wednesday)
**Goal**: WhatsApp Business — accept Meta's verification call.
- ⏳ Meta call usually lands Day 14-21 after Day 0 application. Pick up.
- 📞 [Morning] Verify your business identity over the call. Confirm
  address + authorised signatory details match documents.
- ⏳ Meta confirms verification within 24-48 hours after the call.
- 🛠️ [Afternoon] While waiting, build the WhatsApp Business message-template
  drafts per `docs/archive/WHATSAPP_BUSINESS_API.md`. Submit all 6 templates × 3
  languages = 18 submissions for parallel review.
- **DoD**: 18 templates queued for review.

### Day 18 (Thursday)
**Goal**: RERA TG portal — request a test account or scrape via your own builder relationship.
- 📞 [Morning] Contact TG RERA office. Request a test account OR access via
  your network — find a builder who'll let you observe a real filing.
- 🟡 If no test account: build the scraper in **shadow mode** — log every
  step, never actually submit. This is the next-best preparation.
- 🛠️ [Afternoon] Write `supabase/functions/tg-rera-submit/` real
  implementation using Playwright on Deno:
  ```ts
  // Uses puppeteer-core + chromium via @sparticuz/chromium for Deno-on-Edge
  // OR delegates to a tiny Render Node.js sidecar if Deno Chrome fails.
  ```
- 🛠️ Implement `/status` endpoint — public TG RERA status check, no login.
- 🛠️ Implement `/submit` endpoint — login, OTP request (out-of-band SMS
  back to operator), navigate to monthly progress form, fill + submit,
  screenshot ack page.
- 🛠️ Toggle `TG_RERA_SCRAPER_ENABLED=true` ONLY when you have a real test
  account approval.
- **DoD**: Real scraper deployable; shadow mode tested or first live filing successful.

### Day 19 (Friday)
**Goal**: WhatsApp templates approved + first DPR sent.
- ⏳ Meta typically approves utility templates in 1-3 days.
- 🛠️ [Once approved] Pull `template_id` for each approved template into
  `org_integrations.whatsapp.template_ids`.
- 🛠️ Write `supabase/functions/send-dpr-whatsapp/` Edge Function that
  builds the DPR PDF + posts to Meta WhatsApp Business API at 6 PM IST.
- 🛠️ Wire pg_cron schedule:
  ```sql
  select cron.schedule(
    'daily-dpr-whatsapp',
    '0 12 * * *', -- 12:00 UTC = 5:30 PM IST
    $$ select net.http_post(url := '<send-dpr-whatsapp>') $$
  );
  ```
- 🛠️ Manual test: trigger EF for your test org's project. WhatsApp arrives
  on your verified test number.
- **DoD**: One real WhatsApp DPR sent at 6 PM, archived in audit log.

### Day 20 (Saturday) — Wait day
- 📞 If WhatsApp templates still pending: read Meta's policy doc + adjust
  any rejected wordings.
- 📞 If demo video editor signed: shoot the screen-recording portions per
  `docs/business/DEMO_VIDEO_SCRIPT.md`. Use a clean browser session + the demo
  data loaded.
- **DoD**: Screen recordings captured.

### Day 21 (Sunday) — Rest

### Day 22 (Monday)
**Goal**: Competitor-migration script — Powerplay → SiteTrack.
- 🛠️ [9-12 AM] Sign up for Powerplay's free trial. Create a project, add
  a few BOQ rows, drawings, DPRs. Export the data as CSV (Powerplay has
  CSV exports for most tabs).
- 🛠️ [12-3 PM] Write `src/lib/importPowerplay.js`:
  ```js
  // Reads each Powerplay CSV (projects.csv, boq.csv, daily_reports.csv,
  // drawings.csv, issues.csv) and maps to our schema.
  ```
- 🛠️ [3-5 PM] Build an OrgAdmin → "Migrate from Powerplay" panel that
  accepts a zip of CSVs, runs the mapper, shows preview, commits.
- 🛠️ [5-6 PM] Tests — supply known-good Powerplay CSVs as fixtures.
- **DoD**: Powerplay → SiteTrack migration produces a working project.

### Day 23 (Tuesday)
**Goal**: Bug-fix day + integration polish.
- 🛠️ [9-12 AM] Run `npm test`. Fix any new failures.
- 🛠️ [12-3 PM] Hit the staging deploy hard — every role, every tab,
  every project type. Note any UI bugs.
- 🛠️ [3-6 PM] Fix the top 5 highest-impact bugs.
- **DoD**: Test count never decreases; no critical UX bugs remain.

### Day 24 (Wednesday)
**Goal**: AI-recommended scope (LLM suggests feature toggles to disable based on usage).
- 🛠️ [9-12 AM] Add `feature_usage_log` table — records timestamp every
  time a feature is rendered. Lightweight, async.
- 🛠️ [12-3 PM] Edge Function `analyse-feature-usage` runs weekly per org.
  Aggregates usage, identifies features with <2 opens in 30 days, sends
  to LLM ("Suggest which to disable"), persists recommendations.
- 🛠️ [3-5 PM] Add a banner to OrgFeatureSettingsView: "3 features unused
  this month — review recommendations".
- **DoD**: Recommendation banner appears for the test org after analysing 30 days of usage.

### Day 25 (Thursday)
**Goal**: Sentry monitoring live.
- 🛠️ [9-11 AM] Sign up for Sentry (free tier — 5k errors/mo). Create a
  React project. Copy the DSN.
- 🛠️ [11-1 PM] `npm i @sentry/react`. Init in `src/main.tsx`:
  ```jsx
  import * as Sentry from "@sentry/react";
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, tracesSampleRate: 0.1 });
  ```
- 🛠️ [1-3 PM] Wrap `ErrorBoundary` with `Sentry.ErrorBoundary` so the
  boundary's caught errors land in Sentry.
- 🛠️ [3-5 PM] Add Sentry DSN to Vercel env. Update CSP `connect-src` in
  `vercel.json` to add `https://*.ingest.sentry.io`.
- 🛠️ [5-6 PM] Trigger a deliberate error from devtools — verify it lands
  in Sentry within 30 seconds.
- **DoD**: Sentry receives errors from sitetrackpro.in.

### Day 26 (Friday)
**Goal**: Production-readiness checklist run-through.
- 🛠️ [9-12 AM] Walk through `docs/architecture/PRODUCTION_RLS.md` final checklist.
  Re-run all SQL test matrices. Every line PASS.
- 🛠️ [12-3 PM] Run `npm run check:supabase` + `npm run check:mcp` +
  full Playwright E2E suite.
- 🛠️ [3-6 PM] Write a "what to do if X breaks" runbook for the most
  likely operational incidents: Cashfree webhook 401 / WhatsApp template
  rejection / Polygon RPC down / Supabase project paused.
- **DoD**: written, all gates green.

### Day 27 (Saturday)
- 📞 Demo video — review first cut from editor. Send feedback.
- 📞 Pitch deck — refine numbers based on real Cashfree subscription + audit anchor stats.

### Day 28 (Sunday) — Rest

### Day 29 (Monday) — Phase 2 retrospective
- 📞 Confirm:
  - ✅ Polygon mainnet anchoring live
  - ✅ WhatsApp DPRs sending
  - ✅ RERA scraper deployed (shadow or live)
  - ✅ Competitor migration works
  - ✅ Sentry monitoring active
- **DoD**: Phase 2 retro written, decision recorded.

### Day 30 (Tuesday) — Phase 2 buffer + Phase 3 prep
- 🛠️ Catch up on any Phase 2 slips.
- 📞 Prep the cold-DM list: refine the 50 builders to top 20 highest-fit.
- **DoD**: Ready for outreach Day 31.

---

## §6 Phase 3 — Days 31-45: First Paying Customer 🔴

**Phase goal**: Convert the first design partner. Real ₹999/mo subscription
not from yourself.

### Day 31 (Wednesday)
**Goal**: CREDAI Hyderabad introduction.
- 📞 Use your network to get an intro to CREDAI Hyderabad president or
  any board member. Send a 1-page brief with: problem, solution, who you
  are, ask (15-min meeting).
- 📞 In parallel, cold-DM the top 5 builders on your list via LinkedIn.
  Each message: 80 words, 1 sentence on problem, 1 on solution, ask for
  15 min Friday.
- **DoD**: 1 CREDAI intro request sent, 5 cold-DMs sent.

### Day 32 (Thursday)
**Goal**: 5 more cold-DMs + follow up Day 31.
- 📞 5 more DMs (different 5 builders).
- 📞 Follow up Day 31's CREDAI intro.
- 📞 Reply to any Day 31 responses with calendar links.
- **DoD**: 10 outreach messages total in flight.

### Day 33 (Friday)
**Goal**: First demo call.
- 📞 First 15-min Zoom with whoever responded. Run the demo per the
  demo video script (live). Goal of this call: book a follow-up where
  THEY are using SiteTrack on their own project for 30 days free.
- 🛠️ If they say yes: provision them an org via Supabase admin, paste
  their RERA number, walk them through onboarding wizard.
- **DoD**: 1 design-partner conversation completed.

### Days 34-37 (Sat-Tue)
- 📞 Daily routine: 5 cold-DMs/day, 1-2 demo calls/day, follow up the
  previous day's no-shows.
- 🛠️ Live in-app fixes for any issues design partners flag.
- 📞 By Day 37: aim for 3 design partners signed up.

### Day 38 (Wednesday)
**Goal**: First design partner uses it on a real site for 1 week. Iterate fast.
- 📞 Daily 5-min check-in with design partner — what worked, what broke,
  what missing feature would unlock daily use.
- 🛠️ Same-day fix turnaround on any P0/P1 issue. Bug fix → commit →
  Vercel auto-deploy → tell them in WhatsApp.
- **DoD**: Design partner uses SiteTrack daily for 7 consecutive days.

### Day 39-42 (Thu-Sun)
- 📞 Continue daily check-ins.
- 🛠️ Ship 2-3 quick wins discovered from the design partner — these
  become "you said it, we built it" credibility moments.
- 📞 Start the conversion ask: "After your 30-day trial, would you pay
  ₹999/month?"

### Day 43 (Monday)
**Goal**: First conversion.
- 📞 Walk the design partner through Cashfree mandate setup. They paste
  their own UPI ID. First ₹999/mo subscription that isn't yours.
- 🛠️ Confirm the subscription row + audit trail + first invoice.
- 📞 Send a thank-you email + a $25 Amazon voucher (₹2k goodwill spend).
- **DoD**: 1 paying customer at ₹999/mo. MRR > 0.

### Day 44 (Tuesday)
**Goal**: Case study draft.
- 📞 30-min interview with the customer. Use `docs/business/CASE_STUDY_TEMPLATE.md`
  as prompts.
- 🛠️ Draft case study by EOD. Goal: PUBLISH by Day 50.
- **DoD**: First draft of case study written.

### Day 45 (Wednesday) — Phase 3 retrospective
- 📞 Phase 3 retrospective. KPI hit?
  - ✅ 1+ paying customer
  - ⚠️ Target was 3 by Day 45 — track variance
- **DoD**: Phase 3 retro doc.

---

## §7 Phase 4 — Days 46-60: Marketing Engine + Investor 🟠

### Day 46 (Thursday)
**Goal**: Demo video FINAL cut shipped.
- 📞 Approve final cut from editor. Upload to YouTube + LinkedIn + embed
  on `sitetrackpro.in` hero.
- **DoD**: Video live on all 3 surfaces.

### Day 47 (Friday)
**Goal**: First investor email.
- 📞 Send pitch deck (`docs/pitch/SiteTrack-Pitch-Deck.pptx`) + demo
  video link + traction numbers (1 paying customer, MRR, audit anchors)
  to 5 angel investors in your network.
- **DoD**: 5 angel emails sent.

### Day 48-50 (Sat-Mon)
- 📞 Case study published at sitetrackpro.in/customers.
- 📞 Share case study on LinkedIn + WhatsApp groups.
- 🛠️ SEO Tag 1: "How to file RERA monthly progress in 5 minutes" — 800
  word blog post on sitetrackpro.in/blog.

### Day 51 (Tuesday)
**Goal**: 2nd + 3rd paying customers.
- 📞 Convert the 2 other design partners from Days 34-37.
- 📞 Continue 5 cold-DMs/day.
- **DoD**: 3 total paying customers, MRR ₹3k.

### Day 52-55 (Wed-Sat)
- 📞 Investor follow-ups. Aim for 2-3 calls.
- 🛠️ Self-serve signup flow: anyone with a real email can create an org
  + start their 14-day trial without your involvement.
- 🛠️ Tests for self-serve.

### Day 56 (Sunday) — Rest

### Day 57 (Monday)
**Goal**: Self-serve signup LIVE.
- 🛠️ Deploy self-serve. Test it once with a clean email.
- 📞 Update LinkedIn + Twitter — "Self-serve trial now live at sitetrackpro.in".
- **DoD**: Anyone can sign up without manual provisioning.

### Day 58-60 (Tue-Thu)
- 🛠️ SEO Tag 2: "How to make a BOQ — Indian construction standard". 1200 words.
- 🛠️ SEO Tag 3: "Procore vs Powerplay vs SiteTrack — feature comparison".
- 📞 Aim for 5 paying customers by Day 60 (₹5k MRR).
- **DoD**: 3 SEO posts live, 5 paying customers.

---

## §8 Phase 5 — Days 61-90: Scale Prep 🟡

### Days 61-65: Vendor Marketplace MVP
- 🛠️ Wire real material price adapters (1-2 vendor APIs, not mocks).
  Each vendor: ₹0 partner fee for first 10 SiteTrack customers in
  exchange for being a launch partner.
- 🛠️ Vendor portal UI for the `vendor` role.

### Days 66-70: Open-Source 19 Pure Libs
- 🛠️ Extract `src/lib/{permissions,audit,hierarchy,branding,compliance,
  planGating,dailySnapshot,aiForecast,whatsapp,i18n,exports,delegations,
  materialPrices,approvalChains,orgIntegrations,templates,orgFeatureFlags,
  cashfree,blockchainAnchor,reraTelangana,contractors,boqImport,
  projectArchive}.js` → standalone `@sitetrack/*` npm packages.
- 🛠️ MIT license, README per package, GitHub Actions CI.
- 📞 Announce on Hacker News + r/india + dev.to.

### Days 71-75: Enterprise SSO
- 🛠️ Supabase Auth SAML support is enterprise-tier. Either upgrade to
  Supabase Team plan ($599/mo) OR roll your own via the
  `passport-saml` pattern + custom auth flow.
- 🛠️ Add SSO config to OrgIntegrations panel.

### Days 76-80: Custom Field Engine
- 🛠️ Per-org custom fields on projects, BOQ lines, issues, RFIs.
  JSONB column + UI rendering by field type.

### Days 81-85: Drawing-Diff Overlay
- 🛠️ Side-by-side rev A vs rev B view. PDF.js for rendering both.
  Diff highlighting via pixel-level comparison.

### Days 86-88: GSTN E-Invoicing + Auto-PF/ESI
- 🛠️ GSTN sandbox account. e-Invoice API push from Invoice tab.
- 🛠️ Form 6 auto-generation from labour register → EPFO portal upload.

### Day 89 (Investor day)
- 📞 Series A meeting prep + 2-3 meetings.

### Day 90 (Sunday) — 90-day retrospective
- 📞 Final KPI check:
  - 10 customers (₹40-50k MRR)
  - Demo video live
  - Case study published
  - 3 angel commits OR 1 lead investor
  - Self-serve signup live
- 📞 Decide next 90 days: double-down on growth OR raise Series A.

---

## §9 Parallel 8-Week Tracks

These run alongside the daily plan. Start trigger noted; check-in cadence
noted. Do NOT block on them; build code-only features in the wait gaps.

| Track | Day started | Cadence | Done by |
| ----- | ----------- | ------- | ------- |
| Cashfree merchant KYC | Day -3 | Daily ping until approved | Day 8 |
| Razorpay merchant KYC | Day -3 | 1 week check | Day 5 |
| Meta Business Manager verification | Day 0 | Weekly | Day 14-21 |
| WhatsApp Business template approval | Day 17 | Daily | Day 19-21 |
| Google Play internal track review | Day 11 | Same-day | Day 12 |
| Polygon mainnet contract deploy | Day 16 | One-shot | Day 16 |
| Supabase Team plan upgrade (for SAML) | Day 71 | One-shot | Day 71 |

---

## §10 Risk Register

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| Cashfree KYC rejected | 15% | 1-week delay | Razorpay subscriptions as fallback (lower features but works) |
| WhatsApp templates all rejected | 25% | 2-week delay | Fall back to wa.me deep links for another month while iterating wording |
| Polygon mainnet tx fees spike | 10% | ~₹500 extra cost | Anchor every 2 days instead of daily; or batch to weekly |
| First design partner cancels mid-trial | 30% | Retro confidence hit | Have 2-3 partners in parallel; no single-customer dependency |
| Cold-DM response rate <2% | 50% | Slower signups | Pivot to CREDAI partnership + content SEO faster |
| Mobile app rejected by Google | 10% | 1-week delay | Internal track first; production is downstream |
| TG RERA portal blocks scraper IPs | 40% | RERA filing unreliable | Run from rotating residential IPs OR document manual fallback in app |
| Founder burnout | 30% | Plan slip | Hard Sunday rule; 1 day off per week minimum |

---

## §11 Budget — 90 Days

| Line item | Cost (₹) | When |
| --------- | -------- | ---- |
| Cashfree KYC + first sub | 1,000 | Day -3, Day 9 |
| Domain sitetrackpro.in | 800 | Day -3 |
| Corporate SIM + plan | 1,500 | Day -3 |
| Google Play Console signup | 2,100 ($25) | Day 11 |
| Vercel Pro (after free tier) | 0 | Free until ~100 GB bandwidth/mo |
| Supabase free tier | 0 | Until 500MB DB or 50k MAU |
| Cashfree subscription billing | ~₹0 (margin from customers) | Day 8+ |
| Polygon MATIC + gas | 500 ($5) | Day 16, replenish quarterly |
| Sentry free tier | 0 | Until 5k errors/mo |
| Google Workspace (1 user) | 1,500 ($18/mo) | Day 6 |
| Demo video production | 70,000 | Day 17-27 |
| Goodwill gifts (first customers) | 10,000 (5 × ₹2k) | Day 43-60 |
| Founder personal | — | Your call |
| **Total fixed** | **~85,000** | **₹85k for 90 days** |
| **Total revenue (Day 90)** | **40-50k MRR** | **paying customers' subscriptions** |

By Day 90: revenue covers monthly burn. Unit economics are positive.

---

## §12 Maker / Manager / Wait Day Mix

A rough breakdown of the 90 days by energy type:

| Type | Days |
| ---- | ---- |
| 🛠️ Maker (uninterrupted build) | ~40 |
| 📞 Manager (calls, emails, meetings) | ~25 |
| ⏳ Wait (external dependency) | ~10 |
| 🟢 Buffer + retros | ~10 |
| Rest (Sundays) | ~12 |

If a maker day gets eaten by manager work (urgent customer issue), the
build slips 1 day. Plan for ~20% slippage and build buffers in (Day 5,
13, 30 are buffer days for exactly this).

---

## §13 What Happens After Day 90?

Two clean paths, both planned:

**Path A — Double down on growth (no fundraise):**
- Days 91-180: 100 customers (₹1L MRR), profitability, hire 1 sales person.
- Day 180+: ₹5L MRR, hire 2 engineers, push for ₹50L ARR by Day 365.
- Fundraise from cashflow + a small angel round at Day 270.

**Path B — Raise Series A:**
- Days 91-150: 3 lead VC meetings with the 10-customer story.
- Day 150-180: term sheet + close.
- Day 180+: hire founding sales lead + 2 engineers. Push for ₹1Cr MRR by Day 540.

Decision criterion at Day 90: **if you have ≥3 angel commits AND demo
video has >2k YouTube views AND case study is being shared organically,
Path B is plausible. Otherwise Path A is safer.**

---

## §14 Daily Reading

Read this section every morning before starting Day N's work:

1. Today's goal (from §3-§8)
2. What changed in the world overnight (Sentry errors, Cashfree webhook
   logs, customer messages, investor replies)
3. The single most important thing to ship today
4. The single biggest risk that's NOT mitigated yet

Spend 10 minutes here. Don't open code until you've answered all 4.

---

## §15 Related Documents

This plan composes all prior runbooks:

| Existing doc | Days it informs |
| ------------ | --------------- |
| `docs/setup/CONNECT_SUPABASE.md` | Day 1 |
| `docs/setup/DEPLOY_NOW.md` | Day 2-3 |
| `docs/setup/CASHFREE_ONBOARDING.md` | Day -3, 4, 8 |
| `docs/archive/WHATSAPP_BUSINESS_API.md` | Day 0, 17, 19 |
| `docs/setup/PLAY_STORE_PREP.md` | Day 10-12 |
| `docs/architecture/ROLE_MODEL_V2.md` | Reference for role mapping during migrations |
| `docs/business/COMPETITOR_COMPARISON_V2.md` | Days 22, 71-85 |
| `docs/architecture/PRODUCTION_RLS.md` | Day 1, 26 |
| `docs/integrations/MCP_TOOLKIT.md` | Day 0 |
| `docs/setup/HRMS_DEPLOYMENT_STUDY.md` | Reference for "why Supabase not Express" if asked |
| `docs/business/CASE_STUDY_TEMPLATE.md` | Day 44 |
| `docs/business/DEMO_VIDEO_SCRIPT.md` | Day 17-20, 46 |

---

## §16 Closing Note

This plan is not a contract. It's a roadmap. Reality will deviate. The
KPI checkpoints (Day 14, 30, 60, 90) are the only hard gates — at each
one, decide: continue / pivot / pause.

The single most important thing to do: **on Day -3, send the Cashfree
application and rotate the leaked credentials**. Everything downstream
depends on those two.

Good luck. Mee chethulu lo undi ee plan.
