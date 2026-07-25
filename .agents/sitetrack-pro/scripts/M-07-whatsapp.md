# M-07: WhatsApp — Send, History, Status Badges

## Roles
- Tester roles: PM, Architect (send), Contractor (receive), Client (receive)

## Pre-committeres
- [ ] Logged in as PM
- [ ] Project has at least one DPR entry
- [ ] WhatsApp desktop or web available
- [ ] Browser: Chrome incognito

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Open a DPR entry. Click WhatsApp icon/share button | WhatsApp opens (or new tab) with pre-populated message: "Daily Progress Report – [Project] – [Date]\n[Summary]\nView full report: [link]" | | |
| 2 | Send to a test contact/group | Message appears in WhatsApp chat. Link is clickable | | |
| 3 | Click the link from WhatsApp | Opens DPR in browser (logged-in users). If not logged in, redirects to login then back to DPR | | |
| 4 | Navigate to project → Updates or Chat tab | Any WhatsApp-sent updates appear with a green checkmark badge ("Sent via WhatsApp") | | |
| 5 | Send another DPR via WhatsApp. Check back in app | Messages/Updates tab shows the WhatsApp share in history with timestamp and status | | |
| 6 | Log out. Log in as **Contractor**. Open the same project → Updates tab | Can see WhatsApp history. Cannot send WhatsApp (no share button) | | |
| 7 | Log out. Log in as **Client**. Open the same project → Updates tab | Can see WhatsApp history. No share/send capability | | |
