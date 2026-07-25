# M-02: Auth — Staff Invites, Org Invites, Password Reset Flow

## Roles
- Tester role: Admin (Super Admin / Org Admin)

## Pre-requisites
- [ ] Logged in as Admin user
- [ ] Org has at least one unassigned seat / available member slot
- [ ] A test email inbox ready to receive invite
- [ ] Browser: Chrome incognito (two windows)

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Navigate to `/settings/members` or `/org/members` | Member list page shows current members, their roles, and an "Invite Member" button | | |
| 2 | Click "Invite Member" | Modal or slide-out form: email, role dropdown (Architect/PM/Contractor/Client), optional message | | |
| 3 | Enter invalid email, click Send | Inline validation: "Invalid email address" | | |
| 4 | Enter valid email (test inbox), select "Project Manager" role, click Send | Toast: "Invitation sent". Table shows new row with "Pending" status | | |
| 5 | Open test inbox, find invite email | Email contains org name, role, and "Accept Invitation" button | | |
| 6 | Open invite link in incognito window (not logged in) | Registration page pre-filled with email, shows org name + role, password fields | | |
| 7 | Set password + name, click Accept | Account created. Logged in as PM. Redirected to dashboard. Org name visible | | |
| 8 | Log out, log back in as Admin. Go to `/settings/members` | Invited user now shows "Active" status | | |
| 9 | Click "Invite Member" again. Enter same email as step 4 | Error: "User is already a member" or "Invitation already sent" | | |
| 10 | Find the new PM user row, click "Remove" or "Revoke" | Confirmation dialog: "Remove [name] from org?" | | |
| 11 | Confirm removal | User removed from table. Toast: "Member removed" | | |
