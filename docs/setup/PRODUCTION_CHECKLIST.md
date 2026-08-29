# Production Readiness Checklist

> Honest pre-paying-customer gates. Mirrors HRMS / TripGZio's discipline of
> documenting **what's known broken** rather than claiming "production ready"
> while shipping demo-blocker fixes the same day.

Last reviewed: **2026-06-30**.

---

## Hard gates (MUST pass before first paying customer)

### Security
- [ ] **Supabase RLS policies enforced at runtime** — schema + 04_rls_tests.sql
      exist, but `dbSessionContext` / `withTenantContext` style middleware not
      yet wired in app. **Without this, cross-tenant data leak is possible.**
- [x] **Demo handler bypass removed in prod build** — `loadDemoData()` button
      hidden when `VITE_BACKEND=supabase` (fixed `src/features/shell/index.jsx:192`).
- [ ] **No leaked credentials in repo** — `.env.example` only. Rotate any
      keys ever pasted in chat / docs.
- [ ] **CSP + HSTS headers** verified live (vercel.json + netlify.toml ✅).
- [ ] **Rate limiting on auth endpoints** — Supabase Auth handles by default,
      verify the limit values in dashboard.
- [ ] **Password reset token expiry** — verify 15-min Supabase default.

### Compliance + audit
- [x] Immutable audit log (`recordAudit()`) wired into 6 key actions.
- [ ] Wire `recordAudit()` into remaining CRUD: drawing release, RA approval,
      RFI submit, change order, expense approve, material delete.
- [ ] Server-side mirror — audit_log table + insert trigger on Supabase.
- [ ] CSV export tested with formula-injection payloads (covered by
      tests/escape.test.js).

### Data integrity
- [ ] Project-level cascading delete tested — deleting a project should remove
      its blocks/floors/units/BOQ/RA bills/drawings or refuse if FK exists.
- [ ] Backup + restore drill — does `clearAllData()` actually clear IndexedDB
      blobs as well (covered by demoMode.js).
- [ ] Pagination at scale — 200-row audit cap UI; need real backend pagination
      before tenants with > 5,000 actions hit it.

### Performance
- [x] Main bundle is **509 kB** (gzip 107 kB). Vite warns this is over 500 kB.
      Code-split heavy routes (charts, PDF generators) are lazy-loaded.
      Org chunk: 716 kB (183 kB gzip) — warning limit bumped to 750 kB; gzip is acceptable.
- [ ] App.jsx is **5,600+ lines**. Batch 4 plan: per-feature module split.
- [ ] First-paint < 2s on 3G — measure with Lighthouse before launch.

### Compliance — Indian regulatory
- [ ] RERA API key obtained + `checkReraStatus()` swapped from mock to real.
- [ ] GST verification API key (e.g. KnowYourCustomer.in) obtained.
- [ ] EPFO portal scraping or official API access for contractor verification.
- [ ] PAN verification (NSDL) for vendor onboarding.

### Payments
- [ ] Razorpay test → live key swap with webhook signature verification.
- [ ] Cashfree subscription endpoint wired for self-serve onboarding.
- [ ] Idempotent payment IDs to prevent double-charge.
- [ ] Failed-payment retry + dunning flow.

### Communications
- [ ] WhatsApp Business API creds onboarded — currently `wa.me` fallback only.
- [ ] Transactional email service (Postmark / SES) for password reset +
      project share + DPR digest.
- [ ] Daily DPR auto-send at 7 PM IST scheduled.

---

## Soft gates (should pass, can ship with caveat)

- [x] Editorial UI polish across all major views.
- [x] Empty-state guidance everywhere (Dashboard, Projects, Super Admin,
      Vendors, Hierarchy, Compliance, Forecast).
- [x] Plan-based feature gating UI (`PlanGate` component shows upsell).
- [x] White-label branding cascade visible (org + project levels).
- [x] Real-time WebSocket subscribes wired (Supabase realtime).
- [ ] Mobile-first labour kiosk + site kiosk tested on actual tablet.
- [ ] AR drawing overlay — full homography mapping (currently scaffold).
- [ ] Module-per-domain `src/features/` split of App.jsx.

---

## Known weaknesses (acknowledged, scheduled)

| # | Weakness | Severity | Plan |
|---|---|---|---|
| 1 | App.jsx is one ~5,600-line file | High | Batch 4 split into `src/features/` |
| 2 | RLS designed but not enforced runtime | Critical | Batch 4 backend wire-up |
| 3 | Material price adapters all mocked | Medium | Real REST/scraping adapters per vendor |
| 4 | Compliance API checks all mocked | Medium | Real API keys (RERA / GST / EPFO) |
| 5 | AR overlay is scaffold only | Low | Homography in Batch 4 |
| 6 | Sub-contractor billing reconciliation light | Medium | Batch 5 |
| 7 | No Tally / Zoho / QuickBooks integration | Low | Custom plan only — Batch 5 |
| 8 | `recordAudit()` not in every CRUD path yet | High | Wire 6 more flows |
| 9 | Daily snapshot cron not server-scheduled | Low | Supabase Cron in Batch 4 |
| 10 | Bundle > 500 kB warning | Low | Code-split charts + canvas |

---

## Release blockers vs. nice-to-haves

A **release blocker** is anything where shipping without it could cause:
- Data leak across tenants (RLS, demo bypass)
- Loss of customer trust (incorrect audit log, missed payment)
- Compliance failure (RERA / GST / PAN not actually verified)
- Real bug visible in 30 seconds of use (e.g. project create silently fails)

A **nice-to-have** is anything that's just slower or less polished —
ship the feature, fix the polish next sprint.

---

## How to use this doc

Before a launch / paying customer onboarding, walk through every **hard
gate** and tick it explicitly. Don't tick checkboxes you didn't verify.

Update this file every release. If a "known weakness" gets fixed, move it
to the changelog and remove from the table.
