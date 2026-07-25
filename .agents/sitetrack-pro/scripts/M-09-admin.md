# M-09: Admin Panel — Orgs, Users, Billing, Audits

## Roles
- Tester roles: Admin (Super Admin)

## Pre-requisites
- [ ] Logged in as Super Admin
- [ ] At least 2 orgs exist in the system
- [ ] Browser: Chrome incognito

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Navigate to `/admin` | Admin panel: cards/links to Orgs, Users, Billing, Audit Log, Settings, Branding | | |
| 2 | Click "Orgs" | Org list: searchable table with name, plan tier, member count, status, created date | | |
| 3 | Click on an org name | Org detail: member list, current plan, usage stats, projects. Edit button for org settings | | |
| 4 | Click "Edit" → change org name, Save | Name updated. Toast: "Org updated" | | |
| 5 | Navigate back to admin home. Click "Billing" | Billing dashboard: org billing table, invoices, payment history, plan summary | | |
| 6 | Click "Audit Log" | Audit log table: event type, user, org, timestamp, details. Filterable by date/type/org | | |
| 7 | Apply a filter: event type = "project.create", last 7 days | Table filters correctly. Only matching entries shown | | |
| 8 | Navigate to "Settings" (admin) | Toggle switches: allow self-registration, require MFA, maintenance mode, etc | | |
| 9 | Toggle one setting, refresh the page | Setting persists | | |
| 10 | Navigate to "Branding" | Org branding table: org name, logo preview, accent color, primary color. "Edit" per org | | |
| 11 | Edit an org's branding → change accent color to red (#FF0000), Save | Color updates. Preview reflects change | | |
| 12 | Navigate away and back to Branding | Change persists | | |
