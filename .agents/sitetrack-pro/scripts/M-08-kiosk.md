# M-08: Kiosk — Labour Kiosk, Site Wall, Snapshot

## Roles
- Tester roles: Contractor (kiosk operator), Architect/PM/Client (view)

## Pre-requisites
- [ ] Logged in as Contractor
- [ ] Project with kiosk mode enabled
- [ ] Browser: Chrome (or mobile view via DevTools)

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Navigate to kiosk URL (e.g. `/kiosk/labour` or `/labour-kiosk`) | Kiosk landing page: large buttons, minimal UI. Labour Kiosk, Site Wall, Daily Snapshot options | | |
| 2 | Click "Labour Kiosk" | Labour attendance interface: worker list with check-in/check-out buttons, name + photo + trade | | |
| 3 | Click "Check In" for a worker named "Ramesh" | Button changes to "Checked In" with timestamp. Toast: "Ramesh checked in" | | |
| 4 | Click "Check Out" for the same worker | Button returns to "Check In". Duration shown: "X hours Y minutes" | | |
| 5 | Navigate back to kiosk home. Click "Site Wall" | Photo wall / timeline: photos taken at the site with timestamp + caption. Infinite scroll or paginated | | |
| 6 | Click "Add Photo" | Camera/file picker. Upload a site photo with caption "Foundation work" | | |
| 7 | Photo appears on wall with timestamp + caption | | | |
| 8 | Navigate back to kiosk home. Click "Daily Snapshot" | Today's snapshot: weather, total workers checked in today, milestones updated, photos added. "End Day" button | | |
| 9 | Click "End Day" or "Complete Snapshot" | Snapshot saved. Email/PDF option presented. Summary: "Day completed: X workers, Y photos, Z updates" | | |
| 10 | Log out. Log in as **Client**. Navigate to the project | No kiosk link in nav (Client cannot access kiosk) | | |
