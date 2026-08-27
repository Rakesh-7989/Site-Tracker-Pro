# SiteTrack Pro — Interview Cheat Sheet (1-Pager)

---

## 🎯 45-Second Pitch (English)

> *"I built SiteTrack Pro — a construction operations platform for Indian builders and contractors. Construction firms run on WhatsApp groups, Excel sheets, and paper — so nobody trusts the numbers and the promoter is always the last to know. SiteTrack centralizes daily reporting, tasks, labour, materials, finance, and drawings into one place with role-based access — and it speaks the field's language: voice-to-text DPRs in Telugu/Hindi/English, WhatsApp delivery, works offline, on any phone. I shipped it live at sitetrackpro.in with real customers, real payments, and a multi-tenant security model tested against cross-tenant attacks."*

## 🎯 45-సెకన్ల పిచ్ (తెలుగు)

> *"నేను SiteTrack Pro built చేశాను — Indian builders/contractors కోసం construction operations platform. Construction firms WhatsApp groups, Excel sheets, paper ల మీద నడుస్తాయి — అందువల్ల ఎవరూ numbers ని నమ్మరు, promoter కి చివర్లో తెలుస్తుంది. SiteTrack daily reports, tasks, labour, materials, finance, drawings ని ఒకే చోటకి తీసుకొస్తుంది — role-based access తో. ఇది field భాషలో మాట్లాడుతుంది: తెలుగు/హిందీ/ఇంగ్లీష్ voice-to-text DPRs, WhatsApp delivery, offline, ఏ phone లోనైనా. sitetrackpro.in లో live గా ఉంది — real customers, real payments, cross-tenant tested multi-tenant security తో."*

---

## 🔢 Key Numbers (memorize these 6)

| # | Number | What it proves |
|---|---|---|
| 1 | **2,856** | Unit tests (224 files) — engineering rigor |
| 2 | **506** | Cross-tenant RLS security assertions vs live DB |
| 3 | **155+** | DB tables · **200+** migrations — real domain depth |
| 4 | **25** | Edge Functions (WhatsApp, Cashfree, RERA, email) |
| 5 | **20+** | Identity roles with a fine-grained capability matrix |
| 6 | **₹5,999 / ₹11,999 / ₹19,999** | Self-serve pricing, 14-day free trial, +18% GST |

---

## 💬 Top 5 Interview Q&A

**Q1. Why did you build this?**
*A real pain I saw: construction info lives in WhatsApp/Excel/paper/people's heads — no single source of truth, no accountability. I wanted to fix that structurally.*

**Q2. What makes it hard technically?**
*Multi-tenancy done right. Every table has Row-Level Security; I wrote an attack-test suite (506 live-DB assertions across 2 orgs + 1 outsider user) to prove data can't leak across tenants — runs in CI on every push.*

**Q3. How is it architected?**
*React 19 SPA + Supabase (Postgres/RLS/Storage) + 25 Deno Edge Functions, deployed on Vercel. Three-way gating: Capability (RBAC) × Plan (entitlement) × Module (segment). Lazy-loaded routes; dependency-free charts + virtualized DataTable.*

**Q4. How do you ship safely?**
*CI gate: lint → typecheck → build → 2,856 tests → coverage → mocked role-access e2e → a DB column-drift check against the live database. Prod deploys are tree-identical to main, review-gated, and live-verified after merge.*

**Q5. Where is it going?**
*The data is structured operational history — perfect for AI. Roadmap: predictive delays, cost-overrun forecasts, material forecasting, and a risk-focused AI assistant.*

---

## 🥊 USP in 1 line

**Construction-native workflows (DPR, RA bills, RERA, GRN) + built for the field (Telugu/Hindi voice, WhatsApp, offline, any phone) + one data model spanning operations, finance, CRM & compliance.**

---

*Full details: `docs/business/PRODUCT_CASE_STUDY.md` (English) · `docs/business/PRODUCT_CASE_STUDY_TE.md` (తెలుగు)*