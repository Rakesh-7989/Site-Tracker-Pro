# M-12: Offline — Offline Banner, PWA Shell, Reconnect

## Roles
- Tester roles: all

## Pre-requisites
- [ ] Logged in as PM with loaded data
- [ ] Browser: Chrome incognito
- [ ] DevTools → Network tab

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | Verify PWA: Look for install icon in address bar or 3-dot menu → "Install SiteTrack Pro" | Install prompt available. App is installable as PWA | | |
| 2 | With app working, open DevTools → Network → check "Offline" | Page still visible (cached shell). "You are offline" banner appears at top | | |
| 3 | Navigate to a previously visited project detail page | Page loads from cache. Data visible if previously cached | | |
| 4 | Try to create a new issue while offline | Either: (a) action queued with "Pending sync" indicator, or (b) disabled with toast "You need an internet connection" | | |
| 5 | Uncheck "Offline" in DevTools (reconnect) | Banner disappears. Queued actions sync automatically. Toast: "Back online" | | |
| 6 | Reconnect and check if offline-created items appear | Items synced successfully. No data loss | | |
