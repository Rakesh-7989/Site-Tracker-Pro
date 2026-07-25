# M-01: Auth — Password, Magic Link, OTP, MFA

## Roles
- Tester role: all (Architect, PM, Contractor, Client, Admin)

## Pre-requisites
- [ ] Test accounts exist for each role (password-based)
- [ ] At least one account has MFA/TOTP enabled
- [ ] Browser: Chrome incognito
- [ ] URL: https://site-tracker-pro.vercel.app

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Navigate to `/login` | Login form is displayed: email + password fields, "Sign in with Magic Link" button, "Forgot password?" link | | |
| 2 | Enter invalid email (e.g. `notanemail`) and click Sign In | Inline validation shows "Invalid email" or equivalent | | |
| 3 | Enter valid email + wrong password, click Sign In | Error toast: "Invalid credentials" or "Incorrect email or password" | | |
| 4 | Enter valid email + correct password for Architect account, click Sign In | Redirected to dashboard. URL contains `/dashboard` or `/projects`. User name visible in top-right profile area | | |
| 5 | Log out (click profile → Sign Out) | Returned to `/login`. No cached session | | |
| 6 | Click "Sign in with Magic Link" | Email input appears, button changes to "Send Magic Link" | | |
| 7 | Enter email of Magic-Link-capable account, click Send | Toast: "Magic link sent!" or "Check your email" | | |
| 8 | (In another tab) Open inbox, find magic link email, click link | Logged in automatically, redirect to dashboard | | |
| 9 | Log out. Navigate to `/login`. Click "Forgot password?" | Email input for password reset | | |
| 10 | Enter email, click Send Reset Link | Toast: "Reset link sent" | | |
| 11 | (In email) Click reset link | Password reset form: new password + confirm password fields | | |
| 12 | Enter new valid password, submit | Toast: "Password updated". Redirected to `/login` | | |
| 13 | Sign in with new password | Successfully logged in | | |
| 14 | If MFA-enabled account exists: sign in with email + password | After password, MFA challenge screen appears (TOTP 6-digit input) | | |
| 15 | Enter wrong TOTP code | Error: "Invalid code. Try again" | | |
| 16 | Enter correct TOTP code | Logged in, redirected to dashboard | | |
