---
status: active
date: 2026-05-25
deciders: Rakesh, Claude
---

# 0005 — Kiosks as the killer differentiator wedge

## Context

Competitive analysis (Procore / Autodesk ACC / Powerplay / BuildSupply /
Falconbrick) showed Site-Tracker-Pro has two genuine unique angles in
Indian construction:

1. **Labour attendance kiosk** — sub-contractor inflation is a 15–25%
   margin leak. Excel + paper + thumbprint is the norm. A tablet at the
   site entrance with QR/face/badge clock-in solves a ₹-quantified daily
   pain that nobody else owns.
2. **Site office wall kiosk** — a wall-mounted TV in the site office
   showing today's plan + workforce + open issues + weather + photo wall
   is visible to every visitor. Branding lever + visible "we use
   Site-Tracker" billboard. Inspired by TripGZio's `gz-tv-app`.

## Decision

Batch 3 ships two standalone views in App.jsx:

- `LabourAttendanceKioskView` — black/cream tablet UI, 6-digit project
  pair code (deterministic from project id so it's stable across reloads),
  badge + name + trade input, writes to existing `labour[projectId]`
  storage. Audit row on each clock-in/out.
- `SiteWallKioskView` — 10-foot UI, large numerals, no hover effects,
  auto-clock refresh every 30s, photo wall, "exit kiosk" only nav back.
  Uses today's labour + issues + updates + milestones for live tiles.

Both pages are at top-level nav (not nested in a project tab) so they can
be opened on a dedicated tablet without exposing the rest of the app.

## Consequences

- ✅ Sales demos now have a "wow" moment beyond features — physical
  hardware angle (point at the wall: "this is your site office board").
- ✅ Labour kiosk is the gated "killer" feature on Pro plan onwards —
  big upgrade lever for Basic customers feeling the labour inflation pain.
- ⚠️ Real face/QR/biometric capture is mocked for v1 (just badge + name).
  Capacitor camera plugin + `face-api.js` adapter coming in Batch 4.
- ⚠️ Tablet hardware procurement is a customer concern — we recommend
  Lenovo Tab M10 (₹12k) or similar, but the app is browser-only so any
  Android/iOS/Windows tablet works.
- ⚠️ Kiosk views need to lock down navigation (no escape to admin) when
  truly deployed on customer hardware. v1 has a visible "exit kiosk"
  button — that's intentional for demos, swap to a `kiosk-lock` mode in
  Batch 4 (TripGZio's pattern).
