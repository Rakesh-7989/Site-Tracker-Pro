# SiteTrack Pro — Next Phase Plan

> **Based on**: Whole-product codebase audit + marketing funnel audit (2026-08-20)
> **Status**: Product is production-ready, feature-complete for core workflows. Next phase = **growth + intelligence + polish**.

---

## Executive Summary

SiteTrack Pro is **feature-complete** for its core value proposition: a construction-native operations platform with DPR, finance, materials, labour, drawings, CRM, compliance, and multi-tenant security. The codebase is mature (200+ migrations, 155+ tables, 2,856 tests, 506 cross-tenant RLS assertions). The marketing funnel (landing → signup → trial → onboarding → activation) works end-to-end.

**Three strategic pillars for the next phase:**

| Pillar | Objective | Investment |
|---|---|---|
| **1. Intelligence (AI/ML)** | Turn structured operational history into predictive insights | Medium (new Edge Functions + scheduled jobs + UI) |
| **2. Growth (Funnel Optimization)** | Convert more trials → paid, reduce time-to-value, viral loops | Low-Medium (UI + Edge Functions + email/WhatsApp) |
| **3. Polish (Enterprise Readiness)** | Demo mode, SSO, audit export, white-label subdomains | Medium (auth + infra + UI) |

---

## Pillar 1 — Intelligence (AI/ML Roadmap)

**Why now**: The product has 18+ months of structured operational data (tasks, DPRs, materials, labour, finance, issues) — perfect for heuristic/statistical models that run in SQL/TS (no hosted LLM needed initially).

### 1.1 Predictive Delay Engine
**Goal**: "This project is likely to finish 6 days late" — shown on project dashboard + promoter digest.

| Signal | Source Table | Computation |
|---|---|---|
| Schedule slip | `milestones` | Count overdue milestones (>3 days), max slip days |
| Budget burn | `projects.budget` + `expenses` + `purchase_orders` | (spent + committed) / budget ≥ 80% |
| Open high-severity issues | `issues` (severity=high/critical, status≠resolved) | Count × avg resolution days |
| RFI lag | `rfis` (status=open, created_at > 3 days ago) | Count × avg response days |
| Labour shortfall | `attendance` vs `shift_roster` | Present / required < 80% for 3+ days |
| Material stockouts | `material_requests` (status=approved/ordered) + `inventory_transactions` | Projected days until zero |

**Implementation**:
- New `risk_signals` table (project_id, computed_at, score 0-100, level, delay_days, delay_probability, signal_breakdown jsonb)
- Nightly pg_cron job → `compute_risk_signals(org_id)` SECURITY DEFINER RPC
- UI: `RiskSignalsCard` on OverviewTab (already exists in Phase D, needs live data)
- Promoter digest: include top-3 at-risk projects

**Effort**: 1 migration + 1 Edge Function (cron) + 1 RPC + UI wiring = **~3 days**

### 1.2 Cost Overrun Forecast
**Goal**: "At this burn rate, budget overrun is ₹2.4L" — shown on Budget tab + Monthly Statement.

| Input | Source |
|---|---|
| Budget | `projects.budget` |
| Actuals to date | `expenses` + `purchase_orders` (amount) + `ra_bills` (certified) |
| Committed (POs not yet billed) | `purchase_orders` (open_amount) |
| Monthly burn rate | Linear regression on last 3 months actuals |

**Implementation**:
- New `cost_forecast` table (project_id, forecast_month, projected_spend, projected_overrun, confidence)
- Monthly pg_cron job
- UI: Forecast card on Budget tab + MonthlyStatementView

**Effort**: 1 migration + 1 cron RPC + UI = **~2 days**

### 1.3 Material Stock-Out Prediction
**Goal**: "Cement stock will run out in 4 days" — shown on Materials tab + Procurement view.

| Input | Source |
|---|---|
| Current stock | `inventory_transactions` (inward - outward) per item per project |
| Consumption rate | Linear regression on last 14 days outward transactions |
| Open POs (incoming) | `purchase_orders` + `po_receipts` (open_amount) |
| Lead time | `procurement_quotes.lead_days` (best scored quote) |

**Implementation**:
- Material forecast computed on-demand (cheap query) or cached daily
- UI: "Days remaining" badge on MaterialsTab rows + ProcurementView alerts

**Effort**: 1 RPC + UI = **~1 day**

### 1.4 Labour Productivity Analytics
**Goal**: "Brickwork productivity dropped 18% this week" — shown on Labour tab + UtilizationView.

| Metric | Computation |
|---|---|
| Hours per unit | `attendance.hours` / `tasks.completed_qty` (per activity) |
| Overtime ratio | `attendance.overtime` / `attendance.hours` |
| Attendance rate | Present / Scheduled (from shift_roster) |
| Cost per unit | (wage + OT + EPF/ESI) / output |

**Implementation**:
- Extend `UtilizationView` / LabourTab with productivity cards
- Weekly pg_cron snapshot for trend lines

**Effort**: 1 RPC + UI = **~2 days**

### 1.5 AI Project Assistant (Chat Interface)
**Goal**: "Which projects are at risk?" → "3 projects: Villa 04, Villa 11, Villa 16" — natural language query over risk signals.

**Approach**: Start with **structured intent parser** (not full LLM):
- Map 10-15 intents → SQL/RPC calls (risk, budget, schedule, materials, labour)
- Render results as cards/tables in a chat panel
- Later: swap parser for LLM (OpenAI/Claude) when keys available

**Implementation**:
- New Edge Function `ai-assistant` (Deno, receives question + org context)
- Intent classification via keyword/regex → RPC dispatch
- UI: Floating chat button (bottom-right) on authenticated routes
- Response format: { answer: string, data?: any[], charts?: ChartDatum[] }

**Effort**: 1 Edge Function + UI chat panel = **~4 days**

### 1.6 Intelligence Delivery
| Channel | What |
|---|---|
| In-app | Dashboard cards, tab badges, chat assistant |
| WhatsApp | Daily digest includes top risks (extends `promoter_digest_cron`) |
| Email | Weekly executive summary (new `weekly_intelligence_cron`) |
| PDF | Monthly intelligence report (extends `MonthlyStatementView`) |

---

## Pillar 2 — Growth (Funnel Optimization)

**Current funnel metrics (estimated from code)**:
- Landing → Register: ~3% (industry avg 2-5%)
- Register → Email confirm: ~60% (Supabase magic link + SMTP)
- Confirm → Onboarding complete: ~40% (6-step wizard)
- Onboarding → First DPR: ~25% (activation metric)
- Trial (14 days) → Paid: ~15% (industry avg 10-20%)

**Target**: Double trial-to-paid to 30% in 6 months.

### 2.1 Reduce Time-to-First-Value (TTFV)
**Problem**: 6-step onboarding takes 10-15 minutes. Users drop off before seeing value.

| Fix | Impact | Effort |
|---|---|---|
| **Skip-to-value**: "Create a demo project with sample data" button on step 1 | User sees full app in 30 seconds | 1 day |
| **Progressive onboarding**: Defer Steps 3-6 (invite team, presets, integrations) to in-app prompts | Reduces initial friction | 2 days |
| **Sample data seed**: One-click "Load demo villa project" with 5 DPRs, 10 tasks, materials, labour | Instant "aha!" moment | 1 day |
| **Guided tour**: Tooltip-driven walkthrough of DPR composer, dashboard, finance | Self-serve activation | 2 days |

### 2.2 Trial-to-Paid Conversion
| Feature | Description | Effort |
|---|---|---|
| **Trial banner with countdown** | Persistent top bar: "7 days left in your Pro trial — pick a plan" | 1 day |
| **In-app upgrade prompt** | Contextual: when hitting plan limits (5 projects on Basic, 5 members, etc.) | 2 days |
| **Trial extension offer** | "Need more time? Reply to this email for 7 extra days" (manual → automated) | 1 day |
| **Usage-based upgrade nudge** | "You've used 4/5 projects — upgrade to Pro for unlimited" | 1 day |
| **Annual discount reminder** | "Save 17% (₹15,998) by switching to annual" at day 10 | 1 day |

### 2.3 Viral / Referral Growth
| Feature | Description | Effort |
|---|---|---|
| **Referral program** | "Invite a peer firm → both get 1 month free" (track via `signup_requests.referred_by`) | 3 days |
| **WhatsApp share DPR** | Already exists — add "Invite your contractor to SiteTrack" CTA on shared DPR | 1 day |
| **Client portal invite** | "Invite your client to view progress" → client signs up → referral credit | 2 days |
| **Public project showcase** | Optional: "Share a read-only project page" (marketing + viral) | 2 days |

### 2.4 Email/WhatsApp Lifecycle Automation
**Current**: Only confirmation + welcome email. **Missing**: entire lifecycle.

| Email/WA | Trigger | Template |
|---|---|---|
| Day 1 | Signup confirmed | "Welcome + demo project link" |
| Day 3 | No onboarding progress | "Stuck? Book a 15-min setup call" |
| Day 7 | Trial halfway | "7 days used — here's what you've built" (usage stats) |
| Day 10 | Trial ending soon | "3 days left — pick a plan, save 17% annually" |
| Day 14 | Trial expired | "Trial ended — your data is safe, upgrade to continue" |
| Day 21 | Expired, no upgrade | "We miss you — 50% off first month if you return" |
| Weekly | Active trial | "Your weekly SiteTrack digest" (projects, DPRs, risks) |

**Implementation**: New `lifecycle_emails` table + pg_cron job + Resend templates. WhatsApp via `notify-deliver` (already wired for DPR).

**Effort**: 1 migration + 1 cron EF + 8 templates = **~3 days**

### 2.5 Demo / Sandbox Mode
**Problem**: Prospects want to try before giving email.

| Feature | Description |
|---|---|
| **Instant demo** | `/demo` route → pre-filled org with sample data, no auth, auto-expires in 30 min |
| **Guided demo** | Same + tooltip tour locked to demo mode |
| **Demo → Signup** | "Save this workspace" → converts to real signup with data preserved |

**Effort**: 1 route + session storage + conversion flow = **~3 days**

---

## Pillar 3 — Polish (Enterprise Readiness)

### 3.1 SSO / SAML / OIDC
**Target**: Enterprise plan (Business+) requirement.

| Provider | Priority |
|---|---|
| Google Workspace | High (most Indian firms) |
| Microsoft Entra ID (Azure AD) | High |
| Okta | Medium |
| Custom SAML | Low |

**Approach**: Use Supabase Auth's native SAML/OIDC (Enterprise plan) or Auth0/WorkOS integration via Edge Function.

**Effort**: 1 Edge Function + auth config + UI = **~5 days**

### 3.2 White-Label Subdomains
**Status**: Org branding (logo, accent, page title) shipped (Phase F). **Missing**: custom subdomain (`firm.sitetrackpro.in`).

| Component | Status |
|---|---|
| DNS wildcard (`*.sitetrackpro.in`) | ⬜ Not configured |
| Subdomain routing (middleware) | ⬜ Not implemented |
| SSL (Vercel auto) | ✅ Works with wildcard |
| Org `subdomain` field | ⬜ Add to `organizations` table |
| Cookie domain handling | ⬜ Cross-subdomain session |

**Effort**: 1 migration + Vercel wildcard + middleware + session fix = **~4 days**

### 3.3 Audit Export & Compliance
| Feature | Description |
|---|---|
| **Full audit export** | CSV/PDF of all org activity (already have `audit_log_v2` table) |
| **GDPR/PDPA delete** | "Delete my data" → anonymize + purge (Supabase Auth admin API) |
| **SOC2-ready logs** | Structured JSON logs to Loki/DataDog (currently console only) |
| **Data residency** | Document Supabase region (Mumbai) + Resend region |

**Effort**: UI + RPCs = **~3 days**

### 3.4 Advanced Permissions
| Feature | Description |
|---|---|
| **Custom roles** | UI to compose capabilities → role (Business+ plan gate) |
| **Project templates** | "Standard villa" template with tasks, milestones, checklists pre-filled |
| **Approval workflows** | Multi-step (engineer → PM → promoter) for POs, invoices, change orders |

**Effort**: 2-3 migrations + UI = **~5 days**

---

## Prioritized Roadmap (Next 12 Weeks)

| Week | Focus | Deliverables |
|---|---|---|
| **1-2** | **Quick wins (Growth)** | Skip-to-value demo project, trial banner, trial extension email, sample data seed |
| **3-4** | **Intelligence Foundation** | Risk signals RPC + cron, cost forecast RPC, Material stock-out RPC |
| **5-6** | **Intelligence UI** | RiskSignalsCard live data, Forecast cards on Budget/MonthlyStatement, Utilization productivity |
| **7-8** | **AI Assistant** | Intent parser + chat panel (structured, no LLM yet) |
| **9-10** | **Lifecycle Automation** | 8-email/WA sequence, pg_cron job, Resend templates |
| **11-12** | **Referral + Demo Mode** | Referral program, `/demo` sandbox, demo→signup conversion |

**Parallel tracks (can start anytime)**:
- SSO/SAML (Enterprise plan requirement) — **Week 5+**
- White-label subdomains — **Week 8+**
- Custom roles + project templates — **Week 10+**

---

## Technical Architecture for Intelligence Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    INTELLIGENCE LAYER                        │
├─────────────────────────────────────────────────────────────┤
│  pg_cron (nightly)                                          │
│    ├─ compute_risk_signals(org_id)      → risk_signals      │
│    ├─ compute_cost_forecast(org_id)     → cost_forecast     │
│    ├─ compute_material_forecast(org_id) → material_forecast │
│    └─ compute_labour_productivity(org_id)→ labour_metrics   │
├─────────────────────────────────────────────────────────────┤
│  Edge Functions (on-demand)                                 │
│    ├─ ai-assistant (intent parser + RPC dispatch)           │
│    ├─ weekly_intelligence_cron (email digest)               │
│    └- lifecycle_emails_cron (trial nurture sequence)        │
├─────────────────────────────────────────────────────────────┤
│  Data Tables (append-only, partitioned by org_id + month)   │
│    risk_signals, cost_forecast, material_forecast,          │
│    labour_metrics, lifecycle_email_log                      │
├─────────────────────────────────────────────────────────────┤
│  UI Components                                              │
│    RiskSignalsCard, CostForecastCard, MaterialAlertBadge,  │
│    ProductivityChart, AIChatPanel, TrialBanner, UpgradeNudge│
└─────────────────────────────────────────────────────────────┘
```

**Key principle**: All intelligence is **heuristic/statistical** (SQL/TS), not LLM-dependent. LLM only for the chat parser later. This keeps costs near-zero, latency low, and data private.

---

## Resource Estimates

| Pillar | Dev Days | Infra Cost | Ongoing Cost |
|---|---|---|---|
| Intelligence (1.1-1.5) | ~12 | pg_cron (free on Supabase) | Near-zero |
| Growth (2.1-2.5) | ~15 | Resend (email) + WhatsApp API | ~$50/mo at scale |
| Polish (3.1-3.4) | ~17 | Auth0/WorkOS (~$200/mo if used) | Variable |
| **Total** | **~44 days** | | |

**Team allocation suggestion**: 1 full-stack engineer (you) + 0.5 designer for UI polish = 12 weeks calendar.

---

## Success Metrics (KPIs)

| Metric | Baseline | 3-Month Target | 6-Month Target |
|---|---|---|---|
| Trial → Paid conversion | ~15% | 22% | 30% |
| Time-to-First-DPR | ~45 min | 15 min | 5 min (demo mode) |
| Weekly active users / org | ~3 | 5 | 8 |
| Promoter digest open rate | ~40% | 55% | 65% |
| Referral signups / month | 0 | 5 | 20 |
| Churn (monthly) | ~5% | 3% | 2% |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Intelligence models too noisy | Medium | Low | Start with heuristic rules, tune thresholds, add "dismiss" feedback |
| Email deliverability drops | Low | High | Resend domain verified, SPF/DKIM/DMARC, suppression list monitoring |
| pg_cron jobs fail silently | Medium | Medium | Add `cron.job_run_details` monitoring + alerting EF |
| LLM costs spiral | Low (not using yet) | Medium | Hard token limits, cache responses, structured parser first |
| Trial abuse (multiple signups) | Medium | Low | IP rate limit (exists), honeypot (exists), device fingerprint (future) |

---

## Immediate Next Steps (This Week)

1. **Create demo project seed script** (`scripts/seed-demo-project.mjs`) — one command loads a realistic villa project with 5 DPRs, 10 tasks, materials, labour, finance.
2. **Add "Load demo project" button** to OnboardingView Step 1.
3. **Implement trial banner** (persistent, dismissible, shows days left).
4. **Add pg_cron job** for `compute_risk_signals` (schema + RPC + cron.schedule).
5. **Wire RiskSignalsCard** to live RPC data (replace mock).

**Decision needed from you**: Which pillar to start first? (Recommendation: **Growth quick wins (Week 1-2)** → immediate revenue impact, then Intelligence foundation.)

---

## Appendix: Files to Touch (Reference)

| Area | Files |
|---|---|
| Intelligence RPCs | `scripts/supabase/XXX_risk_signals.sql`, `scripts/supabase/XXX_cost_forecast.sql`, `src/app/intelligenceQueries.ts` |
| Cron EFs | `supabase/functions/risk-signals-cron/`, `supabase/functions/lifecycle-emails-cron/` |
| UI Components | `src/features/project/tabs/OverviewTab.tsx` (RiskSignalsCard), `src/features/org/MonthlyStatementView.tsx`, `src/features/project/tabs/BudgetTab.tsx`, `src/features/project/tabs/MaterialsTab.tsx`, `src/features/org/UtilizationView.tsx` |
| Growth | `src/features/auth/OrgRegisterView.tsx` (demo button), `src/features/shell/TrialBanner.tsx` (new), `src/features/auth/LoginScreenV3.tsx` (demo route) |
| Lifecycle | `scripts/supabase/XXX_lifecycle_emails.sql`, `supabase/functions/lifecycle-emails-cron/` |
| Demo Mode | `src/app/routes/DemoRoute.tsx` (new), `src/features/marketing/DemoView.tsx` (new) |
| Referral | `scripts/supabase/XXX_referral.sql`, `src/app/referralQueries.ts` |

---

*This plan is a living document. Update after each phase-close per the Agentic SDLC loop.*