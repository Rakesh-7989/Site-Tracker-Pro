# SiteTrack Pricing

Date: 2026-06-01 (Sprint 1, Day 1 · Session 30.2)
Last hypothesis: 2026-05-22 (retired below).

> **Sprint 1 repricing notice**
>
> The previous per-organization MONTHLY tiers (INR 999 / 2,999 / 7,999)
> were anchored to a falsified assumption about Powerplay's pricing
> (treated as "INR 1,500/user/mo"). The deep-research workflow
> verified Powerplay charges PER-ORG ANNUAL: Pro INR 71,999/yr (15–20
> users), Pro+ INR 1,19,999/yr (30 users). The "30x cheaper" narrative
> collapsed; SiteTrack Pro was leaving 40–60% revenue on the table.
>
> Corrected tiers below — same per-org positioning, anchored 25–30%
> below Powerplay's verified pricing, not 70% below. Old tiers
> preserved at the bottom of this doc for amendment trail; do NOT
> quote them.

## Plans (live, Sprint 1)

| Plan | Annual price (per org) | Best for | Limits | Main features |
| --- | --- | --- | --- | --- |
| **Pilot (Design Partner)** | **INR 29,999/yr** | First 5 Hyderabad builders only | ≤ 25 users, ≤ 10 projects, 12-mo term, 24-mo lock | All of Pro, plus 90-min on-site founder activation, 3-month logo exclusivity in micro-segment, quarterly co-creation, direct WhatsApp to founder. See `docs/PILOT_AGREEMENT_v1.md`. |
| **Pro** | **INR 49,999/yr** | Hyderabad mid-size builder (5–15 active projects) | ≤ 25 users, ≤ 10 projects | WhatsApp DPR + Telugu voice (Sprint 2), BuildNow Telangana sync, project management, RA bills, drawings, client portal, audit log, email support. |
| **Business** | **INR 89,999/yr** | Hyderabad large builder (10–50 active projects) | ≤ 60 users, unlimited projects | All of Pro, plus multi-state RERA (when shipped — Sprint 5), GSTN e-invoice (when shipped — Sprint 4), blockchain handover packet (Sprint 4), Hyderabad CSM, quarterly on-site review. |
| **Enterprise** | **INR 2,49,999+/yr** | Pan-state / multi-org builders | Custom users, custom projects | All of Business, plus white-label promoter app, API access, on-prem audit log mirror, named sales engineer, SLA-backed support. |
| **Custom (sales-only)** | Quote | Builder asking for non-standard data residency / private deployment / custom workflows | As scoped | Sold via sales contact only — not self-serve. |

**Rules**:
- All prices listed are EXCLUSIVE of 18% GST. With GST, Pro =
  INR 58,998.82/yr, Business = INR 1,06,198.82/yr, Pilot = INR 35,398.82/yr.
- **Never quote below INR 49,999/yr** to a non-pilot prospect.
- Pilot tier requires the design-partner agreement countersigned by
  founder + Builder authorised signatory.
- Anchor every Powerplay comparison to per-org ANNUAL numbers. Stop
  using per-user-per-month framing — that was the falsified anchor.

## Comparison to Powerplay (verified Jun 2026)

| Tier | SiteTrack Pro v3 | Powerplay | Delta |
|------|-------------------|-----------|-------|
| Pilot | INR 29,999/yr (first 5 only) | n/a (no equivalent) | n/a |
| Pro | INR 49,999/yr | INR 71,999/yr (15–20 users) | **−30%** |
| Business | INR 89,999/yr | INR 1,19,999/yr (30 users) | **−25%** |
| Enterprise | INR 2,49,999+/yr | Custom | n/a |

Source: `docs/POSITIONING.md` + verified research workflow `wz3yologq`.

## One-Time Services

| Service | Price range | Notes |
| --- | --- | --- |
| Setup and onboarding | INR 0 for Pilot / INR 25,000 for Pro / INR 75,000 for Business | Pilot tier includes 90-min founder activation. Higher tiers include data migration from Powerplay/BuildSupply/Excel via `src/lib/contractorMigration.js`. |
| Custom report pack | INR 25,000–75,000 | RA bill, GST/TDS, DPR, project status, client-facing handover format. Sprint 4 ships blockchain-anchored handover packet for Business tier and up. |
| Private deployment / on-prem | INR 2,00,000+/yr add-on | Backend on Builder's AWS/Azure/GCP region, custom domain, IP allowlist, dedicated Supabase project. Enterprise tier only. |

## Plan-Gating Direction

| Feature group | Pilot | Pro | Business | Enterprise |
| --- | --- | --- | --- | --- |
| Project dashboard | Yes | Yes | Yes | Yes |
| Daily updates and photos | Yes | Yes | Yes | Yes |
| WhatsApp DPR + Telugu voice (Sprint 2) | Yes | Yes | Yes | Yes |
| BuildNow Telangana sync (Sprint 2) | Yes | Yes | Yes | Yes |
| Issues and materials | Yes | Yes | Yes | Yes |
| Drawing release / version control | Yes | Yes | Yes | Custom workflows |
| Labour and attendance | Yes | Yes | Yes | Custom registers |
| RA bills and invoices | Yes | Yes | Yes | Custom formats |
| Client / promoter portal | Yes | Yes | Yes | White-label |
| Approvals and permits | Yes | Yes | Yes | Custom hierarchy |
| Multi-project analytics | Limited | Yes | Yes | Custom dashboards |
| Multi-state RERA (Sprint 5) | TG only | TG only | TG + KA + MH | All states + custom |
| GSTN e-invoice (Sprint 4) | No | No | Yes | Yes |
| Blockchain handover packet (Sprint 4) | No | No | Yes | Yes |
| Auditor API (Sprint 4) | No | No | Yes | Yes |
| White-label promoter app | No | No | No | Yes |
| Founder direct WhatsApp | Yes (during pilot) | No | Quarterly | SLA-backed |
| On-site activation | 90 min (pilot only) | Optional INR 25k | Quarterly review | SLA-backed |

## Pricing Decision Log

| Date | Decision | Reason | Revisit trigger |
| --- | --- | --- | --- |
| 2026-06-01 | Reprice from monthly INR 999/2,999/7,999 to annual INR 29,999/49,999/89,999/2,49,999+ per org. | Powerplay's verified per-org annual pricing (Pro INR 71,999, Pro+ INR 1,19,999) makes the old per-user-monthly framing falsified. New tiers anchor 25–30% below Powerplay, not 70% below. | After 5 willingness-to-pay calls (Sprint 1) and 2 paid pilots (Sprint 2). |
| 2026-06-01 | Introduce Pilot tier at INR 29,999/yr for first 5 builders only. | Need 5 design-partner case studies to convert mistake #4 (no marquee Hyderabad logos). 24-mo lock + 3-mo exclusivity makes it a partnership, not a discount. | After 5 pilots signed. |
| 2026-06-01 | Hide "Custom" plan from public self-serve signup. | Verified research: Custom plan requires sales contact (already coded in `signUp()` lib). | Never (security boundary). |
| 2026-05-22 (RETIRED) | ~~Start with INR 999 / 2,999 / 7,999 monthly tiers.~~ | ~~Matches small-builder affordability.~~ | Retired Sprint 1 — anchored to falsified Powerplay pricing. |
| 2026-05-22 | Keep Custom/Private version as quote-based. | Large builders need custom reports, storage, permissions, support. | Kept in Sprint 1 repricing. |
| 2026-05-22 | Separate free demo from production SaaS. | Current storage is local browser storage, not a safe shared backend. | When Supabase/Firebase backend is complete. |

## Free Deployment Boundary

The current app can be hosted for free as a static demo on Vercel, Netlify, or Cloudflare Pages. This is useful for sales demos and customer pilots.

Do not sell it as production multi-user SaaS until backend auth, database, storage, backend permission checks, and backups are implemented.

**Sprint 1 status**: production backend (Supabase) is live, multi-tenant RLS is in place, magic-link + password auth shipped. But 16 stub views are gated to staff-only (see `docs/FEATURE_FREEZE.md`). Pricing tiers above apply only to features that are PRODUCTION-READY per that charter. Stub features have no SLO until Sprint 4 / 5 / 6 ships their real implementations.

## Sources

- `docs/POSITIONING.md` — the canonical positioning doc.
- `docs/SITETRACK_V3_PLAN.md` §1 mistake #3 (pricing at 1/6th of anchor).
- Workflow `wz3yologq` — Powerplay pricing verification.
- `docs/PILOT_AGREEMENT_v1.md` — Pilot tier contract template.

## Old per-org per-month tiers (RETIRED — do NOT quote)

These were the Session-24 hypothesis. Listed here only for audit trail.
The Sprint 1 repricing above supersedes them entirely.

| Plan | Monthly price | Status |
| --- | --- | --- |
| Basic | ~~INR 999/mo~~ | **RETIRED Sprint 1** |
| Pro | ~~INR 2,999/mo~~ | **RETIRED Sprint 1** |
| Business | ~~INR 7,999/mo~~ | **RETIRED Sprint 1** |
| Custom | Quote | Kept (no change) |
