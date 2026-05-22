# SiteTrack Pro — System Design & Architecture

**Owner**: Tech Lead · **Last reviewed**: 2026-05-22 · **Status**: Design complete, partial implementation (demo mode shipped, multi-tenant backend ready to activate)

---

## 0. Document Map

This document is the source-of-truth for engineers, investors, and pilot customers who need to understand SiteTrack Pro at every level — from "what is it?" to "how does a row get from a contractor's phone to a client's emailed PDF?"

| Section | Reader | Question answered |
| --- | --- | --- |
| 1. Vision & Positioning | Founder, customer | What does this product do, for whom, why now? |
| 2. System Context | Architect, integrator | What touches what at a 30,000-ft view? |
| 3. Containers | Engineer onboarding | What are the deployable units? |
| 4. Components | Frontend / backend engineer | What modules sit inside each container? |
| 5. Data Architecture | Backend engineer, DBA | What tables exist and how do they relate? |
| 6. Security Architecture | Security reviewer, customer | How is data isolated between tenants? |
| 7. Integration Architecture | API consumer, partner | What external services are wired up? |
| 8. Deployment Architecture | DevOps, release engineer | What runs where, how do we ship changes? |
| 9. Runtime & Data Flow | Performance engineer | What happens when a PM posts a site update? |
| 10. State Management | Frontend engineer | How does data move between LS, Supabase, and the UI? |
| 11. Role & Permission Model | Product, security | Who can see what? |
| 12. Realtime Architecture | Frontend engineer | How do live updates work? |
| 13. Offline-First Strategy | Mobile / field engineer | What happens with no internet? |
| 14. Mobile Strategy | Mobile engineer | iOS/Android path |
| 15. Scalability & Performance | Architect | What breaks at 100 / 1,000 / 10,000 users? |
| 16. Observability | SRE | How do we know when something is wrong? |
| 17. Compliance & India Specifics | Legal, founder | GST/TDS, data residency, EPF/ESI rules |
| 18. Cost Model | Founder | What does infra cost at 0, 10, 50, 500 customers? |
| 19. Decision Log (ADRs) | Future engineer | Why did we pick X over Y? |
| 20. Risks & Limitations | Tech lead, investor | What can go wrong? |
| 21. Roadmap | Product, sales | What's next? |

---

## 1. Vision & Positioning

### Product

**SiteTrack Pro** is a multi-tenant SaaS for India's small-to-mid-size construction industry. It coordinates four working roles (Architect, Project Manager, Contractor, Client) plus a vendor-side Super Admin (the SaaS owner) across the entire project lifecycle: BOQ → estimate → execution → daily reports → invoicing → handover.

### Why now

| Pressure | Source |
| --- | --- |
| WhatsApp + Excel is the default tool for ~70% of India's small builders | Field research, Powerplay/RDash positioning |
| GST/TDS compliance has tightened post-2020 — builders need digital trails | Compliance |
| Client expectations have shifted post-pandemic — they expect real-time visibility | UX shift |
| Sub-₹2,000/month pricing gap exists between Excel (₹0) and enterprise tools (₹4K+) | Competitive analysis |

### Positioning (one-liner)

> *"The editorial-grade construction record for small Indian builders — WhatsApp simplicity, BOQ-to-RA-bill depth, a client portal that looks like a luxury brand. Starts at ₹999/month."*

### Target customer ICP

- **Persona A**: Owner of a 3-15 person builder/contractor firm running 1-5 projects simultaneously, ₹1-50 crore project sizes, primarily Hyderabad/Bangalore/Chennai/Pune metros.
- **Persona B**: Independent architect with 2-10 active client projects, wanting a professional client portal without enterprise pricing.

### Anti-personas (NOT for)

- Enterprises >50 projects (use Procore)
- Mega-construction >₹500cr projects (use Oracle Primavera)
- Pure-procurement plays (use BuildSupply)
- Real estate sales (different product category)

---

## 2. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                       External Actors                            │
├──────────────┬─────────────┬──────────────┬──────────────────────┤
│              │             │              │                      │
│   Architect  │    PM       │  Contractor  │     Client          │
│   (Architect)│  (Site eng) │  (Sub-vendor)│   (Property buyer)  │
│              │             │              │                      │
└──────┬───────┴──────┬──────┴──────┬───────┴────────┬─────────────┘
       │              │              │                │
       │              │   HTTPS/WSS  │                │
       └──────────────┴──────────────┴────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │                            │
              │     SiteTrack Pro          │
              │   (React PWA + SaaS)       │
              │                            │
              │   sitetrack-pro.vercel.app │
              │                            │
              └──────┬─────────────┬───────┘
                     │             │
        ┌────────────┘             └──────────┐
        │                                      │
┌───────▼────────┐                  ┌──────────▼──────────┐
│                │                  │                      │
│   Supabase     │                  │   External APIs      │
│                │                  │                      │
│  - Postgres    │                  │  - Razorpay (UPI)    │
│  - Auth        │                  │  - Anthropic/OpenAI  │
│  - Storage     │                  │  - WhatsApp Business │
│  - Realtime    │                  │  - Vercel CDN        │
│  - Edge Funcs  │                  │  - Sentry (errors)   │
│                │                  │                      │
└────────────────┘                  └──────────────────────┘
```

### External actor scope

| Actor | Auth | Access pattern | Frequency |
| --- | --- | --- | --- |
| **Super Admin** | Magic link + role=superadmin | Web app, every tenant | Daily ops |
| **Architect** | Magic link + role=architect | Web app, own org's projects | Daily-weekly |
| **PM** | Magic link + role=pm | Web app + PWA mobile, assigned projects | Daily field |
| **Contractor** | Magic link + role=contractor | PWA mobile primary, assigned projects | Daily field |
| **Client** | Magic link + role=client | Web app, projects matching client_email | Weekly check-ins |
| **Customer Support** | Inbound email/WhatsApp → Super Admin Inbox | Not a separate role; tickets surfaced to Super Admin | Ad-hoc |

---

## 3. Container Architecture (C4 Level 2)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          User Devices                                 │
│   ┌───────────────┐  ┌────────────────┐  ┌───────────────────────┐   │
│   │ Desktop       │  │ PWA (mobile    │  │ Capacitor wrapped     │   │
│   │ Browser       │  │ Safari/Chrome) │  │ iOS / Android (future)│   │
│   └───────┬───────┘  └────────┬───────┘  └─────────┬─────────────┘   │
└───────────┼─────────────────────┼──────────────────┼─────────────────┘
            │                     │                  │
            └─────────────────────┴──────────────────┘
                                   │ HTTPS (CDN cached)
            ┌──────────────────────▼─────────────────────┐
            │                                             │
            │           Vercel Edge Network               │
            │         (CDN + static asset cache)          │
            │                                             │
            │   sitetrack-pro.vercel.app + custom dom.    │
            │                                             │
            └──────────────────────┬──────────────────────┘
                                   │
                                   ▼ serves: dist/ (Vite build output)
            ┌──────────────────────────────────────────────┐
            │   React 18 SPA (single bundle, code split)   │
            │                                              │
            │   - main.jsx → App.jsx (~3,800 lines)        │
            │   - src/lib/* (permissions, supabase, ai,    │
            │     razorpay, offline, usePersistent)         │
            │   - tests/, scripts/                          │
            │                                              │
            └──────────────────────┬───────────────────────┘
                                   │
                                   │ Supabase JS SDK (postgres-changes WSS + HTTPS REST)
                                   │
            ┌──────────────────────▼───────────────────────┐
            │          Supabase Cloud (Singapore)           │
            │                                                │
            │   ┌────────────────────────────────────────┐  │
            │   │  Postgres 15 (Multi-tenant via RLS)    │  │
            │   │  - 20+ business tables                 │  │
            │   │  - profiles, organizations, projects   │  │
            │   │  - activity_log (append-only)          │  │
            │   └────────────────────────────────────────┘  │
            │                                                │
            │   ┌────────────────────────────────────────┐  │
            │   │  GoTrue Auth (Magic Link + email)      │  │
            │   │  - JWT issuance (ECC P-256)            │  │
            │   │  - session cookies                     │  │
            │   └────────────────────────────────────────┘  │
            │                                                │
            │   ┌────────────────────────────────────────┐  │
            │   │  Storage (S3-compatible)                │  │
            │   │  - drawings/, site-photos/, documents/  │  │
            │   │  - Signed URL with RLS-mirrored policy  │  │
            │   └────────────────────────────────────────┘  │
            │                                                │
            │   ┌────────────────────────────────────────┐  │
            │   │  Realtime (postgres_changes channels)   │  │
            │   │  - WSS subscriptions for activity,      │  │
            │   │    messages, issues                     │  │
            │   └────────────────────────────────────────┘  │
            │                                                │
            │   ┌────────────────────────────────────────┐  │
            │   │  Edge Functions (Deno)                  │  │
            │   │  - daily-report-cron                    │  │
            │   │  - whatsapp-share                       │  │
            │   │  - razorpay-webhook (payment events)    │  │
            │   │  - ai-insight-proxy (server-side LLM)   │  │
            │   └────────────────────────────────────────┘  │
            │                                                │
            └─────────────────┬────────────────┬─────────────┘
                              │                │
                              │ outbound HTTP  │ outbound HTTP
                              ▼                ▼
            ┌─────────────────┐    ┌──────────────────────┐
            │  Anthropic /    │    │  Razorpay            │
            │  OpenAI API     │    │  Payment Link API    │
            │  (AI Insights)  │    │  + Webhooks          │
            └─────────────────┘    └──────────────────────┘
                                    
            ┌─────────────────┐    ┌──────────────────────┐
            │  Resend / SES   │    │  WhatsApp Business   │
            │  (Magic links + │    │  Cloud API           │
            │   email DPR)    │    │  (DPR delivery)      │
            └─────────────────┘    └──────────────────────┘
```

### Container responsibilities

| Container | Owner | SLA target | Failure mode |
| --- | --- | --- | --- |
| Vercel Edge CDN | Vercel | 99.99% | Static fallback; demo localStorage path still works |
| React SPA | Frontend Engineer Agent | n/a (client-side) | LocalStorage cache lets user keep working briefly |
| Supabase Postgres | Backend Engineer Agent | 99.9% (Pro tier) | App goes read-only via cached LS; queue catches writes |
| Supabase Auth | Backend | 99.9% | Demo role picker still works; existing sessions valid for 1h |
| Supabase Storage | Backend | 99.9% | Image upload fails gracefully; user can retry |
| Supabase Realtime | Backend | 99.5% (best effort) | UI degrades to "refresh to see changes" (no realtime) |
| Edge Functions | Backend | 99.5% | DPR / webhooks fail gracefully; queued for retry |
| External AI APIs | Provider | N/A | Falls back to deterministic rule-based AI |
| Razorpay | Provider | 99.9% | Falls back to UPI deep link |

---

## 4. Component Architecture (C4 Level 3)

### Frontend (React) component map

```
src/
├── App.jsx                       # 3,800 lines — single component tree (refactor planned)
│   ├── Mock data constants       # INIT_PROJECTS, INIT_ORGS, INIT_ADMIN_USERS, etc.
│   ├── Helper functions          # fmtCur, fmtDate, exportPDF, buildDPR, etc.
│   ├── Icons                     # Inline SVG component (`Ic`)
│   ├── Primitives                # Av (avatar), Badge, PBar, SC (stat card)
│   ├── MarkupModal               # Drawing markup canvas overlay
│   ├── LoginScreen               # Magic-link form + demo role tiles
│   ├── Sidebar                   # Role-aware nav (split admin / tenant)
│   ├── Tenant views              # Dashboard, Projects, Calendar, etc.
│   ├── DetailView                # Project detail with 25+ tabs
│   ├── Tab components            # BOQTab, EstimateTab, LedgerTab, RABillsTab, COTab, ...
│   └── Admin views               # SuperAdminDashboard, OrgsAdminView, UsersAdminView,
│                                 # BillingAdminView, UsageAdminView, AuditAdminView,
│                                 # SupportAdminView, SettingsAdminView
│
├── lib/
│   ├── permissions.js            # PERMS object + role helpers (source of truth)
│   ├── usePersistent.js          # Drop-in useLS — localStorage ⇄ Supabase auto-route
│   ├── supabase.js               # Supabase client + auth + saveKey/loadKey adapter
│   ├── offline.js                # IndexedDB blob store + sync queue
│   ├── ai.js                     # Deterministic risk engine + LLM bridge
│   └── razorpay.js               # UPI deep-link builder + Payment Link payload
│
├── main.jsx                      # React mount + StrictMode
└── index.css                     # Fraunces + Inter import + design tokens
```

### Backend component map (planned, partially scaffolded)

```
scripts/supabase/
├── 01_schema.sql                 # 20+ tables + indexes + constraints
├── 02_rls.sql                    # Row Level Security policies
├── 04_rls_tests.sql              # 24-assertion verification matrix
└── README.md                     # Run order + table-to-frontend mapping

Edge Functions (future, see BACKEND_PLAN.md):
├── daily-report-cron/            # 6pm IST scheduled DPR generation + WhatsApp
├── whatsapp-share/               # Outbound message dispatcher
├── razorpay-webhook/             # Payment status webhook → update invoices.status
└── ai-insight-proxy/             # Server-side LLM call (avoids exposing keys)
```

---

## 5. Data Architecture

### Entity-relationship overview

```
┌─────────────────┐
│  organizations  │ ◄─── tenant boundary
│  - id, slug    │
│  - plan        │
│  - mrr         │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐       ┌──────────────────┐
│   profiles     │ N:M   │   org_members    │
│  - id, name    │◄─────►│  - org_id        │
│  - role        │       │  - profile_id    │
└────────┬────────┘       │  - role          │
         │                 └──────────────────┘
         │ N:M via project_members
         ▼
┌──────────────────────────────────────────────────────────────┐
│                         projects                              │
│                                                               │
│  - id (uuid), org_id, architect_id, client_email             │
│  - name, location, lat, lng, status, progress                │
│  - budget, start_date, expected_end_date                     │
└──────┬────────────────────────────────────────────────────────┘
       │ 1:N (project_id FK everywhere below)
       ├──► milestones ──► tasks
       ├──► site_updates ──► attachments (with geo)
       ├──► issues ──► comments
       ├──► drawings (with revision governance + released_to[])
       ├──► materials ──► inventory_transactions (in/out/return/wastage)
       ├──► boq_items ──► [derived] estimate
       ├──► change_orders (with signature jsonb)
       ├──► rfis ──► comments
       ├──► purchase_orders (vendor_id FK to vendors)
       ├──► invoices (milestone FK)
       ├──► ra_bills ──► measurement_book entries
       ├──► labour_register (PII — RLS restricted)
       ├──► submittals, permits
       ├──► inspections, safety_incidents
       ├──► equipment, diary, worklogs, checklists
       └──► messages (per-project chat)

┌──────────────────────────────────────────────────────────────┐
│              activity_log (append-only, immutable)            │
│   - project_id, type, action, detail                          │
│   - by_profile_id, by_role                                    │
│   - INSERT via SECURITY DEFINER function only                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│           attachments (polymorphic — references any entity)   │
│   - entity_type ∈ {site_update, issue, drawing, ...}          │
│   - entity_id (uuid, references the row in that table)        │
│   - storage_path (Supabase Storage key)                       │
│   - geo: { lat, lng, captured_at }                            │
└──────────────────────────────────────────────────────────────┘
```

### Cardinality summary

| Relationship | Cardinality | Why |
| --- | --- | --- |
| organization → projects | 1:N | A builder runs many concurrent projects |
| project → milestones | 1:N | Construction phasing |
| milestone → tasks | 1:N | Day-to-day items under each phase |
| project → drawings | 1:N (with revision graph via superseded_by self-FK) | Drawing release governance |
| project → boq_items | 1:N | Pre-construction quantities |
| project → ra_bills | 1:N | Contractor running account |
| ra_bill → measurement_book entries | 1:N | RDash-parity measurement traceability |
| entity → attachments | 1:N (polymorphic by entity_type) | Photos, PDFs, drawings on any entity |
| project → activity_log | 1:N | Immutable audit |

### Storage layout

| Bucket | Visibility | Content | Signed URL TTL |
| --- | --- | --- | --- |
| `drawings` | Private | PDF/DWG/DXF/RVT files for drawings table | 1 hour (refresh on view) |
| `site-photos` | Private | JPEG/PNG from site_updates + issues | 1 hour |
| `documents` | Private | Invoices, RA bills, permits, RFI attachments | 1 hour |

### Generated columns

- `boq_items.amount = qty * rate` (auto-computed, can't drift)

### Constraints worth flagging

```sql
-- Drawings: only ONE current revision per (project, title, type)
constraint unique_current_drawing_per_title
  exclude using btree (
    project_id with =,
    lower(trim(title)) with =,
    lower(trim(type)) with =
  ) where (status = 'current')
```

This is the database-level enforcement of the auto-supersede rule defined in frontend `drawingKey()`. Belt-and-suspenders.

---

## 6. Security Architecture

### Threat model (top concerns)

| Threat | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Cross-tenant data leak (Org A sees Org B data) | Medium | Critical | RLS policies + 24-assertion test matrix |
| Compromised admin credential | Low | Catastrophic | MFA recommended; rotate keys; service_role never in frontend |
| Client sees architect-only data (drawings, invoices) | Medium | High | `released_to[]` array + RLS filter |
| Contractor sees client invoices | Medium | Medium | Tab visibility in PERMS + RLS row-level block |
| SQL injection | Low | Critical | Parameterized queries via Supabase SDK; no raw SQL from user input |
| XSS via user-supplied content | Medium | High | React's default escaping + Content-Security-Policy header |
| Stolen JWT replay | Low | High | 1-hour token expiry + refresh rotation |
| Backup tampering | Low | High | Supabase Pro PITR + checksum verification |
| Magic-link interception | Low | Medium | One-time-use; 1-hour expiry; logged |
| Money flowing through compromised account | Low | Catastrophic | Payment via Razorpay's secured infra; no card data on our servers |

### Defense in depth (layers)

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Network                                                │
│   - HTTPS only (Vercel TLS 1.3, HSTS preload-eligible)          │
│   - CSP headers (set in vercel.json — to-add)                   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: Authentication                                          │
│   - Supabase Auth (GoTrue): email + magic link, ECC-signed JWT  │
│   - Session: 1-hour access token + refresh token                 │
│   - No password storage on our side                              │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: Application (frontend)                                  │
│   - PERMS object — tab visibility + capability gating            │
│   - canAccessProject, canOpenView, can(user, capability)         │
│   - Smoke + Vitest tests guard against drift                     │
│   - Frontend is DEFENSE-IN-DEPTH only; never the primary gate    │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: API authorization (Supabase RLS)                        │
│   - Every business table has RLS enabled                         │
│   - is_superadmin() bypass for cross-tenant ops                  │
│   - user_project_ids() returns rows user can access              │
│   - released_to[] arrays gate drawings per role                  │
│   - PII tables (labour_register) restricted to architect/PM     │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5: Audit log                                               │
│   - activity_log table is append-only (revoked INSERT/UPDATE)    │
│   - Writes go through SECURITY DEFINER function only             │
│   - Every state change recorded with by_profile_id + timestamp   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Layer 6: Data at rest                                            │
│   - Postgres encryption-at-rest (Supabase default)               │
│   - Storage objects encrypted (Supabase default)                 │
│   - Backups encrypted; PITR on Pro tier                          │
└─────────────────────────────────────────────────────────────────┘
```

### Role-to-capability matrix (frontend mirror of RLS)

| Capability | Super Admin | Architect | PM | Contractor | Client |
| --- | --- | --- | --- | --- | --- |
| Create project | ✓ | ✓ | — | — | — |
| Edit progress | ✓ | ✓ | partial | — | — |
| Release drawing | ✓ | ✓ | — | — | — |
| Approve change order | ✓ | — | — | — | ✓ (with e-sig) |
| View invoices | ✓ | ✓ | ✓ | — | ✓ (own) |
| View RA bills | ✓ | ✓ | ✓ | ✓ (own scope) | — |
| View labour register | ✓ | ✓ | ✓ | — | — |
| Edit BOQ | ✓ | ✓ | ✓ | — | view only |
| Edit estimate | ✓ | ✓ | ✓ | — | view only |
| Record inventory in/out | ✓ | ✓ | ✓ | ✓ | — |
| Mark attendance | ✓ | ✓ | ✓ | — | — |
| Manage org settings | ✓ | — | — | — | — |
| Manage users | ✓ | — | — | — | — |
| Impersonate | ✓ | — | — | — | — |
| View audit log | ✓ | ✓ (own org only) | — | — | — |

### Secrets management

| Secret | Where it lives | Rotation policy |
| --- | --- | --- |
| Supabase JWT signing key | Supabase project (managed) | Rotate on suspected leak; new ECC P-256 each time |
| Supabase anon/publishable key | Vercel env var `VITE_SUPABASE_ANON_KEY` | Roll when rotating JWT |
| Supabase service_role | Supabase Edge Functions secrets only | NEVER in browser, NEVER in Vercel env, NEVER in chat |
| Anthropic/OpenAI API key | Edge Function secret (server-side proxy) | Provider-managed; rotate quarterly |
| Razorpay API key | Edge Function secret | Provider-managed |
| WhatsApp Business token | Edge Function secret | Meta-managed; refresh per Meta's lifecycle |
| GitHub PAT | n/a in app; only used for Vercel deploy auth | Rotate every 90 days |

---

## 7. Integration Architecture

### Inbound integrations

| System | Direction | Protocol | Failure mode |
| --- | --- | --- | --- |
| Razorpay webhook | Razorpay → SiteTrack | HTTPS POST (signed) | Retried by Razorpay; idempotent handler |
| WhatsApp Business inbound msg | Meta → SiteTrack | HTTPS webhook | Logged; admin notified |
| Customer support email | Inbound email → ticket | IMAP poll or SES inbound | Manual fallback to admin email |

### Outbound integrations

| System | Direction | Protocol | Auth | Fallback |
| --- | --- | --- | --- | --- |
| Anthropic Claude | SiteTrack → Anthropic | HTTPS REST | API key | Deterministic rule-based AI |
| OpenAI | SiteTrack → OpenAI | HTTPS REST | API key | Same as above |
| Razorpay Payment Link API | SiteTrack → Razorpay | HTTPS REST | Key ID + secret | UPI deep link via `upi://pay?` |
| WhatsApp Business Cloud API | SiteTrack → Meta | HTTPS REST | Access token | wa.me deep link in browser |
| Resend (transactional email) | Supabase → Resend | SMTP/API | API key | Supabase default email (lower limits) |
| Sentry | SiteTrack → Sentry | HTTPS POST | DSN | Errors logged to browser console only |

### Integration scaffolding status

| Integration | Code ready | Activation requires |
| --- | --- | --- |
| Anthropic / OpenAI | ✓ `src/lib/ai.js` | API key paste in admin UI |
| Razorpay UPI deep link | ✓ `src/lib/razorpay.js` | UPI ID configured in InvoicesTab settings |
| Razorpay Payment Link | ✓ payload builder ready | Edge Function `razorpay-link` needs deploy |
| WhatsApp wa.me deep link | ✓ DPR + share button | None — uses native browser share |
| WhatsApp Business API (auto-send) | ☐ Edge Function design only | Meta verification + Edge Function deploy |
| Capacitor wrap | ✓ `capacitor.config.json` | `npx cap add android/ios` + native build |

---

## 8. Deployment Architecture

### Topology

```
GitHub: Rakesh-7989/Site-Tracker-Pro
   │
   │ push to main
   ▼
GitHub Actions (CI) — currently in docs/CI_WORKFLOW.yml
   │ lint, build, smoke, vitest
   │ (PAT needs `workflow` scope to activate)
   ▼
Vercel (auto-deploy)
   │
   ├─► Production deploy: sitetrack-pro.vercel.app
   ├─► Preview deploys: every PR gets a URL
   │
   ▼
Static assets served via Vercel Edge Network (CDN)
   │
   ├─► dist/index.html
   ├─► dist/assets/*.js (code-split: react, recharts, d3, app)
   └─► dist/assets/*.css
```

### Environments

| Environment | URL | Branch | Backend | Purpose |
| --- | --- | --- | --- | --- |
| Local dev | localhost:5173 | any | Optional Supabase (env flag) | Engineer-side development |
| Preview | `*-rakesh-7989.vercel.app` | PR branches | Same Supabase as prod (read-only recommended) | Client demos, QA |
| Production | sitetrack-pro.vercel.app | main | Supabase prod project | Live paying customers |

### Vercel configuration

`vercel.json`:
```json
{
  "version": 2,
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Env vars (production)

| Var | Set in | Used by |
| --- | --- | --- |
| `VITE_BACKEND` | Vercel project settings | `src/lib/supabase.js` → `isSupabaseEnabled()` |
| `VITE_SUPABASE_URL` | Vercel project settings | Supabase client init |
| `VITE_SUPABASE_ANON_KEY` | Vercel project settings | Supabase client init |
| `VITE_RAZORPAY_KEY_ID` (future) | Vercel project settings | Razorpay client SDK |

### Release process

1. Engineer pushes to feature branch
2. PR raised → Vercel preview deploy auto-generated
3. Code review + smoke check on preview
4. Merge to `main` → production deploy in ~90 seconds
5. Post-deploy: smoke check on production URL
6. Rollback (if needed): Vercel Settings → Deployments → Promote previous deploy (~30s rollback)

### Rollback playbook

| Failure | Action | RTO |
| --- | --- | --- |
| Bad frontend deploy | Promote previous Vercel deploy | 30s |
| Bad DB migration | Restore from Supabase PITR (Pro tier) | 1-4 hours |
| Supabase outage | Set `VITE_BACKEND=local` → demo mode | 90s redeploy |
| DNS/CDN failure | Use direct Vercel URL | Manual |
| Anthropic API outage | Falls back to rule-based AI automatically | None |

---

## 9. Runtime & Data Flow

### Critical user journey 1 — PM posts daily site update

```
1. PM opens project on phone (PWA cached shell loads instantly)
2. Taps "+ Today's Entry" → QuickCaptureDrawer opens
3. Types notes, weather, worker count
4. Taps "Take Photo" (capture="environment") → opens device rear camera
5. Optionally toggles "Tag photos with site location" → geolocation prompt
6. Saves
7. Frontend:
   - usePersistent writes to localStorage immediately (cache)
   - 500ms debounce → saveKey(value) → Supabase upsert
   - addActivity() → activity_log INSERT via security definer fn
8. Realtime channel pushes the new activity_log row to:
   - Architect's web dashboard (live)
   - Client's portal (if released visibility)
9. Architect sees the update in their feed within 2-3 seconds
10. End-of-day cron (Edge Function, 6pm IST): aggregates day's data → 
    DPR PDF → WhatsApp Business API → architect + client phones
```

### Critical user journey 2 — Client approves a change order

```
1. PM raises change order in COTab — cost impact ₹3,40,000, +7 days
2. CO row written: status='pending_approval'
3. Activity log row → realtime push to architect + client
4. Client receives notification (push if mobile, email otherwise)
5. Client opens app → COTab → reviews
6. Taps "Sign & Approve"
7. Signature modal:
   - Display CO details (cost, time impact)
   - Client types full name
   - Checks "I accept..." consent box
   - Browser captures: name, role, email, IP-derived hash, user_agent, timestamp
8. signature jsonb written to change_orders row, status='approved'
9. Architect sees signature in their CO view immediately (realtime)
10. Activity log: "Client {name} approved CO with e-signature"
11. Court-ready audit trail: activity_log (append-only) + signature jsonb on the row
```

### Critical user journey 3 — Super Admin invites a new customer

```
1. Super admin opens Admin → Organizations
2. Clicks "Add Organization"
3. Fills: name="Greenfield Devs", plan=trial, contact=gf@green.in
4. setOrgs adds row to localStorage + Supabase organizations table
5. Super admin → Users → "Invite User"
6. Fills: name="GF Owner", email="gf@green.in", role=architect, org=org5
7. setAdminUsers row added
8. (In production) supabase.auth.admin.inviteUserByEmail → Supabase sends magic link
9. Customer receives email, clicks link
10. Lands on /?type=invite → SiteTrack login picks up the OTP token
11. profiles row auto-created with role=architect via DB trigger
12. Customer lands on their org's empty dashboard
13. Super admin can "View as Greenfield Owner" anytime for support
```

---

## 10. State Management

### Pattern: cache-first persistence

```
┌──────────────────────────────────────────────────────────────────┐
│                       React Component                             │
│                                                                    │
│            const [data, setData] = useLS("projects", []);          │
│                                                                    │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                  src/lib/usePersistent.js                          │
│                                                                    │
│   - First paint: synchronous LS read (instant)                    │
│   - Async: if backend enabled, fetch from Supabase, replace        │
│   - setData(next):                                                 │
│       1. Write to LS immediately (cache)                           │
│       2. Debounced 500ms: write to Supabase                        │
│       3. If offline: push to queue (lib/offline.js)                │
└────────────────────┬───────────────────┬──────────────────────────┘
                     │                   │
                     ▼                   ▼
       ┌───────────────────┐    ┌──────────────────────┐
       │   localStorage    │    │   Supabase           │
       │   sitetrack_v2    │    │   (per-table upsert) │
       │   (cache)         │    │                      │
       └───────────────────┘    └──────────────────────┘
```

### Why this pattern

- **First paint is always instant** — never a loading spinner for cached data
- **Offline-tolerant** — writes go to queue, drain on reconnect
- **Backend-optional** — same code path works without Supabase (demo mode)
- **Conflict strategy**: last-write-wins (acceptable for construction data; not collaborative editing)

### When to NOT use this pattern

- High-frequency writes (typing in a textarea) — debounce more aggressively or use local-only state
- Strongly-consistent reads (banking-level transactions) — go direct to Supabase, skip cache
- Cross-device live sync — needs Realtime subscription, not just LS+upsert

### Realtime subscription pattern

```js
useEffect(() => {
  if (!isSupabaseEnabled() || !user) return;
  let unsubs = [];
  (async () => {
    unsubs.push(await subscribeTable("activity_log", row => {
      setActivity(p => [normalize(row), ...p].slice(0, 500));
    }));
    unsubs.push(await subscribeTable("messages", row => {
      setMessages(p => ({ ...p, [row.project_id]: [...((p||{})[row.project_id]||[]), row] }));
    }));
  })();
  return () => { unsubs.forEach(u => u && u()); };
}, [user?.id]);
```

- Subscribes on mount, unsubscribes on user change
- RLS filters at the server side — frontend never receives rows it shouldn't see
- Channel reconnects automatically on network blips (Supabase SDK handles this)

---

## 11. Role & Permission Model

### Source of truth

`src/lib/permissions.js` defines `PERMS` as a single object literal that maps `role → { capabilities, tabs, nav }`.

- `App.jsx` imports from this file (after Tech Lead "kill the drift" fix)
- Vitest `tests/permissions.test.js` asserts the matrix against this file
- Smoke test enforces `App.jsx` cannot redefine PERMS locally (regex check)
- RLS policies in `02_rls.sql` mirror this matrix at the database level

### Three layers of enforcement

```
┌──────────────────────────────────────────────────────────────────┐
│ Layer 1: UI hiding (PERMS.role.tabs / .nav)                       │
│   - Tabs that shouldn't exist for a role simply don't render      │
│   - Sidebar items filtered by PERMS.role.nav                      │
│   - Useful UX hint; NOT a security boundary                       │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ Layer 2: Capability checks (can(user, "createProject"))           │
│   - Buttons / forms guarded with can(user, perm)                  │
│   - Prevents accidental writes from UI quirks                     │
│   - Still not a security boundary                                 │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ Layer 3: RLS (the actual security boundary)                       │
│   - Every SELECT/INSERT/UPDATE/DELETE checked by Postgres        │
│   - Even if frontend is broken, data stays isolated               │
│   - Tested via 04_rls_tests.sql (24 assertions)                   │
└──────────────────────────────────────────────────────────────────┘
```

### Special role: Super Admin

- `role='superadmin'` sits outside any single org's boundary
- `is_superadmin()` function in Postgres bypasses RLS on read for cross-tenant visibility
- Can create/suspend orgs, invite users to any org, manage billing, see all activity
- **Should be assigned to 1-3 humans max** (the SaaS owner + maybe 1 support engineer)
- Assignment is direct SQL (`UPDATE profiles SET role='superadmin' WHERE id=...`), never via UI

### Impersonation flow

```
Super admin → Users → "View as [PM]"
   ↓
1. startImpersonate({realUser, asUser}) sets state
2. setUser(asUser) — the active user becomes the target
3. Persistent yellow banner at top of every page: "Impersonating Priya · Stop"
4. All subsequent API calls use the impersonated session
5. activity_log entries are still attributed to the REAL admin (not the impersonated user)
6. Click "Stop" → setUser(realUser) → back to admin dashboard
```

---

## 12. Realtime Architecture

### Channels

| Channel | Trigger | Subscribers | Use case |
| --- | --- | --- | --- |
| `rt:activity_log` | INSERT into activity_log | Architect (all org), Super admin (all orgs) | Live cross-team activity feed |
| `rt:messages` | INSERT into messages | All members of the project | Project chat live |
| `rt:issues` | INSERT into issues | Architect, PM | High-severity issue toast |
| `rt:notifications` (future) | INSERT into notifications | The recipient user | In-app push |

### How it works under the hood

1. Supabase Realtime is a separate service that watches Postgres replication
2. Each channel sets up a Postgres LISTEN/NOTIFY on a specific table
3. Frontend opens a WebSocket to `wss://<project>.supabase.co/realtime/v1`
4. RLS applies even to realtime — clients only receive rows they can SELECT
5. Reconnection is automatic on network blips

### Scale limits

- Free tier: 200 concurrent connections
- Pro tier: 500 concurrent connections
- Pay-as-you-go: $0.0025 per CCU above included
- For 50 paying customers × avg 10 concurrent users = 500 CCU → upgrade trigger

---

## 13. Offline-First Strategy

### Three modes

| Mode | Backend | Persistence | Sync |
| --- | --- | --- | --- |
| **Demo** | None | localStorage only | None |
| **Connected** | Supabase | LS cache + Supabase | Realtime + writes |
| **Offline** (connected but no network) | Supabase | LS cache + sync queue | Drained on reconnect |

### Sync queue mechanism

```
Write happens
   │
   ▼
isOnline()?
   │
   ├─ YES ─► saveKey(table, value) → Supabase upsert
   │
   └─ NO ──► queueOpAdd({ entity, op, value, _qid, _queued_at })
             │
             stored in localStorage sitetrack_sync_queue_v1
             │
             window 'online' event fires
             │
             queueOpDrain() returns + clears the queue
             │
             POST each op to Supabase
```

### IndexedDB for binary attachments

LocalStorage caps at ~5MB per origin. A single site photo is ~2MB. After 2-3 photos LS would fail.

`src/lib/offline.js` provides:
- `putBlob(key, dataUrl)` — stores binary safely in IDB (~50MB+ quota)
- `getBlob(key)` — retrieves
- `delBlob(key)` — removes

Photos are stored in IDB; their `key` (something like `photo_p1_2025-04-20_001`) is stored in the in-memory state. On render, the React component does `getBlob(key)` to display.

### UI affordances

- Top bar shows a **red "● Offline"** pill when `navigator.onLine === false`
- Pending-op count badge: **"↻ 3 queued"** when there are unsent operations
- Updates that depend on network (sending invoices via email, generating DPR via Edge Function) show a clearer "queued" state in their respective modals

---

## 14. Mobile Strategy

### Phase 1 — PWA (live today)

- `manifest.webmanifest` declares install metadata (icons, theme, name)
- `public/sw.js` registers a service worker for offline shell caching
- Works on iOS Safari (Add to Home Screen) and Android Chrome (Install)
- Limitations: no push notifications on iOS, limited background access

### Phase 2 — Capacitor wrap (scaffold ready)

- `capacitor.config.json` declares appId, plugins, splash, permissions
- `docs/MOBILE_BUILD.md` describes one-command native build
- Adds: native camera, geolocation, push notifications, file system, biometric auth
- iOS via Xcode (macOS required), Android via Android Studio (any OS)
- Distribution: App Store + Play Store

### Phase 3 — React Native (only if PWA + Capacitor proves insufficient)

- Same codebase isn't possible; would require full UI port
- Triggered only if: (a) performance issues from WebView, (b) need deep platform features
- Out of scope for v1, v2, likely v3

### Capacitor plugin map

| Plugin | Replaces | Why |
| --- | --- | --- |
| `@capacitor/camera` | `<input capture>` | Better photo quality, native UI |
| `@capacitor/geolocation` | `navigator.geolocation` | Higher accuracy, background updates |
| `@capacitor/push-notifications` | (none) | DPR ready → architect's phone |
| `@capacitor/share` | `wa.me` URL | Native share sheet (WhatsApp, email, etc.) |
| `@capacitor/filesystem` | (none) | Save offline copies of drawings |
| `@capacitor/network` | `navigator.onLine` | Reliable platform-native online detection |

---

## 15. Scalability & Performance

### Frontend bundle size

| Asset | Gzipped | Notes |
| --- | --- | --- |
| `react.js` chunk | 45 KB | React + ReactDOM |
| `recharts.js` chunk | 87 KB | Charts library (largest) |
| `d3.js` chunk | 20 KB | Used by recharts |
| `index.js` (app) | 57 KB | Our code |
| **Total** | **~210 KB gzipped** | Good for 3G India |

Lazy loading opportunities (queued):
- Lazy-load Recharts only when Analytics/AI tabs open (saves 87 KB on initial paint)
- Lazy-load PDF generators (DPR, exportPDF) — saves another ~30 KB

### Database scaling

| User count | DB size | RPS | Action |
| --- | --- | --- | --- |
| 0-10 | <500MB | <10 | Supabase Free |
| 10-50 | 500MB-4GB | 10-100 | Supabase Pro ($25/mo) |
| 50-200 | 4-15GB | 100-500 | Pro + add-ons |
| 200-1,000 | 15-60GB | 500-2K | Team or dedicated DB |
| 1,000+ | >60GB | >2K | Sharding by org_id |

### Read-write split

Currently all reads go to primary. At 500+ RPS, add a read replica:
- Reports (DPR, audit log) read from replica (stale-OK)
- Live data (current project state) reads from primary
- Writes always to primary

### Caching

| Layer | Cache | TTL |
| --- | --- | --- |
| Vercel Edge | Static assets | 1 year (immutable hash filenames) |
| Browser | LocalStorage cache of business data | Forever, invalidated on backend write |
| Browser | IndexedDB attachments | Forever, manual eviction |
| Supabase | Postgres query plan cache | Postgres-managed |

### Performance budgets

| Metric | Budget | Current |
| --- | --- | --- |
| First Contentful Paint (3G) | <2s | ~1.4s (cached) |
| Largest Contentful Paint | <2.5s | ~2.1s |
| Time to Interactive | <3.5s | ~2.8s |
| Cumulative Layout Shift | <0.1 | ~0.05 |
| Bundle size (gzipped) | <250 KB | ~210 KB |

---

## 16. Observability

### Logging strategy (current vs target)

| Layer | Current | Target (v1 prod) |
| --- | --- | --- |
| Frontend errors | console only | Sentry → alert on Slack |
| Supabase queries | Project logs UI | Stream to BetterStack |
| Edge Function logs | Supabase logs UI | Stream to BetterStack |
| Audit log | `activity_log` table | Same + archived to S3 monthly |
| Uptime | None | BetterStack 1-min checks |
| Performance (Core Web Vitals) | None | Vercel Web Analytics (free) |

### Alert thresholds (target)

| Signal | Threshold | Channel |
| --- | --- | --- |
| 5xx error rate | >1% over 5 min | Slack #ops |
| LCP p95 | >3s for 10 min | Slack #ops |
| Supabase DB CPU | >80% for 5 min | Slack #ops |
| Magic-link delivery failure | >5% in 1 hour | Slack #ops |
| Stripe/Razorpay webhook failures | >1 in 24 hours | Email |

### Audit log usage

- Every business write (project, milestone, drawing release, CO approval, etc.) writes a row
- Append-only — DELETE/UPDATE revoked at DB level
- Queryable for compliance reviews
- Exportable to CSV from Admin → Audit Log view
- 7-year retention recommended for India tax compliance

---

## 17. Compliance & India Specifics

### India-specific data handling

| Concern | Handling |
| --- | --- |
| **GST/TDS** | Calculated in `invoices` (gst, tds %) + `expenses`. Editable, transparent. Not auto-filed. |
| **EPF/ESI numbers** | Stored in `labour_register` (text, masked in UI by default) |
| **Aadhaar** | Stored masked (e.g. `XXXX-XXXX-1234`) — never full Aadhaar in plain text |
| **PAN** | Stored only when needed for invoice header — same masking treatment |
| **Worker wages (₹/day)** | Stored in `labour_register.wage`; only architect+PM see |

### Data residency

- **Singapore (current)** vs **Mumbai (preferred for India launch)**
- Supabase Free tier defaults to Singapore (~50ms latency from India)
- Pro tier required for Mumbai region
- Decision: launch on Singapore Free tier; migrate to Mumbai Pro after 2nd paying customer

### Compliance gaps (not yet covered)

- **DPDP Act 2023** — India's data protection law. App needs: consent capture, data export request flow, data deletion request flow. Not yet built.
- **GST e-invoicing** — for businesses with turnover >₹5 cr/year. Optional integration with IRN portal. Out of scope until customer demands it.
- **Audit trail for labour register** — Labour ministry occasionally inspects. Activity log covers reads/writes; we are good here.

### Legal docs needed before first paid customer

- [ ] Privacy Policy (template from termsfeed.com or iubenda)
- [ ] Terms of Service
- [ ] Data Processing Agreement (for B2B customers who ask)
- [ ] Cookie policy (minimal — we only use localStorage + auth cookie)

---

## 18. Cost Model

### Per-customer unit economics

Assumptions: avg ₹2,500/mo Pro plan, 5 users per org, 100 projects/year, 5GB storage/year

| Cost line | Per customer / month |
| --- | --- |
| Supabase Pro share (amortized across customers) | ₹15 |
| Storage (5GB → ₹3 at Supabase rates) | ₹3 |
| Bandwidth (Vercel free → ~₹0) | ₹0 |
| Email (Resend free 100/day) | ₹0 |
| AI calls (₹1 per generation, ~50/mo) | ₹50 |
| WhatsApp Business (₹0.55 per message, 30 DPRs/mo) | ₹16 |
| Sentry/observability share | ₹5 |
| **Total infra cost / customer / month** | **~₹89** |
| **Pro plan price** | **₹2,499 (excluding GST)** |
| **Gross margin** | **96%** |

### Total cost projection

| Stage | Customers | Monthly cost | Monthly revenue | Net |
| --- | --- | --- | --- | --- |
| 0 (build) | 0 | ₹0 (free tiers) | ₹0 | -₹0 |
| Pilot | 1-3 | ₹2,150 (Supabase Pro $25 + domain) | ₹3K-9K | ₹850-7K |
| Growth | 5-15 | ₹3,950 | ₹15K-45K | ₹11K-41K |
| Scale | 20-50 | ₹6,500 | ₹50K-1.25L | ₹43K-1.18L |
| 100 | 100 | ₹15K | ₹2.5L | ₹2.35L |

Profitable from customer #2 onwards.

---

## 19. Decision Log (Architectural Decision Records)

Each ADR follows: **Context → Decision → Consequences**.

### ADR-001: React + Vite over Next.js
- **Context**: SiteTrack is primarily client-side (PWA), no SEO concerns (auth-gated app), small team
- **Decision**: Plain React + Vite, no Next.js framework
- **Consequences**: Simpler build, no server-side surprises, no Vercel framework lock-in beyond CDN. Trade-off: no automatic image optimization, no SSR if we ever need it.

### ADR-002: Supabase over Firebase
- **Context**: SiteTrack data is highly relational (projects → milestones → tasks; drawings with revision graph; invoices linked to milestones)
- **Decision**: Supabase (Postgres + RLS) over Firebase (Firestore NoSQL)
- **Consequences**: Better data integrity, real RLS, standard SQL. Trade-off: slightly steeper Postgres learning curve.

### ADR-003: Single large App.jsx instead of micro-components
- **Context**: V1 priority was shipping features fast; refactor cost is high; smoke string-marker test catches regressions
- **Decision**: Keep ~3,800-line App.jsx; refactor when it crosses 5,000 or when 2 engineers conflict regularly
- **Consequences**: Faster shipping today, bigger refactor later. BACKLOG tracks the split plan.

### ADR-004: PERMS object as single source of truth
- **Context**: First attempt had PERMS duplicated in App.jsx and tests; they drifted
- **Decision**: Extract to `src/lib/permissions.js`; App.jsx imports; smoke + regex enforces no local PERMS
- **Consequences**: Critical Tech Lead fix. Will not drift again.

### ADR-005: localStorage cache + Supabase upsert pattern
- **Context**: Need offline-friendly app for spotty Indian construction sites; cannot require always-on connection
- **Decision**: `usePersistent` hook with LS-first read, debounced Supabase write, queue when offline
- **Consequences**: Slightly delayed remote sync (acceptable for construction data). Demo mode is the same code path with backend disabled.

### ADR-006: Vercel + Supabase over self-hosted
- **Context**: Cost vs ops burden trade-off for a small team
- **Decision**: Managed services (Vercel + Supabase) for v1; consider self-hosting only at 50+ customers if economics demand
- **Consequences**: ~₹2,150/mo at scale vs ~₹0 self-hosted but ~5h/mo ops. Time saved > money spent at this size.

### ADR-007: Editorial premium UI (Fraunces + cream + amber)
- **Context**: Construction tools look like enterprise SaaS (utility-grade); we want client portals that elevate the customer's brand
- **Decision**: Fraunces serif for display, Inter for body, warm cream background, amber gold accent
- **Consequences**: Stands out massively in demos. Risks looking "non-serious" for some buyers; mitigated by showing the BOQ/Ledger/RA bills depth.

### ADR-008: Magic link auth, no passwords
- **Context**: Indian construction workers + small builders forget passwords constantly
- **Decision**: Email-only magic link via Supabase Auth; no password storage
- **Consequences**: Better UX, less ops (no "I forgot my password" tickets), no password breach risk. Trade-off: dependent on email delivery; first 30 days might have higher drop-off.

### ADR-009: Markup tool inline canvas vs dedicated tool
- **Context**: Drawing markup is one of the top-asked features; full PDF.js + annotation library is heavy
- **Decision**: Build basic canvas overlay (~150 lines); good enough for image markup; PDF markup queued for v2
- **Consequences**: Ship in v1 with image-only markup. PDF markup waits for proven demand.

### ADR-010: Razorpay UPI deep link before full subscription integration
- **Context**: First 3 customers want to pay monthly; building Razorpay Subscription API takes 2 weeks
- **Decision**: UPI deep link per invoice in v1; full Subscriptions API in v2 when 5+ customers active
- **Consequences**: Manual payment marking for first 5 customers; auto from v2.

---

## 20. Risks & Limitations

### Tech debt

| Item | Severity | Status |
| --- | --- | --- |
| App.jsx is 3,800 lines | Medium | Tracked in BACKLOG; smoke markers prevent regression |
| 37 ESLint unused-var warnings | Low | Not blocking; cleanup in next sprint |
| No e2e (Playwright) tests | Medium | Vitest covers logic; e2e queued for v1.1 |
| Prettier not yet run across codebase | Low | Bulk format PR queued |
| CI workflow lives in docs/ (not actually running) | Medium | Needs `workflow`-scoped token to activate |

### Operational risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Supabase free tier limits hit | Medium | Upgrade to Pro before customer #2 |
| Magic link email rate limit | High at scale | Configure custom SMTP (Resend) before customer #5 |
| Vercel build minutes exceeded | Low | Free tier covers ~6,000 min/mo; we use ~5 per deploy |
| Realtime CCU limit | Low | Free 200, Pro 500; trigger at #20 paying customers |

### Business risks

| Risk | Mitigation |
| --- | --- |
| Powerplay launches a cheaper plan | Differentiate on editorial UI + open-source + India regional focus |
| RDash adds Telugu UI | We already have Telugu; expand to Tamil + Kannada |
| Construction downturn in India | Conservative customer acquisition; lean ops |

---

## 21. Roadmap

### v1.0 (current — preparing for first paid pilot)
- [x] Editorial premium UI across all surfaces
- [x] 5 roles (Super Admin + 4 tenant)
- [x] 25+ project tabs
- [x] BOQ, Estimate, Stock Ledger, Measurement Book
- [x] DPR PDF generator + WhatsApp share
- [x] Drawing markup canvas
- [x] E-signature on change orders
- [x] AI Insights (rule-based + LLM scaffold)
- [x] UPI deep link on invoices
- [x] 7 admin views (Console, Orgs, Users, Billing, Usage, Audit, Support, Settings)
- [x] Impersonation
- [x] Supabase schema + RLS + tests
- [x] Live activation runbook (`docs/GOLIVE.md`)
- [ ] First Supabase project provisioned (user-blocked)
- [ ] First paid customer signed

### v1.1 (post-launch, 30 days)
- [ ] Auto-DPR via Edge Function + WhatsApp Business
- [ ] Razorpay Subscriptions API
- [ ] App.jsx refactor into modules
- [ ] Playwright e2e (1 scenario per role)
- [ ] ESLint zero warnings
- [ ] Bulk Prettier format
- [ ] Capacitor → first iOS + Android builds

### v1.2 (60 days)
- [ ] PDF markup viewer (pdf.js)
- [ ] Estimate from PDF takeoff (basic)
- [ ] Custom domain for each customer (cname per org)
- [ ] DPDP compliance UI (consent capture, data export)

### v2.0 (90 days)
- [ ] Multi-language (Tamil, Kannada in addition to Telugu/Hindi/English)
- [ ] Vendor marketplace (BuildSupply parity)
- [ ] Material request → PO → GRN workflow
- [ ] Custom report builder (drag-drop fields)
- [ ] Public API (read-only) for partner integrations

### v3.0 (180 days)
- [ ] On-prem deployment option for large builders
- [ ] White-label / agency mode (architects resell to clients)
- [ ] Procurement marketplace integration

---

## Appendix A — File Map

```
Site-Tracker-Pro/
├── README.md
├── CHANGELOG.md
├── package.json, package-lock.json
├── vite.config.js, tailwind.config.js, postcss.config.js
├── eslint.config.js, .prettierrc.json, .prettierignore
├── vercel.json, netlify.toml
├── capacitor.config.json
├── .env.example
├── index.html
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── icon-192.svg, icon-512.svg
├── src/
│   ├── main.jsx
│   ├── App.jsx                      [3,800 lines]
│   ├── index.css                    [editorial fonts + design tokens]
│   └── lib/
│       ├── permissions.js           [PERMS + role helpers]
│       ├── usePersistent.js         [LS ⇄ Supabase hook]
│       ├── supabase.js              [client + auth + adapter]
│       ├── offline.js               [IDB + sync queue]
│       ├── ai.js                    [risk engine + LLM bridge]
│       └── razorpay.js              [UPI + Payment Link]
├── scripts/
│   ├── smoke.mjs                    [123 string-marker checks]
│   ├── provision.sh                 [local bootstrap]
│   └── supabase/
│       ├── 01_schema.sql            [20+ tables]
│       ├── 02_rls.sql               [RLS policies]
│       ├── 04_rls_tests.sql         [24 assertions]
│       └── README.md
├── tests/
│   └── permissions.test.js          [36 vitest cases]
├── docs/
│   ├── AGENTS.md                    [agent operating guide]
│   ├── WORKFLOW.md
│   ├── BACKLOG.md                   [feature backlog]
│   ├── QUALITY.md                   [QA + release process]
│   ├── BUSINESS_MODEL.md            [SaaS positioning + pricing]
│   ├── PRICING.md
│   ├── MARKET_ANALYSIS.md           [competitor matrix + 50-feature traceability]
│   ├── DEPLOYMENT.md
│   ├── BACKEND_PLAN.md              [Supabase migration plan]
│   ├── MOBILE_BUILD.md              [Capacitor playbook]
│   ├── GOLIVE.md                    [30-min live runbook]
│   ├── CI_WORKFLOW.yml              [GitHub Actions template]
│   ├── CI_SETUP.md
│   └── SYSTEM_DESIGN.md             [THIS DOCUMENT]
├── .agents/sitetrack-pro/
│   ├── README.md
│   ├── team-lead.md
│   ├── product-manager.md
│   ├── construction-domain-analyst.md
│   ├── ux-ui-designer.md
│   ├── frontend-engineer.md
│   ├── backend-engineer.md
│   ├── qa-test.md
│   ├── security-permissions.md
│   ├── devops-release.md
│   ├── documentation.md
│   ├── data-ai-insights.md
│   ├── work-board.md                [agent run history + Tech Lead approvals]
│   └── handoff-template.md
├── artifacts/                       [screenshots from previous Codex runs]
└── node_modules/                    [git-ignored]
```

---

## Appendix B — Glossary

| Term | Definition |
| --- | --- |
| **BOQ** | Bill of Quantities — pre-construction itemized list of work scope with unit rates |
| **RA bill** | Running Account bill — periodic contractor payment claim against measured work |
| **MB** | Measurement Book — itemized record of work done in the field, used to substantiate RA bills |
| **DPR** | Daily Progress Report — end-of-day site summary, often shared via WhatsApp in India |
| **RFI** | Request for Information — formal question from PM/contractor to architect about scope |
| **CO** | Change Order — modification to original scope with cost/time impact, requires client approval |
| **GRN** | Goods Receipt Note — proof of material delivered to site |
| **GST** | Goods and Services Tax — India's consumption tax, varies 5-28% by category |
| **TDS** | Tax Deducted at Source — India's withholding tax mechanism |
| **EPF** | Employees Provident Fund — India's mandatory retirement savings for workers |
| **ESI** | Employees State Insurance — India's mandatory health insurance for workers |
| **RLS** | Row Level Security — Postgres feature that filters rows by user identity |
| **PWA** | Progressive Web App — installable web app with offline shell |
| **WSS** | WebSocket Secure — protocol for realtime bidirectional data |
| **CDN** | Content Delivery Network — edge cache for static assets |
| **PITR** | Point-in-Time Recovery — DB restore to a specific timestamp |

---

## Appendix C — Quick Architecture Q&A

**Q: How do I add a new tab to a project?**
1. Add tab id to `PERMS.[role].tabs` array in `src/lib/permissions.js`
2. Add label to `TAB_LABELS` in App.jsx if needed
3. Add a new component function (use existing tab as template)
4. Wire `tab==="newtab" && <NewTab ... />` into DetailView render
5. Add smoke markers + vitest case
6. If it touches data: add DB table to `01_schema.sql` + RLS to `02_rls.sql`

**Q: How do I support a new role?**
1. Add to PERMS in `src/lib/permissions.js`
2. Add to `ROLE_META` in App.jsx
3. Add to `INIT_ADMIN_USERS` mock data
4. Add login screen tile
5. Update RLS policies to recognize the new role
6. Add cross-tenant tests if it needs bypass behaviour

**Q: How do I add a new external integration?**
1. Create `src/lib/<integration>.js` with the helper functions
2. If keys are needed in the browser: add to env + admin Settings panel
3. If keys must stay server-side: add Edge Function `supabase/functions/<name>`
4. Document in `docs/BACKEND_PLAN.md` integration section

**Q: How do I migrate the schema?**
1. Add a new file `scripts/supabase/0N_migration.sql` with ALTER TABLE statements
2. Test on dev project
3. Add corresponding test scenario to `04_rls_tests.sql`
4. Run on prod via SQL Editor during a low-traffic window
5. Backfill data if needed via script

**Q: A customer wants their own logo + colors. How?**
- v1: They paint customizations themselves (open-source vibe)
- v1.1: Settings panel for org-level logo upload + accent color override (already on roadmap)
- v2: Full white-label with custom subdomain

---

## Document Versioning

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-05-22 | Tech Lead Agent | Initial draft after live-activation sprint |

**Next review**: After first paying customer ships (estimated 2 weeks).

---

*This document is the source of truth. If code disagrees with this doc, fix the doc OR fix the code — both must align before release.*
