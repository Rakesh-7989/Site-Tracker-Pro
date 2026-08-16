# Zoho-Style Signup/Sign-In/Workspace UX — Research Report (Phase B)

## Purpose

This report documents deep-dive research into **how Zoho handles account signup,
sign-in, and organization/workspace creation**, and compares it against the
current **SiteTrack Pro "Create your workspace"** flow. The goal is a concrete,
implementation-ready redesign proposal that mirrors Zoho's UX principles.

This is **Phase B** of a B → C → A workflow:
- **B (this report)** — research + current-state analysis + proposed direction.
- **C (next)** — deeper design review, edge-case planning, decision record, and
  a step-by-step implementation plan derived from this report.
- **A (final)** — implementation of the agreed design.

---

## 1. Zoho Signup / Sign-In / Workspace Flow — How It Actually Works

Zoho does **not** use a single long signup form. The journey is split into
**three distinct phases** with progressive disclosure: identity → verification →
post-login guided setup.

### 1.1 Step 1 — Account Creation (identity only)

Minimal, focused screen. Only what is needed to *create an account*:

- **Email + password** (the classic flow), **or**
- **Phone + OTP** (mobile-first accounts, e.g. Zoho Mail personal), **or**
- **Social / federated sign-in** — Google, Microsoft, LinkedIn.

No company name, no plan, no billing, no industry — none of that lives on the
account-creation screen.

Design cues observed on the live pages:
- **"Have a Zoho Account? SIGN IN"** — a prominent, always-visible link at the
  top right so existing users take the return path, not a duplicate signup.
- Trust copy near the CTA, e.g. *"Sign up for Zoho Workplace and join the
  450,000+ businesses that trust us"*.
- A single primary CTA (e.g. *"Get started"* / *"Sign up for free"*).

### 1.2 Step 2 — Verification (before any workspace config)

After the minimal form, the account must be confirmed before anything else:

- **Email verification link** — standard on most Zoho products
  (e.g. Zoho Flow: *"Check your inbox for a verification email → click the
  confirmation link"*).
- **Mobile OTP** — Zoho Mail personal signup requires a mobile number and a
  confirmation code sent to it before the account is usable
  (*"you will be able to send emails only from a verified account"*).
- No workspace/billing decisions are made here — just prove identity.

### 1.3 Step 3 — Post-Login Guided Setup (the "workspace" wizard)

Once verified and signed in, Zoho launches a **setup wizard** that collects the
workspace/company data, *not* at signup time:

- **Zoho One / general suite pattern**:
  - Company name
  - Employee count
  - Industry / country / locale / time zone
  - Security baseline (password policy, MFA, session timeout)
  - Work locations / organization profile
  - Application selection ("choose your starting solution"; enable apps
    intentionally)
- **Zoho Flow / ZeptoMail pattern**: after account creation → org name → terms →
  domain/workspace setup → first admin console.

### 1.4 Plan & Billing Are Deferred

Zoho is aggressively **trial-first**:

- *"Try free for 30 days. No card needed."* (Zoho One)
- *"Free trial / no card required"* is the headline on signup pages.
- Plan selection and payment happen **after** org creation, during/after the
  trial — never before the account exists.

### 1.5 Sign-In Screen (the return path)

- Email (or mobile number) → password.
- "Keep me signed in".
- Forgot-password flow is email-link **or** OTP (user chooses).
- Federated sign-in (Google/Microsoft) as an alternative.
- Prominent link to **create** an account for users who don't have one.

### 1.6 Summary of Zoho UX Principles

| # | Principle | Meaning |
|---|-----------|---------|
| P1 | **Email-first, minimal form** | One decision per screen; collect identity first |
| P2 | **Verify early** | Email link / mobile OTP before any config |
| P3 | **Defer plan & payment** | Free trial first; billing after org creation |
| P4 | **Post-login wizard for workspace** | Company/industry/apps go in the admin setup, not the signup form |
| P5 | **Clear existing-user path** | Prominent "SIGN IN" / "Have an account?" top-right |
| P6 | **Trust + friction-reduction copy** | "5 minutes", "No card needed", "450,000+ businesses" |
| P7 | **Progressive disclosure** | Reveal complexity only when the user reaches that step |

---

## 2. SiteTrack Pro Current "Create Your Workspace" Flow

Source: `src/features/auth/OrgRegisterView.tsx` (route `/register`), driven by
the `register_org` Edge Function (`supabase/functions/register_org/index.ts`)
via `src/app/orgRegisterQueries.ts`.

### 2.1 Current Form Structure (single screen)

A single long page asks the user to make **9 decisions/fills at once**:

| # | Element | Notes |
|---|---------|-------|
| 1 | Company segment picker (5 cards) | `SEGMENTS` — construction/architecture/interior/consultancy/multiple |
| 2 | Billing cycle toggle | monthly / annual (annual = "2 months free") |
| 3 | Plan selector (3 pricing cards) | basic / pro / business, price + GST line |
| 4 | Firm name | required |
| 5 | Your name | required |
| 6 | Work email | required |
| 7 | Phone | optional |
| 8 | Password + confirm password | ≥ 8 chars |
| 9 | Terms & Privacy consent checkbox | gates the submit button |

Plus: honeypot `website` field (bot protection), `LanguageSwitcher`, and a
small "Sign in" link in the header.

### 2.2 Current Success Path

1. User fills everything, clicks **Create workspace**.
2. `register_org` EF validates → creates auth user (`email_confirm: true`,
   temp password generated in EF), org row, profile (`role=orgadmin`),
   org membership (`role=admin`), sends welcome email via Resend
   (contains temp password + login CTA).
3. Frontend shows a **"Your workspace is ready"** success card with firm name,
   plan, billing, role, and a "Sign in to SiteTrack Pro" CTA.
4. User signs in → **forced password change** on first login
   (`profiles.must_change_password = true`).
5. Directed into the post-login onboarding wizard (`OnboardingView`:
   segment → project type → module toggles → profile completion).

### 2.3 Key Architectural Facts (matter for Phase C/A planning)

- **EF auto-confirms email** (`email_confirm: true` + generated temp password)
  — there is currently *no* email/mobile verification step in the self-service
  path. Abuse protection is the honeypot + validation only (the approval-gated
  `submit_signup_request` path has IP rate-limiting; self-service path does
  not, per `docs/ZOHO_WORKPLACE_COMPARISON.md`).
- **Plan/billing/segment are persisted at creation time** on the `organizations`
  row; the welcome email bakes in plan + billing + temp password.
- **A post-login onboarding wizard already exists** (`OnboardingView`) with
  segment picker, project-type selection, module toggles, and org profile
  update via `onboardingQueries.updateOrg(...)` / `getMyOrg(...)`.
- **Plan gating already exists** (`planCaps.ts`, `PlanGate`, quota meters) — the
  plan field is read in multiple places after creation.

---

## 3. Gap Analysis — SiteTrack Pro vs Zoho UX

| Aspect | Zoho | SiteTrack Pro (current) | Verdict |
|--------|------|------------------------|---------|
| Screen count | 3 (identity → verify → wizard) | 1 long screen | Zoho wins on focus |
| Email/password priority | First thing on screen | Buried mid-form (segment + plan + billing come first) | Zoho wins |
| Plan choice timing | After org, trial-first | **Before** org (must pick a price to register) | Big friction gap |
| Billing choice timing | Deferred | **Before** org | Big friction gap |
| Segment choice timing | In setup wizard | **Before** org (on the signup screen) | Zoho wins |
| Email verification | Standard, before config | None (EF auto-confirms) | Gap (abuse/fraud risk) |
| Existing-user path | Prominent "SIGN IN" top-right | Small header link | Improve prominence |
| Phone | Optional verify channel | Optional text field (no OTP) | Parity (no OTP either way) |
| Trust copy | "5 min", "No card", "450k+ businesses" | "No approval needed — start right away" | Good seed; expand |
| Post-login wizard | Full admin setup | Already exists (`OnboardingView`) | Strong foundation to reuse |
| Social/federated login | Google/Microsoft/LinkedIn | Not present | Optional future |

### 3.1 What to Keep (SiteTrack strengths)

- Honeypot bot protection (zero-friction for humans).
- Post-login onboarding wizard — the perfect home for plan/segment/billing.
- Plan gating + quota infrastructure already in place.
- Consent version tracking (GDPR/DPDP).
- Two signup paths (self-service + approval-gated) — keep, don't break.

### 3.2 What Changes (the redesign surface)

1. **Split the single screen into a 3-step flow** (identity → (verify) →
   post-login wizard).
2. **Move segment + plan + billing out of `/register`** and into the existing
   `OnboardingView` wizard (new "Plan & billing" step + segment step already
   there).
3. **Make the identity screen minimal**: email + password (+ confirm), with a
   prominent "Sign in" return path and trust copy.
4. **Decide the verification story** (see Phase C open questions): keep EF
   auto-confirm + welcome email, or add an email-confirm step, or defer to a
   soft verification banner after login.
5. **Default the org's plan/billing/segment at creation** to sensible values
   (e.g. `basic` / `monthly` / `construction`) so `register_org` doesn't need
   the fields, then persist the real choice via onboarding `updateOrg`.

---

## 4. Proposed Redesign Direction (for Phase C to deep-dive)

### 4.1 Step 1 — Account / Identity (new `/register` screen)

- **Fields**: work email, password, confirm password. (Phone optional — see
  open question.)
- **Header**: logo + `LanguageSwitcher` + prominent **"Sign in"** link.
- **Trust line** under the heading: *"No approval needed — start using
  SiteTrack Pro right away"* (keep) + *"Take your first project live in under
  5 minutes"*.
- **CTA**: "Create your workspace".
- **Honeypot** stays (invisible field).
- On success → create org with defaults (basic / monthly / construction),
  auto-confirm email, send welcome email, then **auto-redirect into the
  onboarding wizard** (the app already has the session after registration —
  verify the EF returns a usable session or force a sign-in pass).

### 4.2 Step 2 — Verification (open design decision)

Options to weigh in Phase C:
- **(a) Keep current behavior** — EF auto-confirms; no extra step (fastest
  time-to-value; relies on honeypot + validation for abuse).
- **(b) Email confirm** — enable Supabase email confirmation; user clicks a
  link before entering (more Zoho-like; adds friction + depends on Resend
  delivery for the confirm mail).
- **(c) Soft verification** — allow entry immediately, show a "verify your
  email" banner in the shell until confirmed (Zoho Mail style; no signup
  friction, improves trust + deliverability signals later).
- **(d) OTP** — mobile OTP at signup (heaviest friction; only if abuse data
  demands it).

### 4.3 Step 3 — Post-Login Onboarding Wizard (reuse + extend `OnboardingView`)

The wizard already collects segment → project type → modules → profile.
Extend it to also collect **plan + billing** in the appropriate position
(segment first, then plan/billing, then project type/modules), and persist via
`updateOrg` (extend its signature for `plan`/`billing` if not already present).
This is where the user *actually* chooses pricing — post-creation, like Zoho's
trial flow — but keeps SiteTrack's plan-gating/quota behavior intact.

### 4.4 No-Break Constraints (must hold through C/A)

- `register_org` EF must keep creating the same rows (org/profile/membership)
  and sending the welcome email; only the accepted input shape changes
  (plan/billing/segment become optional with defaults).
- Existing users of the approval-gated path must be unaffected.
- Plan gating/quota checks that read `organizations.plan` must see the
  onboarding-chosen plan (updateOrg must write it before any gated view is
  used, or default it at creation and let onboarding overwrite).
- i18n: new/relabelled strings need `en`/`hi`/`te` keys + parity test update.
- Smoke/unit/e2e-mock suites covering `/register` and `registerOrg` must be
  updated alongside.

---

## 5. Open Questions for Phase C

1. **Verification story** — which of 4.2(a–d)? Affects abuse posture and
   time-to-value.
2. **Session handoff** — does `register_org` currently return a usable session
   for auto-redirect into onboarding, or must we do an explicit sign-in pass
   (password still known client-side at registration — possible)? Verify in EF
   code.
3. **Plan default** — is `basic` correct, or should self-service default to
   `pro` with a limited-duration trial/quota (Zoho-style trial-first)?
4. **Phone/OTP** — keep phone as optional field, or add OTP verify in a later
   iteration?
5. **Onboarding step order** — confirm segment → plan/billing → project type →
   modules is the right order for the existing wizard.
6. **Existing-user early exit** — when the email is already registered, the EF
   currently returns `email-taken` → redirect to sign-in; the new minimal form
   should make this a smooth "account exists — sign in" path.
7. **Do we keep plan/billing on the `/register` URL deep-link params**
   (`?plan=pro&billing=annual` from pricing-page CTAs)? Likely yes — carry them
   into the onboarding wizard instead of dropping them.
8. **A/B/measurement** — do we add a funnel marker for the new 3-step flow?

---

## 6. Next Steps (B → C handoff)

1. Review this report; confirm or adjust the **proposed direction** (§4).
2. Answer the **open questions** (§5) — these gate the C-phase deep-dive.
3. Phase C produces: decision record, final step-by-step implementation plan
   (files, EF changes, migration needs — likely none, onboarding query changes,
   i18n keys, test updates), and a verification checklist.
4. Phase A implements per the C plan and runs the standard gate suite
   (lint · tsc · build · smoke · vitest · e2e-mock) before push.

---

## Appendix — Sources & Reference Points

- Zoho signup pages researched: `zoho.com/signin.html`,
  `zoho.com/workplace/signup.html`, `zoho.com/one/signup.html`,
  `zoho.com/mail/help/login-to-zoho.html` (Zoho Mail personal mobile-OTP flow),
  Zoho Flow help (email verification + org setup wizard), ZeptoMail getting
  started (org → terms → domain flow), Zoho One onboarding/implementation docs
  (deferred billing, admin-console setup).
- In-repo reference: `docs/ZOHO_WORKPLACE_COMPARISON.md` (backend EF flow
  comparison; complements this UX-focused report).
- Current implementation: `src/features/auth/OrgRegisterView.tsx`,
  `src/app/orgRegisterQueries.ts`,
  `supabase/functions/register_org/index.ts`,
  `src/features/org/OnboardingView.tsx`, `src/app/onboardingQueries.ts`.