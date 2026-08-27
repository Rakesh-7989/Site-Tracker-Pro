# SiteTrack Pro — Plan × Feature Matrix

**Date:** 2026-06-06 · **Decision doc**. Read after `FEATURE_PLAN_ROLE_MASTER.md`.

> Tells you: what to put in each tier and why. Backed by competitor evidence
> (Powerplay, Onsite, Buildertrend) so the answer isn't a guess.

---

## 1. The current pricing (already live)

| Tier | Monthly | Annual (2 months free) | Save | Positioning |
|---|---|---|---|---|
| **Basic** | ₹5,999 | ₹59,990 | ₹11,998 (17%) | entry tier |
| **Pro** ⭐ | ₹11,999 | ₹1,19,990 | ₹23,998 (17%) | ≈ Powerplay Pro+ parity |
| **Business** | ₹19,999 | ₹1,99,990 | ₹39,998 (17%) | slightly premium |

All prices exclusive of 18% GST.

---

## 2. Competitive evidence (one-paragraph distillation)

**Powerplay** (Bangalore — main rival): bundle pricing per org. Pro-Manpower or Pro-Material ₹71,999/yr; Pro+ ₹1,19,999/yr. Strong on DPR + labour + materials + petty cash. **Weak on RFI/drawings/audit/API** (none advertised on homepage). Their entire pitch is *"replace WhatsApp"* — they will not pivot to outbound WhatsApp DPR. Multi-language Indian advertised.

**Onsite** (Indian, Chennai): per-user pricing. Business ₹12k/user/yr (min 3 users); Business+ ₹15k/user/yr; Enterprise ₹10L+/yr (unlimited users, white-label only at Enterprise). 8 Indian languages including Telugu. Same "replace WhatsApp" framing as Powerplay. **Per-user math gets expensive past ~15 users.** At 20 users Onsite Business+ = ₹3,00,000/yr — SiteTrack Pro at ₹1,19,990/yr is **2.5× cheaper.**

**Buildertrend** (US, reference only): Essential $499/mo → Advanced $799 → Complete $1,099. Pattern: Essential = DPR + tasks + client portal; Advanced = POs + estimating + change orders; Complete = client selections + warranty (governance/post-handover). Confirms the universal pattern: **procurement is the Basic→Pro upsell; governance is the Pro→Business upsell.**

**Autodesk Construction Cloud** (reference): Standard → Premium adds SSO + directory sync + 24×7; Premium → Enterprise adds Managed Success Plan. Confirms top-tier gate = SSO + dedicated support + custom integrations.

Full table with citations is in the **R&D agent transcript** (in this session's task output). Key sources:
- Powerplay pricing: techjockey.com + getpowerplay.in (Jun 2026)
- Onsite pricing: onsiteteams.com/onsite-pricing (Jun 2026)
- Buildertrend tiers: buildertrendpricing.com (Jun 2026)
- Autodesk vs Fieldwire: g2.com compare page

---

## 3. The proposed matrix

Legend: ✅ full · 🔒L limited (lower cap or read-only) · — not included · ⚠ stub (don't promise live yet)

| Feature | Basic ₹5,999 | Pro ₹11,999 | Business ₹19,999 |
|---|:---:|:---:|:---:|
| Seats | 5 | 20 | 100 |
| Active projects | 5 (raised from 3) | unlimited (hard ceiling 50) | unlimited (hard ceiling 200) |
| Storage | 5 GB (raised from 1 GB) | 50 GB | 250 GB |
| **DPR + Updates + Issues + Punchlist** | ✅ | ✅ | ✅ |
| Materials + Vendors + PO basic | ✅ | ✅ | ✅ |
| Attendance + Labour register | ✅ | ✅ | ✅ |
| BOQ + Inspections + Safety + Field Ops | ✅ | ✅ | ✅ |
| Calendar + Activity + Messages | ✅ | ✅ | ✅ |
| **Telugu / Hindi UI** | ✅ | ✅ | ✅ |
| **WhatsApp share buttons** (manual `wa.me`) | ✅ | ✅ | ✅ |
| Hierarchy (Block/Floor/Unit) | — | ✅ | ✅ |
| Drawings upload + release + markup | 🔒L view-only | ✅ | ✅ |
| RFI + Change Orders | — | ✅ | ✅ |
| **Finance** (Invoice / RA Bill / Expense approve, Budget edit, Ledger) | — | ✅ | ✅ |
| **Approval Chains** + Delegations + Templates | — | ✅ | ✅ |
| Notification rules | — | ✅ | ✅ |
| Compliance dashboard (RERA / GST / EPFO read checks) | — | ✅ | ✅ |
| Estimate tab + Gantt tab + Snapshot panel | — | ✅ | ✅ |
| eSignature on approvals | — | ✅ | ✅ |
| Material price aggregator | — | ⚠ | ⚠ |
| **RERA filing** (multi-state) | — | — | ⚠ |
| **GSTN e-invoice** + EPFO filing | — | — | ⚠ |
| **Custom roles** + capability overrides | — | — | ✅ |
| Org-wide audit log read + export | — | 🔒L 30-day | ✅ unlimited + CSV |
| **Automated DPR via WhatsApp (6pm)** | — | — | ✅ |
| WhatsApp message send (programmatic) | — | — | ✅ |
| Cashfree / payments integration | — | — | ✅ |
| Labour Kiosk + Site Kiosk | — | — | ⚠ |
| AR drawing overlay | — | — | ⚠ |
| AI cost forecast + AI Insights tab | — | — | ⚠ BYOK |
| Priority support (4-hr SLA) | — | — | ✅ |

---

## 4. Pro → Business — what makes the upsell

**Pro is the operational efficiency plan.** A growing firm running 5–15 active projects with 10–20 people will pay ₹12k/mo for the approval chains alone, because today they're tracking RA bill approvals on WhatsApp. They don't yet need custom roles or full audit because the team is small enough that the standard 22-role catalog covers everyone.

**Business is the governance + automation + write-compliance plan.** Three things justify the +₹8k/mo step-up:

1. **Write actions to government systems** (RERA filing, GSTN e-invoice, EPFO) — the stuff a CA / PMO actually clicks "submit" on. Big-ticket money saver and risk reducer.
2. **Custom roles + full audit trail** — an established 50+ person firm needs this because the standard 22 roles don't match their org chart, and the audit log is what a bank's relationship manager / RERA inspector asks for.
3. **Automation** (auto-DPR, programmatic WhatsApp, payment integration) — only matters when you have enough projects that doing it manually costs more than the plan delta.

The Business buyer is a firm where the PROMOTER role has hired a dedicated Org Admin — and that Org Admin is the one demanding audit + custom roles.

---

## 5. Basic → Pro — what makes the upsell

Procurement + Finance + Approvals are the canonical Basic→Pro trigger across the market (Onsite Business+, Powerplay Pro+, Buildertrend Advanced — all confirm this). A 2-person contractor with one site can survive on Basic (DPR + materials log + attendance). The moment they hit:

- a second site (BUT not 4+ since we raised Basic to 5 projects — see §6),
- a CA who wants RA bills not on WhatsApp,
- a finance / loan need for budget vs actuals,

they upgrade to Pro. **Finance + approval chains is the single strongest Pro feature** because withholding them = builder cannot scale past 1 site.

---

## 6. What MUST be in every tier (table stakes)

If any of these are missing from Basic, contractors won't even trial:

| # | Feature | Why it's table-stakes |
|---|---|---|
| 1 | **Mobile DPR + photos + geo-tag + offline** | Site engineers refuse desktop tools. Powerplay + Onsite both lead with this. |
| 2 | **Labour attendance (mobile, face/GPS) + wage register** | Telangana/AP daily-wage labour reconciliation is the first thing a thekedar checks. |
| 3 | **Materials in/out + PO + GRN** | Even Basic needs cement-bag logging. Withhold POs to Pro is fine; withhold stock log is not. |
| 4 | **Telugu + Hindi UI** | Brand expectation for a Hyderabad-origin product. Cost = translation file once. |
| 5 | **WhatsApp share (outbound, manual)** | Owners forward DPR to investor / spouse from their phone. Even if editing UX is in the app, share button is non-negotiable. |

A sixth strong candidate: **petty cash / site imprest log** — Powerplay names it; site supervisors handle ₹5k–50k cash daily without it leaking.

---

## 7. India-specific positioning (where SiteTrack can win)

These features map to specific plan tiers as a *strategic* — not just functional — choice:

| Lever | Suggested tier | Rationale |
|---|---|---|
| **Telugu + Hindi UI** | Basic | Brand promise. Founder is Telugu-speaking. No Bangalore competitor will out-localize you on Telugu. |
| **Outbound WhatsApp DPR push** | Basic | **The single strongest moat.** Powerplay + Onsite both position *against* WhatsApp. SiteTrack flipping this — "we send your client a branded WhatsApp DPR at 7pm daily" — is a 30-second sales pitch that wins. Cost: ~₹0.10–0.40/message via WhatsApp Business API. <₹100/customer/month. Removes Powerplay's entire moat. |
| **Vendor portal (basic)** | Pro (not Business) | Currently positioned as top-tier across the market. A read-only vendor portal where suppliers see open POs is cheap to build and immediately reduces builder reconciliation pain. Giving it at Pro is a differentiator. |
| **RERA QPR export (1 state: TG + AP)** | Pro | Specialist RERA tools (RECOS, ReraDesk) cover this for ₹50k–2L extra. Bundling for AP/TG into Pro = Hyderabad-local wedge. |
| **Multi-state RERA filing (5+ states)** | Business | Legitimately heavy work; legitimately top-tier. Powerplay + Onsite both leave this gap. |
| **GST input-tax-credit reconciliation on POs** | Pro | Builders lose 1–2% margin on missed ITC. Tying PO → vendor GSTR-2B match = clear money-saving Pro hook. |
| **EPF/ESI register from attendance** | Pro | Once labour count crosses 10/20, statutory contribution kicks in. Onsite Business+ has payroll; SiteTrack should match at Pro. |
| **BuildNow Telangana / TS-bPASS integration** | Business | Niche but high-value for TG developers. Could be a "Telangana edition" SKU. |

---

## 8. Strategic recommendations

### 8a. Raise Basic project cap from 3 → 5
The 3-project cap is the **single weakest part of current Basic**. A small builder routinely has: 1 ongoing site + 1 about-to-start + 1 in defect-liability period + occasional renovation = 4. Hitting the cap in month 2 creates a bad upgrade-or-churn moment. **Recommend raise to 5 active (or 5 active + unlimited archived)** — same price, removes false ceiling, forces Pro upgrade on a real workflow need (procurement, approvals) not arbitrary cap.

### 8b. Storage caps must be usable
Current Basic `storage_gb = 1` is **unusable** (one drawing PDF can be 30 MB). Recommend Basic 5 GB / Pro 50 GB / Business 250 GB. This *does* count toward Supabase storage cost — at June 2027 free tier the math works at 10 paying Basic customers but breaks at 100; revisit post-pilot.

### 8c. Add a fourth tier: Enterprise (talk to sales)
Today Business does both mid-market AND enterprise jobs, which compresses your ARPU ceiling. A 50-cr developer walking in expects white-label, SSO, dedicated CSM — Business doesn't include these, so you lose the deal or undercharge. Add **Enterprise — Custom (talk to sales)** as a 4th tier on the marketing page, even if invisible until first inbound. The DB plans table already supports `custom` + `enterprise`.

### 8d. Soft fair-use clause for "unlimited"
"Unlimited projects" with hard ceilings is honest engineering but bad marketing. Soften: *"Unlimited projects (subject to fair use; >50 active projects on Pro triggers a check-in")*. Gives you optionality without killing the headline.

### 8e. Don't gate Drawings + RFIs at Business (the market doesn't)
International tools (Fieldwire, ACC) own the drawings + RFI segment but **no Indian competitor leads with this** — verified weak demand among Hyderabad/Bangalore mid-market builders. Recommend Drawings + RFIs land at **Pro**, NOT Business. Saves the Business gate for genuinely Business-tier features (audit, custom roles, automation).

### 8f. Don't undersell at Business
SiteTrack Business at ₹1,99,990/yr supporting 100 users = ₹2,000/user/yr — **1/6th** the price of Onsite Business+ (₹15,000/user/yr). This is either a winning differentiator or a margin trap depending on support cost. Two safeguards:
- Keep flat-bundle 100-user Business as **sticker** (good for sales pitch).
- Add the soft fair-use clause.
- Push 50-cr developers to Enterprise (see §8c).

---

## 9. What to write on the pricing page (final copy)

Once gating is implemented (`PLAN_GATING_IMPLEMENTATION.md`), update `src/features/marketing/plans.ts` feature bullets to:

### Basic (₹5,999/mo)
- Up to 5 team members, 5 active projects
- Mobile DPR with voice + photos + offline
- Materials, attendance, labour register
- WhatsApp share buttons (manual)
- Telugu + Hindi UI
- 5 GB storage
- Community support (forum + docs)

### Pro (₹11,999/mo) ⭐
- Up to 20 members, unlimited projects (fair-use 50)
- Everything in Basic, plus:
- Finance: POs, invoices, RA bills, expense approvals
- Approval chains + delegations + templates
- Drawings (upload/release/markup) + RFI + Change Orders
- Hierarchy (Block / Floor / Unit)
- Compliance dashboard (RERA / GST / EPFO read checks)
- Estimate + Gantt + eSignature
- 30-day audit log read
- 50 GB storage
- Email support (next business day)

### Business (₹19,999/mo)
- Up to 100 members, unlimited projects (fair-use 200)
- Everything in Pro, plus:
- **Custom roles + capability overrides**
- **Org-wide audit log** (unlimited history + CSV export)
- **Automated WhatsApp DPR** (6pm to client)
- **WhatsApp programmatic send** + Cashfree payments
- RERA / GSTN / EPFO filing *(rolling out)*
- 250 GB storage
- **Priority support** (4-hour response SLA)

### Enterprise (Contact us)
- Unlimited users + projects + storage
- SSO + directory sync
- White-label client portal + custom domain
- API access + custom integrations
- Dedicated CSM + quarterly business review
- On-prem audit log mirror option

---

## 10. Outstanding decisions

These 10 questions are detailed with rationale in [`PLAN_GATING_IMPLEMENTATION.md §5`](./PLAN_GATING_IMPLEMENTATION.md#5-open-decisions-for-the-founder). Don't start coding gates until they're answered:

1. Audit log retention — Pro vs Business split (proposal: Pro 30-day, Business unlimited)
2. WhatsApp manual share — Basic or Pro?
3. RERA filing tier — Business confirmed?
4. "Unlimited" hard ceilings — Pro 50, Business 200?
5. Storage caps — 5 / 50 / 250 GB?
6. Custom roles — only Business, or Pro gets 2?
7. Storage overage UX — refuse / upsell / pay-per-GB?
8. Enterprise tier — exposed now or invisible?
9. Stub features in marketing — hide all, or "Coming soon" labels?
10. Grandfather demo orgs (org1/2/3) or apply gates uniformly?
