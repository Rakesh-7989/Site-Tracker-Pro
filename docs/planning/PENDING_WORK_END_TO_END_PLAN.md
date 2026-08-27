# Pending Work — End-to-End Plan (agentic looping)

> Executed via the loop in `docs/planning/AGENTIC_SDLC.md`: per phase → per sub-task
> **Deep-Dive → Plan → Build → Verify → Commit**, then phase re-check →
> testing loop → release → push live. All decisions taken by the agent (user
> delegated). Verified live state (2026-08-16) before planning.

## 0. Verified current state (deep-dive complete)

| Item | Status | Evidence |
|------|--------|----------|
| `register_org` EF — email-confirm off, Pro trial, confirm email via generateLink | ✅ shipped + live | `7cd711b`/`5f1a9d8` (live-verified) |
| `/register` minimal identity screen + "Check your inbox" verify + resend | ✅ shipped | `OrgRegisterView.tsx` (d25c73c) |
| Onboarding "Plan & billing" step (default Pro trial) + `updateOrg(plan,billing)` | ✅ shipped | `OnboardingView.tsx` STEPS[1] |
| Trial-end read-side check | ✅ shipped | `planCapsQueries.ts` `resolveEffectivePlan`/`isTrialActive` |
| Trial banner in shell | ✅ shipped | `TrialBanner.tsx` wired in `TopBar.tsx` |
| Trial-end cron (migration 202) | ✅ **applied live** | probe: fn=1, cron job `expire-expired-trials`=1, service_role grant ok |
| `resend_confirmation` EF | ✅ shipped + live | exists |
| Resend API key + webhook secret wired | ✅ live | `RESEND_API_KEY`/`RESEND_WEBHOOK_SECRET` set |
| resend-webhook receiver + `resend_delivery_events` (migration 201) | ✅ shipped + live | `ff5adef` |
| `sitetrackpro.in` Resend domain | 🟡 **create for the new domain (2026-08-20)** | old Resend domain was `sitetrack.in` (id `ddf2ce85…`, unverified) — superseded |
| `RESEND_FROM_EMAIL` | 🟡 test domain `onboarding@resend.dev` | only reaches account-owner inbox |
| `OrgRegisterView` i18n | 🟡 **hardcoded strings, no `useT`** | LoginScreenV3 is i18n'd — register screen is the outlier |

## Phase A — Real email delivery (primary blocker)

**Goal**: real confirmation + notification emails reach any recipient, not just
the account owner. Requires the `sitetrackpro.in` DNS verification (user-side).

| # | Sub-task | Action | Depends |
|---|----------|--------|---------|
| A1 | DNS + Resend verify | User adds 3 DNS records (DKIM TXT, SPF TXT, MX) → I verify in Resend (API `GET /domains/{id}` status=verified) | **user DNS** |
| A2 | Flip `RESEND_FROM_EMAIL` | `.env.local` + Supabase EF secret → `SiteTrack <hello@sitetrackpro.in>` | A1 |
| A3 | Live delivery test | Send to `boyapatirakesh7777@gmail.com` via Resend → 200 + `email.sent` webhook → `resend_delivery_events` row | A2 |
| A4 | §8 manual confirm round-trip | Register a real org with routable inbox → click confirm link → sign in → onboarding plan step → trial banner visible | A2 |

**Verify (A)**: tsc · eslint · vitest (efRegisterOrg/resend tests) · smoke ·
Resend API send 200 · webhook row in DB · confirm link lands in the real inbox.

## Phase B — Signup-flow i18n parity (buildable now, independent)

**Goal**: `/register` screen matches the i18n'd login surface (en/hi/te), closing
the last Zoho-plan §3.5 gap.

| # | Sub-task | Action |
|---|----------|--------|
| B1 | Add i18n keys | `auth.verifyTitle/verifySub/verifyResend/verifySpam/verifyBackToSignIn/verifyDifferentEmail/verifySent` + `auth.trialLine` + `auth.registerCreate/registerWorkEmail/registerPassword/registerConfirm/registerConsent/registerCta` in en/hi/te |
| B2 | Wire `OrgRegisterView` | Replace hardcoded strings with `useT()`; keep honeypot + consent links + deep-link `?plan=` logic intact |
| B3 | Update tests | `tests/i18n/i18n.test.ts` parity expectations + `OrgRegisterView` unit tests for the verify screen via `useT` |

**Verify (B)**: tsc · eslint · vitest (i18n parity + register view) · smoke ·
build. No schema/EF change.

## Phase C — Full testing loop

| Step | Suite | Command |
|------|-------|---------|
| C1 | Unit | `npx vitest run` |
| C2 | Type/format | `npx tsc --noEmit` · `npx eslint .` |
| C3 | Smoke | `node scripts/ci/smoke.mjs` |
| C4 | Build | `npm run build` |
| C5 | E2E mock | `npm run test:e2e:mock` |
| C6 | Manual | §8 real-email round-trip (needs Phase A) |

## Phase D — Release + push live

1. Commit per sub-task (Phase A/B), `git push origin main:prod`.
2. Vercel auto-deploy → live `https://sitetrackpro.in` HTTP 200.
3. Update `AGENTS.md` work-state + close `docs/planning/ZOHO_SIGNUP_REDESIGN_PHASE_C_PLAN.md` §8 items.

## Non-goals (deferred, unchanged)
- WhatsApp/Twilio/push delivery (no provider keys) · subdomain
  white-label · mobile app / Play Store · V4/V5 industry depth.

> **Updated 2026-08-20**: CAD preview is **no longer deferred** — base preview
> shipped `ef4e601` (2026-08-15) and the depth pass shipped `6727d0b` (BLOCK→
> INSERT expansion, ACI/LAYER colors, MTEXT, ELLIPSE, layer-count + warnings in
> `CadPreviewModal`; `parseDxfDoc`/`aciColor`/`resolveStroke`/`layerCounts`;
> 42 dxf tests; smoke 455; PR #3 squash → prod, live 200).

## Do-not-commit artifacts (updated 2026-08-20)
`AGENTIC_LOOPING_METHODOLOGY.md`, `e2eout.txt`, `error.txt`, `tmp.txt`,
`tsout*.txt`. All `scripts/apply-*.mjs` / `probe-*.mjs` / `verify-*.mjs`
temp runners and `migration_status.txt` / `test-output.txt` output dumps were
**removed from the repo 2026-08-20**; the CI `test` job's **Stray-artifact guard**
now fails if any of them (or a future temp runner) is ever committed again.
Note: `scripts/supabase/200_storage_usage.sql` is **migration 200** (storage
usage RPC, applied live) — a legitimate migration file, NOT a temp artifact.