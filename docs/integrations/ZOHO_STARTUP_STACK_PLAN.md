# SiteTrack Pro — Zoho Startup Stack (Business Operations Layer)

> Research source: founder's Zoho-for-Startups onboarding + "Role Intelligence Study".
> Principle: **Zoho runs the BUSINESS around the product; Supabase/React stays the
> product.** No migration of SiteTrack into Zoho Creator. Zero-Spend-Policy aligned:
> activate free tiers first; paid only when revenue justifies.

## Product mapping (what each Zoho app is FOR here)

| Zoho app | Role for SiteTrack Pro | Replaces? | Tier to start |
|---|---|---|---|
| **Mail** | hello@ / support@ / sales@ on sitetrackpro.in | personal-gmail sending (GoTrue SMTP already moved to Resend; Mail is for humans) | Free (up to 5 users) |
| **CRM** | Leads → Contacts → Deals for builders/architects/interior firms | our in-app CRM stays CUSTOMER-FACING (in-product pipeline); Zoho = pre-sales B2B pipeline for selling SiteTrack itself | Free edition (3 users) |
| **Desk** | Customer support tickets post-sale | support inbox today | Free (3 agents) |
| **Books** | GST invoices/expenses/P&L for the SITETRACK BUSINESS | — (Cashfree remains the product payment rail) | Free plan (GST-compliant) |
| **Billing** | Subscription management for customers | Cashfree subscriptions (keep until Billing integration earns its complexity) | Later |
| **Analytics** | MRR/churn/exec dashboards | nightly cron + dashboards exist in-app | Trial later |
| **Campaigns** | Onboarding/marketing email sequences | Resend one-offs stay transactional | Later |
| **Flow** | Zoho ↔ SiteTrack automation glue | manual ops | Startup credits |
| **Creator** | Internal admin tools ONLY | never the product | Later |
| **SalesIQ** | Website visitor → lead capture | — | Free tier |

## Integration points (build order)

1. **Signup → CRM lead (Flow webhook)** — `register_org` already emits a success path;
   add an async fire-and-forget POST to a Zoho Flow webhook URL (secret stored in
   `notify_config` like CRON_SECRET — same pattern as promoter digest). Flow maps
   payload → CRM Lead (firm name, contact, phone, plan, trial-end). Zero new tables.
2. **Support → Desk**: support@ mailbox + Desk portal; deep-link from in-app
   PlatformSupport tickets later (Phase 3).
3. **Books**: record real subscription invoices manually first; automate via Flow
   once volume justifies.
4. **Analytics**: connect Books+CRM native connectors (no code).

## Prerequisites (founder actions)
- [ ] Zoho Mail DNS verify (TXT/MX/CNAME at sitetrackpro.in DNS — Vercel nameservers)
- [ ] Create hello@ / support@ aliases
- [ ] Note org region + generate Flow webhook URL after Phase 1 activation
- [ ] Confirm startup credits inventory (which apps are free/discounted)

## Guardrails
- Never paste Zoho secrets into repo — EF secrets / notify_config only (same rule as RESEND/CRON).
- Customer data leaving Supabase → CRM must be limited to business contact info
  (name/firm/phone/email/plan), NOT project/commercial data. DPDP note required.
