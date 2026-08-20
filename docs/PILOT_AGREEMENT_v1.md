# SiteTrack Pro — Design Partner Pilot Agreement
*Version 1.0 · June 2026 · Sprint 1, Day 1 · Session 30.2*

This template is the basis for the first 5 paid pilots. Founder
personally co-signs each one within 24 hours of verbal commitment.
Slot it into a PDF for signature once filled — but the source of truth
lives here for amendment trail.

---

## Parties

| Role | Entity | Signatory |
|------|--------|-----------|
| **Provider** | _GiggleZen Technologies / SiteTrack Pro_ (legal entity to confirm) | Rakesh Boyapati, Founder |
| **Design Partner ("Builder")** | _Builder Firm Pvt Ltd_ | _Authorised signatory + designation_ |
| **Effective Date** | _DD MMM 2026_ | |
| **Pilot Term** | 12 months from Effective Date (auto-renewable) | |
| **Lock-in** | 24 months from Effective Date for the discounted tier | |

---

## 1. What the Builder gets

1. **SiteTrack Pro — Design Partner Tier** (one organisation, ≤ 25 users
   total across roles, ≤ 10 active projects, BuildNow Telangana sync,
   Telugu + English UI, WhatsApp DPR workflow, founder-led onboarding,
   founder-direct WhatsApp support).
2. **Founder-led on-site activation** — one 90-minute session at the
   Builder's office in Hyderabad (Banjara Hills / Gachibowli / Kondapur /
   surrounds) within 7 days of Effective Date.
3. **Quarterly co-creation session** — 60-minute review every 3 months
   to surface roadmap requests; Builder requests prioritised over
   non-pilot requests for the 12-month pilot term.
4. **Direct line to founder** — WhatsApp + email, 12-hour first-response
   SLA on business days, 24-hour on weekends. Bug fixes prioritised over
   feature work.
5. **3-month logo exclusivity** in the Builder's micro-segment in
   Hyderabad. During exclusivity, SiteTrack Pro will not sign another
   builder operating in the same RERA-classified segment (residential
   apartments / villas / commercial / mixed-use, scoped to GHMC zone)
   within Hyderabad.
6. **24-month price lock at INR 29,999 + GST per annum.** After 24
   months, tier upgrades to Pro at then-current published rate
   (currently INR 49,999/yr; max 15% YoY escalation cap during the
   lock period).

## 2. What SiteTrack Pro gets

1. **Co-creation rights** — Builder agrees to weekly 30-minute feedback
   sessions for the first 90 days, then bi-weekly thereafter. Feedback
   may be incorporated into the product, with no IP claim by Builder
   on incorporated work.
2. **Case study publication** — Builder agrees to:
   - Logo placement on `sitetrackpro.in` and pitch materials.
   - One ≤500-word published case study (Builder reviews + signs off
     before publication; redactions allowed for commercially sensitive
     numbers).
   - One reference call per quarter with a prospective customer (max
     30 minutes; max 4 per year).
3. **Pilot termination = case study survives.** If the Builder churns
   before Month 12, SiteTrack Pro retains the right to publish the
   case study reflecting accurate pilot duration and outcomes.

## 3. Service levels (during pilot)

| Component | SLO | Measurement | Credit if missed |
|-----------|-----|-------------|------------------|
| DPR delivery (supervisor → promoter WhatsApp) | 95% within 60 seconds when network present | DPR delivery log table (`scripts/supabase/50_dpr_delivery_log.sql`) | 1 month free per missed quarter |
| Bug-fix first response | 12 hours, business days | WhatsApp / email timestamp | 1 month free per missed bug |
| Quarterly review | Within ±7 days of quarter-end | Calendar invite acceptance | N/A |
| Founder availability | 95% of business-day messages within 12 hours | Time-stamped log | Founder writes apology + 1-week extension |

SLOs apply to features that are PRODUCTION-READY per the
`docs/FEATURE_FREEZE.md` charter. Stub features (RERA filing pre-Sprint
4, GSTN e-invoice pre-Sprint 4, kiosks pre-Sprint 3) have NO SLO
during this period.

## 4. Pricing + payment

| Item | Amount | Schedule |
|------|--------|----------|
| Year 1 pilot fee | INR 29,999 + 18% GST = INR 35,398.82 | One-time, due within 14 days of Effective Date via Cashfree |
| Year 2 pilot fee | INR 29,999 + 18% GST = INR 35,398.82 | Anniversary of Effective Date |
| Year 3 (post-lock) | Pro tier at then-current rate (currently INR 49,999/yr) | Anniversary of Effective Date |
| Setup fee | INR 0 | Waived for pilot tier |
| Support fee | INR 0 | Included in pilot fee |
| Founder activation | INR 0 | Included; transport on SiteTrack Pro |

Late payment > 30 days from invoice = pilot moves to standard tier
(INR 49,999/yr pro-rated) for remainder of year, no refund of
discount. Late payment > 60 days = SiteTrack Pro may suspend service
with 7-day written notice.

## 5. Data ownership + portability

1. **All Builder data belongs to the Builder.** SiteTrack Pro is a
   processor, not a controller. Daily progress reports, photos,
   drawings, BOQs, RA bills, vendor records, audit logs — all owned
   by Builder.
2. **Builder can export everything at any time** via the audit log
   v2 API and the CSV export functions for each domain. Export
   format documented in `docs/AUDITOR_API.md`.
3. **Termination = full data export within 30 days.** SiteTrack Pro
   provides a single-zip dump with all data + a written destruction
   certificate for SiteTrack-Pro-side copies within 30 days after
   termination.
4. **No re-sale of Builder data.** SiteTrack Pro will not sell,
   share, or sublicense Builder data to third parties for marketing,
   advertising, or analytics. Anonymized peer-benchmark
   aggregations (cost-per-sqft across Hyderabad builders) are
   permitted only if Builder explicitly opts in via the in-app
   toggle.

## 6. Intellectual property

1. **Builder's data and content** — Builder retains all IP.
2. **SiteTrack Pro software, schema, code, UI, brand** — SiteTrack Pro
   retains all IP. Builder gets a non-exclusive, non-transferable
   licence for the pilot term.
3. **Co-created features** — Any feature added at Builder's request
   becomes part of the SiteTrack Pro product available to all
   customers. Builder receives credit in product release notes for
   the quarter (Builder may decline credit if preferred).

## 7. Confidentiality

Both parties agree to mutual confidentiality on:
- Builder's project data, financials, customer lists, vendor terms.
- SiteTrack Pro's roadmap, source code, pricing exceptions, internal
  metrics, customer pipeline.

Confidentiality survives termination by 24 months.

## 8. Termination

| Reason | Notice required | Effect on lock-in |
|--------|-----------------|-------------------|
| Builder dissatisfied with product | 30 days written | Lock-in voided; refund of unused months pro-rated |
| Builder churns to competitor | 30 days written | Lock-in financial penalty: INR 50,000 (one-time) |
| SiteTrack Pro fails to deliver SLO 2 consecutive quarters | 30 days written | Lock-in voided; full Y1 refund |
| Acquisition / merger of either party | 60 days written | Successor inherits agreement unchanged |
| Force majeure (govt action, natural disaster, etc.) | Immediate notice | Both parties negotiate in good faith |

## 9. Governing law + dispute resolution

- Governed by Indian law, jurisdiction Telangana.
- First step: 30-day good-faith negotiation between founder + Builder
  signatory.
- Second step: Single-arbitrator arbitration under the Arbitration
  and Conciliation Act, 1996, seat in Hyderabad, language English.

## 10. Signature block

For SiteTrack Pro / GiggleZen Technologies:

```
Name:       Rakesh Boyapati
Title:      Founder
Date:       ____________
Signature:  ____________
```

For Builder:

```
Entity:     _____________________
Name:       _____________________
Title:      _____________________
Date:       ____________
Signature:  ____________
```

---

## Internal notes (NOT for Builder copy)

- Trade off: lower Year 1 price (INR 29,999) for 24-month lock + case
  study + 3-month exclusivity. Net unit economics over 24 months
  better than INR 49,999/yr churning at Month 13.
- 3-month exclusivity in micro-segment is bait, not real limitation
  — Hyderabad has hundreds of builders; we'll never run out of
  segments to sign.
- Case study survival on churn is the leverage that makes the deal
  defensible — Builder cannot use SiteTrack Pro for 11 months then
  walk without consequence to their public association.
- Reference call cap (4/year) prevents Builder fatigue.

## Edit log

- v1.0 (Sprint 1, Day 1, June 2026) — initial draft.
- v1.x updates require founder + Builder signatory countersign.
