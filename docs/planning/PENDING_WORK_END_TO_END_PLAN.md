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
| `sitetrackpro.in` Resend domain | ✅ **verified** | id `b035d4cd-d4c1-4de7-9066-1bb82876e59a` (ap-northeast-1, created 2026-08-19, sending+receiving); old `sitetrack.in` (id `ddf2ce85…`) superseded |
| `RESEND_FROM_EMAIL` | ✅ `SiteTrack <hello@sitetrackpro.in>` | EF secret set live; code fallbacks match |
| inbound forwarder (`email.received` → `EMAIL_FORWARD_TO`) | ✅ **wired + verified live** | migration **255** (CHECK admits `received`) + unpadded-secret fix (`_shared/resendWebhook.ts`) — signed replay → **200** `{ok:true}`, row in `resend_delivery_events`, forward attempt reached `received-fetch-422` (fake Resend id) |
| `OrgRegisterView` i18n | 🟡 **hardcoded strings, no `useT`** | LoginScreenV3 is i18n'd — register screen is the outlier |

## Phase A — Real email delivery (primary blocker)

**Goal**: real confirmation + notification emails reach any recipient, not just
the account owner. Requires the `sitetrackpro.in` DNS verification (user-side).

| # | Sub-task | Action | Depends |
|---|----------|--------|---------|
| A1 | DNS + Resend verify | ✅ 3 DNS records verified in Resend (DKIM TXT, SPF TXT, MX) + TrackingCAA `www` pending (optional) | user DNS |
| A2 | Flip `RESEND_FROM_EMAIL` | ✅ EF secret + GoTrue SMTP → `SiteTrack <hello@sitetrackpro.in>` | A1 |
| A3 | Live delivery test | ✅ API send 200 → `email.sent` webhook row in `resend_delivery_events` | A2 |
| A4 | §8 manual confirm round-trip | 🟡 **user** — real Gmail→`hello@sitetrackpro.in`→forwarded→`boyapatirakesh7777@gmail.com` test + register an org with a routable inbox | A2 |
| A5 | Inbound forwarder | ✅ `email.received` → `EMAIL_FORWARD_TO` (migration **255** + unpadded-secret fix) — signed replay 200, row landed; real inbound test = A4 | A2 |

**Verify (A)**: tsc · eslint · vitest (efRegisterOrg/resend tests) · smoke ·
Resend API send 200 · webhook row in DB · signed replay 200 · confirm link +
forwarded mail land in the real inbox.

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
`AGENTIC_LOOPING_METHODOLOGY.md`, `e2e output log (removed)`, `error.txt`, `tmp.txt`,
`tsout*.txt`. All `scripts/apply-*.mjs` / `probe-*.mjs` / `verify-*.mjs`
temp runners and `migration_status.txt` / `test-output.txt` output dumps were
**removed from the repo 2026-08-20**; the CI `test` job's **Stray-artifact guard**
now fails if any of them (or a future temp runner) is ever committed again.
Note: `scripts/supabase/200_storage_usage.sql` is **migration 200** (storage
usage RPC, applied live) — a legitimate migration file, NOT a temp artifact.