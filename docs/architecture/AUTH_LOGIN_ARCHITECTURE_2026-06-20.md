# SiteTrack Pro Auth/Login Architecture - 2026-06-20

## Why the Vercel access page appeared

The clicked email link redirected to a protected duplicate Vercel deployment, so Vercel stopped the
request before the SiteTrack app could run and showed "You Need Access".

Canonical app URL:

```text
https://sitetrackpro.in
```

Old emails are immutable: the redirect target is baked into the email when it
is sent. If an email points to the duplicate host, request a fresh email from
the canonical `/login` page or use the 6-digit OTP printed in the same email.

## R&D Baseline

- Supabase Auth redirect URLs must match the project allow-list. Site URL is
  the fallback for email confirmations and password resets when no valid
  redirect is supplied.
- Supabase email templates can include both `{{ .ConfirmationURL }}` and
  `{{ .Token }}`. OTP is safer when Gmail/Outlook link scanners prefetch and
  consume magic links.
- OWASP separates authentication from authorization: login proves identity,
  then RBAC/capability checks decide what the authenticated user may do.
- OWASP multi-tenant guidance treats tenant isolation as a data-layer concern,
  not a UI-only concern. Every org/project query must be scoped by membership
  and backed by RLS/RPC checks.

References:

- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html

## Existing Implementation Inventory

Public entry:

- `/` landing page.
- `/signup` public request-access form. It creates a pending
  `signup_requests` row through `submit_signup_request`; it does not create an
  org/account directly.
- `/pay/:requestId` signup payment helper.
- `/login` single production auth screen with password, magic link, OTP
  fallback, and TOTP MFA challenge.
- `/auth/reset` password-reset landing page.
- `/staff/join?token=...` platform staff invite redemption.

Platform staff:

- `profiles.is_staff` plus `profiles.staff_tier`.
- Staff tiers: `owner`, `head`, `member`.
- Staff areas: `signups`, `orgs`, `users`, `roles`, `upgrades`.
- Owner/head can reach all staff areas. Member can be area-scoped.
- `/admin/signups` approves/rejects org signup requests.
- Owner can approve without payment; non-owner staff need owner-confirmed
  payment.

Customer org users:

- `profiles.role` is identity role.
- `org_members.role` is org-tier role.
- `project_members.role` is project-tier role.
- `RoleResolver` composes identity + org + project + overrides + custom roles.
- `/org/*` is for org admins and org-level workflows.
- `/projects/*` is for project work after session hydration.

## Target Login Split

One physical `/login` page can support two clear lanes:

1. Platform staff lane: SiteTrack owner/head/member sign in here, then land in
   `/admin` or a staff-area route based on `staff_tier` and `staffAreas`.
2. Customer/org lane: org admins, PMs, architects, contractors, clients, and
   vendors sign in here, then land in `/dashboard` with active org/project
   context.

This keeps credentials simple while still making the product mentally clear:
"SiteTrack team" and "Customer workspace" are different post-login experiences,
not different auth systems.

## Flow Contract

1. Visitor wants a plan: `/signup` creates a pending signup request.
2. Platform owner/head/member reviews it at `/admin/signups`.
3. Approval creates org + org admin membership and sends invite/login email.
4. Applicant clicks fresh canonical email link or enters OTP.
5. App hydrates profile, org memberships, project memberships, and staff grants.
6. Router decides landing:
   - staff with no active org -> `/admin`
   - staff with area grants -> first allowed `/admin/*`
   - org admin/member -> `/dashboard`
   - no profile/org -> `/profile/complete` or support message
7. Capabilities, not route names, decide final access.

## Immediate Hardening Added

`getCanonicalAppUrl()` now rejects:

- any non-canonical `*.vercel.app` preview/duplicate host
- stale placeholder `https://sitetrackpro.in`

Local dev `http://localhost:5173` still works. Production auth emails should
always use `https://sitetrackpro.in`.

## Dashboard Checks Still Required

These cannot be changed from this machine without Supabase/Vercel tokens:

1. Supabase Auth -> URL Configuration:
   - Site URL: `https://sitetrackpro.in`
   - Redirect URLs:
     - `https://sitetrackpro.in`
     - `https://sitetrackpro.in/**`
     - `http://localhost:5173`
     - `http://localhost:5173/**`
2. Supabase Auth -> Email Templates:
   - Prefer `{{ .ConfirmationURL }}` plus visible `{{ .Token }}`.
   - Do not build links from `{{ .SiteURL }}` if Site URL might drift.
3. Edge Function secrets:
   - `PUBLIC_SITE_URL=https://sitetrackpro.in`
4. Vercel:
   - Disable/remove duplicate protected hostname/project if it still appears.
   - Keep Git production deployment attached to `sitetrack-rakesh`.

## Implemented Decision

The app now uses one `/login` screen with two lanes:

- **Org users** -> customer organization and project workspace.
- **SiteTrack staff** -> platform owner/head/member admin areas.

The selected lane is stored in `localStorage` so magic-link users keep the same
intent after the email round trip. The hydrated session still decides the final
route, and capability/RLS guards remain the real authorization boundary.
