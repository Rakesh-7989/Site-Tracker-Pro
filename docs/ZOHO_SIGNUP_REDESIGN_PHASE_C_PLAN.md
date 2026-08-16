# Zoho-Style Signup Redesign — Phase C: Deep-Dive + Implementation Plan

Status: **Phase C** (design + plan, pre-implementation)
Inputs: `docs/ZOHO_SIGNUP_UX_REDESIGN_REPORT.md` (Phase B) + user decisions below.

## 0. Locked User Decisions (Phase B → C)

1. **Verification story = email-confirm ON.** Remove EF auto-confirm
   (`email_confirm: true` → `false`). A new workspace is only usable after the
   owner clicks the confirmation link. This is more Zoho-like and closes the
   abuse/fraud gap in the current self-service path.
2. **Plan default = Pro, with a 14-day free trial.** New orgs start on the
   **Pro** plan, full Pro features enabled for **14 days**, then (subject to the
   trial-end design in §5.5) drop to the paid plan the owner chooses / Basic if
   they never choose.

Everything below is built to satisfy these two decisions without breaking the
existing approval-gated path, plan gating, quotas, or onboarding.

---

## 1. Current-State Facts (verified in code)

| Concern | Where | Fact |
|---------|-------|------|
| Org `plan` is the gating source | `src/app/planCapsQueries.ts:15-21` | `getPlanCaps` reads `organizations.plan` → `plans.feature_caps`. **Not** the `subscriptions` table. |
| Auth user creation | `supabase/functions/register_org/index.ts:158-163` | `admin.auth.admin.createUser({ ..., email_confirm: true })` — currently **auto-confirmed**. |
| Welcome email | `register_org/index.ts:54-93, 220` | Sends the user's **own chosen password** (not temp) + login CTA. |
| Org + membership | `register_org/index.ts:177-217` | Creates org row (`plan`, `billing_period`, optional `segment`), profile (`orgadmin`), org member (`admin`). |
| No subscription row on self-service signup | `register_org/index.ts` | The EF **never inserts** into `subscriptions`. |
| `subscriptions` schema | `scripts/supabase/03_rls_phase1.sql:170-181` | `status` allows `'pending','active','past_due','cancelled','trial'`; has `trial_ends_at`. `org_id` PK (1:1 with org). |
| Trial already a known state | `scripts/supabase/03_rls_phase1.sql:176`; `src/data/seed.demo.ts:68` | `'trial'` status + `trial_ends` concept already exists in seed/mock data. |
| Onboarding wizard | `src/features/org/OnboardingView.tsx` | 5 steps: Org details (name+email+segment+modules) → Invite → First project → Presets → Integrations. **No plan/billing step.** |
| Onboarding persist | `src/app/onboardingQueries.ts` (`updateOrg`, `getMyOrg`) | Persists name/email/segment/modules. Plan/billing not touched. |
| Existing session handoff | `register_org/index.ts` | EF returns `{ok, orgId, userId, emailSent}` — **no auth session** returned; the client must sign in after confirm. |

**Critical implication of decision #1 (email-confirm):** currently the EF sends
a welcome email containing the user's own password and a "Sign in" CTA. Once we
set `email_confirm: false`, Supabase sends its own **confirmation** email; the
user cannot sign in until confirmed. The EF's welcome email must be reworked
(see §5.1).

**Critical implication of decision #2 (Pro trial):** because plan gating reads
`organizations.plan`, the trial must set `organizations.plan = 'pro'`. The
`subscriptions` row (status `'trial'`, `trial_ends_at`) becomes the **audit
record** of the trial. A trial-end mechanism (§5.5) is required or the org stays
Pro forever.

---

## 2. Target UX Flow (post-change)

```
/register (Step 1 — identity only)
  email · password · confirm password · consent · honeypot
  "Create your workspace" → register_org (email_confirm:false, plan=pro, trial=14d)
        │
        ▼
"Check your inbox" screen (verify)  ← NEW
  "We sent a confirmation link to {email}. Click it to activate your workspace."
  (resend link; opens the Supabase confirm email)
        │ (user clicks confirm link)
        ▼
Sign in → onboarding wizard (Step 3 — post-login)
  existing 5 steps + NEW "Plan & billing" step:
    choose plan (basic/pro/business) + billing (monthly/annual)
    → updateOrg writes organizations.plan + billing_period (+ optional
      upgrade of subscriptions row from 'trial' → 'active' if they pick a
      paid plan now)
        │
        ▼
/org (workspace ready)
```

During the trial (`organizations.plan='pro'`, sub.status='trial'), all Pro
features are unlocked. If the owner completes onboarding and picks a plan,
their choice overrides the trial. If they pick **Pro** again, it becomes the
paid plan (trial honored until 14 days end, then billed).

---

## 3. Required Changes — File-by-File

### 3.1 Edge Function: `supabase/functions/register_org/index.ts`

1. **Email-confirm OFF** (line 161):
   `email_confirm: true` → `email_confirm: false`. Supabase will send its own
   confirmation email (requires SMTP configured for the project — see §6).

2. **Plan/billing/segment become optional with Pro-trial defaults:**
   - `plan` default `"basic"` → `"pro"`.
   - Insert `organizations` with `plan: "pro"`.
   - Keep accepting an explicit `plan`/`billing`/`segment` (deep-link
     `?plan=&billing=` still works) but default to the trial when omitted.

3. **Insert a `subscriptions` row (new):**
   ```
   subscriptions(org_id, provider:'manual', plan:'pro', status:'trial',
                 trial_ends_at: now()+interval '14 days',
                 current_period_end: now()+interval '14 days')
   ```
   Best-effort insert (must not fail org creation). This is the trial audit
   record. (Same RLS posture as the rest — service_role bypasses RLS.)

4. **Rework the welcome email** — it must NOT contain a "Sign in now" with the
   password (the account isn't confirmed yet). New email:
   - Subject: "Confirm your SiteTrack Pro account"
   - Body: "Confirm your email to activate your {firmName} workspace. You're on
     the **Pro plan, free for 14 days**." + a note that the confirmation email
     from Supabase carries the actual confirm link.
   - Keep the honeypot + IP rate-limit + rollback logic **unchanged**.

5. **Return shape**: add `trialEndsAt` (ISO) and `plan: 'pro'` so the frontend
   can render the "14-day Pro trial" copy on the verify screen. Keep
   `ok/orgId/userId/emailSent` for back-compat.

### 3.2 Query layer: `src/app/orgRegisterQueries.ts`

- `RegisterPlan` type already `"basic"|"pro"|"business"` — fine.
- `RegisterResult.ok` variant: add optional `trialEndsAt?: string | null` and
  `plan?: string` passthrough.
- `RegisterInput`: `plan`/`billing`/`segment` become **optional** (so the
  identity-only form can omit them). Update the `RegisterInput` interface
  accordingly (keep back-compat with deep-link callers).

### 3.3 New identity screen: `src/features/auth/OrgRegisterView.tsx`

**Rework the single long form into the minimal identity screen:**
- Fields: **work email, password, confirm password, consent** (+ hidden
  honeypot `website`). Drop segment/billing/plan from this screen.
- Header: logo + `LanguageSwitcher` + **prominent "Sign in"** link.
- Sub-heading + trust copy: *"No approval needed. Your workspace starts on the
  Pro plan — free for 14 days."*
- CTA: "Create your workspace".
- On submit → `registerOrg({ email, password, consentVersion, website })`
  (no plan/billing/segment → EF defaults to Pro trial).
- On success → replace the old "Your workspace is ready" card with a
  **"Check your inbox" verify screen**:
  - Icon + "Confirm your email"
  - "We sent a confirmation link to **{email}**. Click it to activate your
    workspace."
  - "You're on the **Pro plan — free for 14 days**."
  - "Didn't get it?" → resend / check spam (resend = re-invoke a small
    `resend_confirmation` helper or Supabase admin `generateLink`).
  - "Back to sign in" link.
- Keep the existing "already signed in → /dashboard" guard.

### 3.4 Onboarding: `src/features/org/OnboardingView.tsx` + `src/app/onboardingQueries.ts`

- **Add a plan/billing step.** Insert as **Step 1 (right after/with org
  details)** so the trial→paid decision happens early, or as a step before
  "Feature presets". Recommended placement: a new step **"Choose your plan"**
  between Step 1 (Org details) and Step 2 (Invite team), OR fold it into Step 1.
  - Reuse the plan cards (basic/pro/business) + monthly/annual toggle already
    built for `OrgRegisterView`.
  - State: `plan: "pro"` (default = current trial plan), `billing: "monthly"`.
  - Copy: "You're on a **14-day Pro trial**. Pick a plan to continue after the
    trial — or choose Pro to keep what you have."
- **Persist**: extend `updateOrg(client, orgId, name, email, segment, modules,
  plan?, billing?)` to also write `organizations.plan` + `billing_period`.
  Keep back-compat (old callers omit plan/billing).
- If the owner picks a **paid** plan during onboarding, optionally flip the
  `subscriptions` row from `status='trial'` → `status='active'` (this is the
  real "subscribe" moment). This needs a small query/RPC (`activateSubscription`)
  — see §5.4. If they stay on Pro without acting, the trial continues until
  trial end (see §5.5).

### 3.5 i18n: `src/i18n/en.json` / `hi.json` / `te.json`

New keys (all three locales, keep alpha-ASCII keys for parity test):
- `auth.verifyTitle` / `auth.verifySub` / `auth.verifyResend` /
  `auth.verifySpam` / `auth.verifyBackToSignIn`
- `auth.trialLine` ("14-day Pro free trial")
- `onboard.planStep` / `onboard.planTitle` / `onboard.planSub` /
  `onboard.trialNote`
- Update `auth.orgCreatePrompt`/related if wording changes.
- Update `tests/i18n/i18n.test.ts` deep/flat parity expectations.

### 3.6 Tests to update / add

- **`tests/signupApproval.test.ts` / `tests/efRegisterOrg.test.ts`** (or
  wherever `registerOrg` EF behavior is unit-locked): assert
  `email_confirm: false`, `organizations.plan='pro'`, `subscriptions` trial
  row inserted (`status='trial'`, `trial_ends_at ≈ now+14d`), welcome email
  changed.
- **`OrgRegisterView` tests**: new minimal form (no segment/billing/plan),
  "Check your inbox" verify state, resend, trial copy.
- **`OnboardingView`**: new plan step, `updateOrg` writes plan/billing,
  back-compat.
- **`orgRegisterQueries`**: optional plan/billing/segment + `trialEndsAt`
  passthrough.
- **Smoke** (`scripts/smoke.mjs`): markers for any new exported helpers
  (e.g. `resendConfirmation`, `activateSubscription`).

### 3.7 Gate suite (run before commit)

`npx tsc --noEmit` · `npx eslint .` · `npx vitest run` ·
`node scripts/smoke.mjs` · `npm run build` · `npm run test:e2e:mock`.

---

## 4. What Does NOT Change

- Approval-gated path (`submit_signup_request` / `review_signup_request` /
  `SignupRequestsView`) — untouched.
- Plan gating reads `organizations.plan` — unchanged (trial just sets it to
  `pro`).
- Quota meters / `PlanGate` / `QuotaGate` — unchanged.
- Honeypot + IP rate-limit + rollback in `register_org` — preserved.
- `LoginScreenV3` sign-in — unchanged (user signs in after confirming).
- No schema change required for the core flow (reuses `subscriptions`).

---

## 5. Open Design Decisions (Phase C deep-dive — need resolution)

### 5.1 Welcome/confirmation email split
With `email_confirm: false`, **Supabase's own confirmation email** is the
delivery mechanism (configured in Supabase Auth → SMTP, or the built-in email
provider). The EF's welcome email becomes optional/secondary. Decision needed:
- Send **only** Supabase's confirm email (simplest), or
- Also send a branded EF welcome email that *points to* the confirm link.
Recommend: Supabase confirm email (must work reliably — §6) + a lightweight
branded "you're on Pro trial" follow-up is optional; do NOT duplicate confirm
links in two emails.

### 5.2 Resend confirmation
The verify screen needs a "resend" path. Options: (a) re-invoke
`register_org` — **no**, it would create a second org/user; (b) a new tiny EF
`resend_confirmation` that calls `admin.auth.admin.generateLink('signup')` and
emails it; or (c) point the user to the login screen "didn't get it?" →
Supabase resend. Recommend **(b)** a small dedicated EF (clean, testable).

### 5.3 Do we keep the user-chosen password?
Yes — the user chooses password at `/register`; EF creates the user with it
(`email_confirm:false`). No temp password. The old "temp password in welcome
email" concept goes away for the self-service path.

### 5.4 "Subscribe now" vs "wait for trial end"
Decision: does picking a paid plan in onboarding immediately bill/activate, or
just record intent and bill at trial end? Given Zoho's trial-first model and
Cashfree checkout complexity, recommend: **at trial end**, prompt the owner to
subscribe; onboarding plan choice just records preference + updates
`organizations.plan`. Keep the `subscriptions.status='trial'` until an actual
Cashfree subscription is created (reuse existing Cashfree webhook flow). This
avoids building a new billing trigger now.

### 5.5 Trial-end enforcement (the real gap)
Because gating reads `organizations.plan` and nothing currently downgrades it,
a Pro trial would be **permanent** without enforcement. Options:
- **(a) Read-side check (recommended, low-effort):** in `getPlanCaps` /
  `usePlanCaps`, resolve the effective plan from `subscriptions`:
  - if `subscriptions.status='trial'` AND `trial_ends_at > now()` → treat plan
    as `'pro'` (full Pro), regardless of `organizations.plan`;
  - if trial expired and no active subscription → fall back to
    `organizations.plan` (which we set to `'basic'` at trial end via the
    migration in (b), or leave as the owner's chosen paid plan).
  This keeps gating correct without a cron.
- **(b) Trial-end cron (optional, robust):** a daily Edge Function/`pg_cron`
  that sets `organizations.plan='basic'` (or the chosen plan) + updates
  `subscriptions.status` when `trial_ends_at < now()` and no active
  subscription exists. Mirrors the existing retainer-cron pattern (migration
  147) — proven infra.
- **Recommendation:** ship **(a)** for correctness now + **(b)** as a follow-up
  cron for hygiene (set `organizations.plan` to the recorded choice or
  `'basic'`). Confirm which.

### 5.6 Trial banner / countdown UX
Add a visible "**Pro trial · N days left**" indicator (org switcher / settings)
so owners aren't surprised. Option in Phase A; needs i18n keys + a read of
`trial_ends_at` from `getPlanCaps` or `getOrgOverview`. Confirm scope.

### 5.7 Onboarding plan-step position
Fold into Step 1 vs separate step. Recommend a **separate step** (clearer,
matches Zoho's "choose starting solution") — confirm.

---

## 6. Infrastructure / Env Prerequisite

- **Supabase SMTP/email must be configured** for confirmation emails to be
  delivered (this is the whole point of decision #1). If the project uses
  Resend via Supabase's SMTP integration, confirm the `confirm` template +
  redirect URLs. Without working email, users are locked out — this is a
  **hard blocker** to flag before Phase A.

---

## 7. Migration Needs

- **Core flow: no new migration** (reuses `subscriptions`, `organizations`,
  `plans`).
- **Optional trial-end cron (5.5b):** one migration to schedule `pg_cron`
  (mirror 147 pattern).
- **Optional `resend_confirmation` EF (5.2):** new function file, no migration.

---

## 8. Acceptance Checklist (Phase A verification)

- [ ] `/register` shows only email/password/confirm/consent + trial copy.
- [ ] `register_org` sets `email_confirm:false`; confirm email sent.
- [ ] Org created with `plan='pro'` + `subscriptions(status='trial',
      trial_ends_at=+14d)`.
- [ ] "Check your inbox" screen with resend + trial copy + back-to-sign-in.
- [ ] After confirm + sign-in → onboarding has plan/billing step; choice
      persists to `organizations.plan` + `billing_period`.
- [ ] Trial-end read-side check: expired trial → falls back to
      `organizations.plan` (owner choice or basic).
- [ ] Pro features unlocked during trial (no regression in plan gating).
- [ ] Approval-gated path unchanged.
- [ ] i18n en/hi/te parity + all test suites green + smoke + e2e-mock.
- [ ] Manual: real email confirm round-trip on a staging/dev org.

---

## 9. Open Questions — please answer before Phase A

1. **5.1** — Supabase confirm email only, or also a branded follow-up? (Rec: confirm-only for v1)
2. **5.2** — Build `resend_confirmation` EF? (Rec: yes)
3. **5.4** — Onboarding plan choice = just record, bill at trial end? (Rec: yes, reuse Cashfree)
4. **5.5** — Ship read-side check (a) now + trial-end cron (b) follow-up? (Rec: yes)
5. **5.6** — Add "Pro trial · N days left" banner? (Rec: yes)
6. **5.7** — Plan/billing as a separate onboarding step? (Rec: yes)
7. **§6** — Confirm Supabase SMTP/Resend confirm email is configured and
   working (hard blocker).
8. **Deep-link `?plan=`/`?billing=`** — keep carrying into onboarding as the
   default choice (vs force Pro trial for all)? (Rec: keep deep-link default,
   but user can change in onboarding)

Once these are confirmed, Phase A implements §3 and runs the gate suite before
push to `prod`.
