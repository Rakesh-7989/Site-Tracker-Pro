# SiteTrack Pro — Signup & Login Guide

> A step-by-step manual for all 22 roles: how to create your account, how to log in, and what to expect after login.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Signup Path A — Self-Service Org Registration (Firm Owner)](#2-signup-path-a--self-service-org-registration-firm-owner)
3. [Signup Path B — Approval-Gated Signup](#3-signup-path-b--approval-gated-signup)
4. [Signup Path C — Invite-Based Signup (Team / Contractor / Client)](#4-signup-path-c--invite-based-signup-team--contractor--client)
5. [Signup Path D — Staff Invite (Platform Staff / Superadmin)](#5-signup-path-d--staff-invite-platform-staff--superadmin)
6. [Login — Org Lane](#6-login--org-lane)
7. [Login — Staff Lane](#7-login--staff-lane)
8. [Demo Login](#8-demo-login)
9. [Multi-Factor Authentication (MFA)](#9-multi-factor-authentication-mfa)
10. [Post-Login Dashboard by Role](#10-post-login-dashboard-by-role)
11. [Plan & Role Availability](#11-plan--role-availability)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Quick Reference

### All 22 Roles

| # | Role | Signup Method | Login Lane |
|---|------|---------------|------------|
| 1 | Platform Admin (`superadmin`) | Staff invite only | Staff |
| 2 | Firm Owner (`orgadmin`) | Self-service register OR approval-gated signup | Org |
| 3 | Project Manager (`pm`) | Invite from org admin | Org |
| 4 | Promoter (`promoter`) | Invite from org admin | Org |
| 5 | Project Admin (`project_admin`) | Invite from org admin | Org |
| 6 | Sales / BD (`prospector`) | Invite from org admin | Org |
| 7 | Architect (`architect`) | Invite from org admin | Org |
| 8 | Senior Architect (`senior_architect`) | Invite from org admin | Org |
| 9 | Junior Architect (`junior_architect`) | Invite from org admin | Org |
| 10 | Design Architect Interior (`design_architect_interior`) | Invite from org admin | Org |
| 11 | Design Head (`design_head`) | Invite from org admin | Org |
| 12 | Consultant Head (`consultant_head`) | Invite from org admin | Org |
| 13 | MEP Consultant (`mep_consultant`) | Invite from org admin | Org |
| 14 | Structural Consultant (`structural_consultant`) | Invite from org admin | Org |
| 15 | Consultant (`consultant`) | Invite from org admin | Org |
| 16 | Designer (`designer`) | Invite from org admin | Org |
| 17 | Site Engineer (`site_engineer`) | Invite from org admin | Org |
| 18 | Contractor (`contractor`) | Invite from org admin | Org |
| 19 | Sub-contractor (`sub_contractor`) | Invite from org admin | Org |
| 20 | Vendor (`vendor`) | Invite from org admin | Org |
| 21 | Client / Unit Buyer (`client`) | Invite from org admin | Org |
| 22 | Site Inspector RERA (`site_inspector`) | Invite from org admin | Org |

### Signup Paths at a Glance

| Path | Who | URL | Account Created By |
|------|-----|-----|--------------------|
| A — Self-service | Firm Owner (orgadmin) | `/register` | Edge function (instant) |
| B — Approval-gated | Anyone requesting access | `/signup` | Superadmin after review |
| C — Invite-based | All team / project roles | `/accept-invite?email=...` | Org admin via invite |
| D — Staff invite | Superadmin / Staff | `/staff/join?token=...` | Existing staff member |

---

## 2. Signup Path A — Self-Service Org Registration (Firm Owner)

**Who uses this:** A new construction firm / consultancy that wants to start using SiteTrack Pro. The person registering will become the Firm Owner (`orgadmin`).

**URL:** `https://<your-domain>/register`

### Steps

```
1. Open /register in your browser
         |
2. Choose a plan
   ┌─────────────────────────────────────────┐
   │  Basic   ₹5,999/mo   — 7 roles         │
   │  Pro     ₹11,999/mo  — 13 roles        │
   │  Business ₹19,999/mo — 17 roles        │
   └─────────────────────────────────────────┘
         |
3. Fill in the registration form
   ┌─────────────────────────────────────┐
   │  Firm name         [______________] │
   │  Contact name      [______________] │
   │  Work email        [______________] │
   │  Phone (optional)  [______________] │
   │  Password          [______________] │
   │  Confirm password  [______________] │
   │  ✓ I agree to Terms & Privacy       │
   │                                      │
   │  [  Register  ]                     │
   └─────────────────────────────────────┘
         |
4. Click "Register"
         |
5. Edge function creates:
   - Auth account (email + password)
   - Your organisation
   - Your profile as orgadmin
         |
6. Success screen: "Your workspace is ready!"
   Shows firm name, plan, your email
         |
7. Click "Sign in to SiteTrack Pro"
         ↓
   You are taken to /login
```

**Next — Login:** Use your work email + password at `/login`.

---

## 3. Signup Path B — Approval-Gated Signup

**Who uses this:** When self-service registration is not available, or for organisations that need manual review before activation.

**URL:** `https://<your-domain>/signup`

### Steps

```
1. Open /signup in your browser
         |
2. Pick a plan + billing period (monthly / annual)
         |
3. Fill in the request form
   ┌─────────────────────────────────────┐
   │  Firm name         [______________] │
   │  Contact name      [______________] │
   │  Work email        [______________] │
   │  Phone (optional)  [______________] │
   │  Message (optional)[______________] │
   │                                      │
   │  [  Submit Request ]                │
   └─────────────────────────────────────┘
         |
4. Click "Submit Request"
         |
5. Your request is sent to the SiteTrack team
   Status: pending review
         |
6. You see: "Check your email — we'll review your request"
         |
7. SiteTrack superadmin reviews at /admin/signups
   ┌────────────────────────────────────────┐
   │  PENDING REQUESTS                      │
   │  ┌──────────────────────────────────┐  │
   │  │ ABC Builders — abc@email.com     │  │
   │  │ Requested: Pro plan              │  │
   │  │ [Approve] [Reject]               │  │
   │  └──────────────────────────────────┘  │
   └────────────────────────────────────────┘
         |
8. If approved → Edge function creates:
   - Auth account
   - Your organisation
   - Your profile as orgadmin
   - Invite email sent to you
         |
9. If rejected → you receive a notification with reason
         |
10. Check your email → you receive invite instructions
         ↓
    Follow the invite link to log in at /login
```

---

## 4. Signup Path C — Invite-Based Signup (Team / Contractor / Client)

**Who uses this:** All roles EXCEPT the Firm Owner and Platform Staff. This includes Project Managers, Architects, Engineers, Contractors, Vendors, Clients, and every other project role.

**Who sends the invite:** Your organisation's admin (Firm Owner or delegated admin) adds you from `/org/members`.

### Steps — Admin Side

```
1. Org admin goes to /org/members
         |
2. Clicks "Add Member"
         |
3. Fills in:
   - Name
   - Email
   - Role (from the list below)
   ┌─────────────────────────────────────┐
   │  Role selection depends on the      │
   │  org's subscription plan:           │
   │  Basic   → 7 roles available        │
   │  Pro     → 13 roles available       │
   │  Business → 17 roles available      │
   │  Enterprise → All customer roles    │
   └─────────────────────────────────────┘
         |
4. Clicks "Send Invite"
         |
5. System sends email with:
   - Welcome message
   - Organisation name
   - Your assigned role
   - A temporary password
```

### Steps — Invitee Side

```
1. Check your email inbox
         |
2. Open the invite email from SiteTrack Pro
         |
3. Note your temporary password (shown in email)
         |
4. Visit /login
         |
5. Enter your email + temporary password
         |
6. System prompts you to change your password
         |
7. Set a new password
         |
8. You are logged in and redirected to your dashboard
         ↓
   Your role is now active in the organisation
```

### Alternative — Accept Invite Page

If you received a link instead of a temporary password:

```
1. Visit /accept-invite?email=your@email.com
         |
2. Page shows:
   ┌─────────────────────────────────────┐
   │  You've been invited to join        │
   │  ABC Builders as "Project Manager"  │
   │                                      │
   │  [  Sign in to SiteTrack Pro  ]     │
   └─────────────────────────────────────┘
         |
3. Click the button → taken to /login
4. Sign in with your email + temporary password
```

---

## 5. Signup Path D — Staff Invite (Platform Staff / Superadmin)

**Who uses this:** Platform-level staff — Super Admin, Support, Operations.

**Who sends the invite:** An existing staff Owner or Head from the Staff Admin view.

**URL:** `https://<your-domain>/staff/join?token=<single-use-token>`

### Steps

```
1. Existing staff member generates invite link
   from Staff Admin panel
         |
2. Link is sent to you (email / chat)
         |
3. Visit the /staff/join?token=... URL
         |
4. Fill in the form
   ┌─────────────────────────────────────┐
   │  Name             [______________] │
   │  Work email       [______________] │
   │  Password         [______________] │
   │  Confirm password [______________] │
   │                                      │
   │  [  Join as Staff  ]               │
   └─────────────────────────────────────┘
         |
5. Click "Join as Staff"
         |
6. Edge function creates:
   - Auth account
   - Staff profile with tier (owner/head/member)
   - Sets staff access areas
         |
7. Success → auto-logged in
         ↓
   You land at /admin dashboard
```

**Note:** Staff tokens are single-use. If the link expires, ask the sender to generate a new one.

---

## 6. Login — Org Lane

**URL:** `https://<your-domain>/login`

**Who uses this:** All organisation roles — Firm Owner, Project Manager, Architect, Engineer, Contractor, Vendor, Client, etc.

### Email + Password Login

```
1. Open /login
         |
2. Select the "Email" tab (default)
         |
3. Enter your email
         |
4. Enter your password
         |
5. Click "Sign In"
         |
   ┌───────── MFA CHECK ─────────┐
   │  If you have 2FA enabled:   │
   │  Enter 6-digit code from    │
   │  your authenticator app     │
   └─────────────────────────────┘
         |
6. You are logged in
         ↓
   Routed to your dashboard
```

### Magic Link Login (No Password)

```
1. Open /login
         |
2. Select the "Magic Link" tab
         |
3. Enter your email
         |
4. Click "Send Magic Link"
         |
5. Check your email inbox
         |
6. Click the link in the email
   (OR enter the 6-digit OTP shown in the email)
         |
7. You are logged in
         ↓
   Routed to your dashboard
```

### Forgot Password

```
1. On /login, click "Forgot Password"
         |
2. Enter your email
         |
3. Click "Send Reset Email"
         |
4. Check your email → click the reset link
         |
5. You land at /auth/reset
         |
6. Enter new password
         |
7. Confirm new password
         |
8. Click "Reset Password"
         |
9. You are logged in automatically
         ↓
   Routed to your dashboard
```

### Post-Login Routing (Org Lane)

| If you are... | You land at... |
|---------------|----------------|
| Staff member with active org | `/dashboard` |
| Staff member without active org | `/admin` |
| Regular org member | `/dashboard` |

---

## 7. Login — Staff Lane

**URL:** `https://<your-domain>/staff/login`

**Who uses this:** Platform Staff only — Super Admin (`superadmin` role).

### Steps

```
1. Open /staff/login
         |
2. Enter your staff email
         |
3. Enter your password
         |
4. Click "Sign In"
         |
5. You are logged in
         ↓
   Routed to /admin
```

**Note:** Regular org members who try to access `/staff/login` will not be able to log in here. Use the Org lane (`/login`) instead.

---

## 8. Demo Mode

> The old "demo login" (one-click pick a demo role, password `demo1234`) has been **removed**.
> The live product uses real account authentication only — see sections 2–7.

**What exists today:**

| Demo surface | Where | How |
|-------------|-------|-----|
| **Demo project seed** | Live app | Org admins click **"Load demo project"** on `/projects` — the `seed_demo_project` RPC creates a "Demo Villa — Green Meadows" project (schedules, budget, expenses, issues) in the caller's own org so risk signals / burn display with real data. |
| **Mock seed data** | Local / evaluation build only | `src/data/seed.demo.ts` (`VITE_BACKEND=local` mock mode) provides sample users and plan metadata for offline development and test harnesses. This is **not** part of the live product. |

---

## 9. Multi-Factor Authentication (MFA)

MFA adds an extra layer of security using Time-based One-Time Passwords (TOTP) via any authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.).

### Enabling MFA

```
1. Log in to your account
         |
2. Go to /auth/settings or your profile settings
         |
3. Find "Two-Factor Authentication (2FA)"
         |
4. Click "Enable 2FA"
         |
5. Scan the QR code with your authenticator app
         |
6. Enter the 6-digit code from the app
         |
7. Click "Verify"
         |
8. 2FA is now active
```

### Logging in with MFA

```
1. Enter your email + password at /login
         |
2. MFA challenge screen appears:
   ┌─────────────────────────────────────┐
   │  Enter your 2FA code                │
   │                                      │
   │  [__] [__] [__] [__] [__] [__]     │
   │                                      │
   │  [  Verify  ]                       │
   └─────────────────────────────────────┘
         |
3. Open your authenticator app
         |
4. Enter the 6-digit code
         |
5. Click "Verify"
         ↓
   You are logged in
```

### Recovery

If you lose access to your authenticator app, contact your org admin or SiteTrack support to disable MFA on your account.

---

## 10. Post-Login Dashboard by Role

After login, each role sees a dashboard tailored to their work:

| Role | Dashboard Type | Key Sections |
|------|---------------|--------------|
| superadmin | Admin Console | Platform overview, orgs, users, billing, signup requests, audit log |
| orgadmin | Default Dashboard | Org overview, projects, members, billing, settings |
| promoter | Promoter Dashboard | Finance-first view, project health, revenue tracking |
| project_admin | Default Dashboard | All projects, resource allocation |
| prospector | Default Dashboard | Leads, opportunities |
| pm | Default Dashboard | Active projects, milestones, team, DPRs |
| architect | Default Dashboard | Drawings, RFIs, design reviews |
| senior_architect | Default Dashboard | Design oversight, approvals |
| junior_architect | Default Dashboard | Assigned tasks, drawing updates |
| design_architect_interior | Default Dashboard | Interior design projects |
| design_head | Default Dashboard | Design team oversight |
| consultant_head | Default Dashboard | Consultant team management |
| mep_consultant | Default Dashboard | MEP-related tasks |
| structural_consultant | Default Dashboard | Structural reviews |
| consultant | Default Dashboard | Assigned consultations |
| designer | Default Dashboard | Design tasks |
| site_engineer | Field Dashboard | Voice DPR, daily updates, attendance, issues |
| contractor | Default Dashboard | Field uploads, RFIs, worklogs, RA bills |
| sub_contractor | Default Dashboard | Assigned work items |
| vendor | Default Dashboard | Purchase orders, material prices |
| client | Client Dashboard | Read-only project progress, drawings, invoices |
| site_inspector | Default Dashboard | Inspection reports, compliance checks |

---

## 11. Plan & Role Availability

The roles available to your organisation depend on your subscription plan:

| Plan | Price | Available Roles |
|------|-------|-----------------|
| **Basic** | ₹5,999/mo | Firm Owner, Promoter, PM, Architect, Site Engineer, Contractor, Sub-contractor, Client (8 roles) |
| **Pro** | ₹11,999/mo | Basic + Project Admin, Senior Architect, Junior Architect, Design Architect Interior, MEP Consultant, Structural Consultant, Consultant, Designer, Vendor (15 roles) |
| **Business** | ₹19,999/mo | Pro + Sales/BD, Design Head, Consultant Head, Site Inspector (19 roles) |
| **Enterprise** | Custom | All 21 customer roles (everything except Super Admin) |
| **Custom** | Custom | Same as Enterprise |

### Role Signup Method by Plan

| Plan | New Org Signup | Adding Members |
|------|----------------|----------------|
| Basic | Self-service (`/register`) | Invite only |
| Pro | Self-service or approval | Invite only |
| Business | Self-service or approval | Invite only |
| Enterprise | Approval or manual | Invite only |

---

## 12. Troubleshooting

### I didn't receive the invite email
- Check your spam/junk folder
- Ask the sender to verify the email address
- Ask the sender to resend the invite
- If using a company email, ask your IT to allowlist `@supabase.co` emails

### My temporary password doesn't work
- Passwords are case-sensitive
- Copy-paste the password carefully (no extra spaces)
- If expired, ask the admin to send a new invite

### I can't log in with my email + password
- Click "Forgot Password" on the login screen
- Check your email for the reset link
- If still stuck, contact your org admin

### The magic link didn't work
- Links expire after 1 hour — request a new one
- Check that you're using the same browser/device
- If your email client "consumed" the link (security scanners), use the OTP code shown in the email instead

### MFA code not working
- Ensure your device's time is synced (automatic time zone)
- Generate a new code and try again
- If repeatedly failing, contact support to reset MFA

### I chose the wrong plan during registration
- Contact SiteTrack support to change your plan
- Or upgrade/downgrade from org settings after login

### "Demo Data" button is not showing
- Demo mode may be disabled in production
- Try logging in with demo account credentials manually:
  - Email: any demo email from the table in Section 8
  - Password: `demo1234`

### Staff invite link is invalid
- Staff tokens are single-use and time-limited
- Ask the sender to generate a new invite link
