# SiteTrack Pricing Hypothesis

Date: 2026-05-22

This pricing is a starting hypothesis for Indian small and mid-size construction teams. Validate with real demos before treating it as final.

## Plans

| Plan | Monthly price | Best for | Limits | Main features |
| --- | --- | --- | --- | --- |
| Basic | INR 999 | 1 small builder, contractor, or site engineer team | 1 project, 3 users | Projects, site updates, issues, materials, basic PDF/CSV, WhatsApp share. |
| Pro | INR 2,999 | Small builder, architect, or contractor with multiple jobs | 5 projects, 15 users | Everything in Basic plus drawings, labour, contractor worklogs, RA bills, client portal, approvals. |
| Business | INR 7,999 | Growing builder / PMC | Fair-use projects and users | Everything in Pro plus analytics, multi-project reports, advanced roles, onboarding support. |
| Custom / Private | Quote | Larger builder or special workflow | As scoped | Custom reports, private deployment, branded portal, integrations, dedicated support. |

## One-Time Services

| Service | Price range | Notes |
| --- | --- | --- |
| Setup and onboarding | INR 5,000-25,000 | Company profile, users, roles, project templates, initial data entry/import. |
| Custom report pack | INR 10,000-50,000 | RA bill, GST/TDS, DPR, project status, client format. |
| Private deployment | INR 50,000-2,00,000+ | Backend, storage, auth, backup, custom domain, role policies. |

## Free Deployment Boundary

The current app can be hosted for free as a static demo on Vercel, Netlify, or Cloudflare Pages. This is useful for sales demos and customer pilots.

Do not sell it as production multi-user SaaS until backend auth, database, storage, backend permission checks, and backups are implemented.

## Plan-Gating Direction

| Feature group | Basic | Pro | Business | Custom |
| --- | --- | --- | --- | --- |
| Project dashboard | Yes | Yes | Yes | Yes |
| Daily updates and photos | Yes | Yes | Yes | Yes |
| Issues and materials | Yes | Yes | Yes | Yes |
| Drawing release/version control | Limited | Yes | Yes | Custom workflows |
| Labour and attendance | Limited | Yes | Yes | Custom registers |
| RA bills and invoices | No | Yes | Yes | Custom formats |
| Client portal/share | Basic | Yes | Yes | Branded portal |
| Approvals and permits | No | Yes | Yes | Custom approval hierarchy |
| Multi-project analytics | No | Limited | Yes | Custom dashboards |
| Backend + private storage | No | Future SaaS | Future SaaS | Yes |

## Pricing Decision Log

| Date | Decision | Reason | Revisit trigger |
| --- | --- | --- | --- |
| 2026-05-22 | Start with INR 999 / 2,999 / 7,999 monthly tiers. | Matches small-builder affordability and leaves room for setup service revenue. | After 2-3 paid pilots. |
| 2026-05-22 | Keep custom/private version as quote-based. | Large builders need custom reports, storage, permissions, and support. | After first custom prospect. |
| 2026-05-22 | Separate free demo from production SaaS. | Current storage is local browser storage, not a safe shared backend. | When Supabase/Firebase backend is complete. |
