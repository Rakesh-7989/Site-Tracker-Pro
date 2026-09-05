# Response Plan — SiteTrackPRO (UK) Deep-Dive → Site-Tracker-Pro Actions

> Companion to `docs/research/SITETRACKPRO_UK_DEEPDIVE_2026-09.md` (§19).
> This is a **Product-Manager draft**: every row maps the deep-dive ask to what the
> repo ALREADY ships, marks the true gap, and proposes concrete scope + acceptance
> criteria. **Nothing here changes user-facing behavior until the Product Owner
> approves a row.** Status legend: 🟢 shipped · 🟡 partial / needs glue · ⬜ gap ·
> 🅱️ blocked on founder decision/provider.

Reference: [§19 — What to do to Site-Tracker-Pro now](/docs/research/SITETRACKPRO_UK_DEEPDIVE_2026-09.md)
| # | Deep-dive ask (UK) | Already in repo | True gap | Proposed scope (if approved) | PoC gate |
|---|---|---|---|---|---|
| 1 | **Reposition** "construction management" → "construction control system" | Marketing site copy is honest but feature-framed: `HomePage.tsx` hero = "Construction project software for Indian builders… Six modules, one project record". | No control/pain-first message. No "Your construction site, finally under control" framing. | Draft a pain-first hero + section copy (owner peace of mind, delay/wallet answers each morning), keep every claim shippable. No fabricated metrics. | tsc · eslint · build · e2e-mock · `prod:smoke` 3/3 |
| 2 | **Simplify UX** → Today / Projects / Work / Money / Documents / People / Reports | `nav-config.ts` already groups nav (Overview, Projects, Work, Finance, Procurement, People, Compliance, Insights…); tabs are per-module registers. | No single "Today — what happened yesterday / what's at risk / where's my money" spine; 20+ modules can overwhelm a new org. | (Big change — needs founder go) Add an org **Today** landing (daily spotlight: yesterday's DPRs, at-risk projects, this month's RA/invoice state, labour attendance) without removing module nav. | PoC gate above + UX audit viewport/no-overflow |
| 3 | **Proof-of-Work engine** (Who+What+When+Where+Photo+Doc+Approval+Money) | DPR = who/what/where/photo + approval chain; geotagged photos; delivery log; downloadable PDF; versioned records; RA/payment caps. | Not cohesively marketed as one engine; DPR ≠ approvals ≠ money on one screen. | No new build. Market it as the engine on the product page; optionally a per-project "Recently proven work" strip. | — (marketing-led) |
| 4 | **Project Health / SiteTrack Score** ("82/100 + 3 things need attention") | `RiskSignalsCard.tsx` renders a deterministic 0–100 score + level + per-signal list, fed by nightly `project_risk_signals` snapshot (migrations 225/226) with client fallback. Shown on Overview. | Framed as "Risk signals" (delay/over-run only), hidden inside a card; no explicit "3 things needing attention" summary; not a headline health score. | **Recommended next build.** Evolve RiskSignalsCard → "Project Health" with: score headline, top-3 actionable items ("3 things need attention"), sub-scores (schedule / cost / issues / documentation). Reuse existing snapshot data; no schema change required unless we persist a headline copy. | PoC gate + unit tests for the top-3 reducer |
| 5 | **India moat** (GST/TDS/RERA/RA bills/WhatsApp/Telugu/Hindi/contractor) | Already shipped: RA bills + retention, GST/TDS % invoices (mig 239), statutory register (RERA expiring 30d), WhatsApp digest (mig 233/234), voice DPR in Telugu/Hindi/English, EPF-ESI wages (mig 169), offline queue. | No single "Why India" landing story; WhatsApp chat delivery is dormant without Meta keys. | Marketing-led: an honest "Made for Indian sites" section. No build. | — |
| 6 | **Onboarding** "Get your first project live in 15 minutes" | `OnboardingView` progressive steps + "Load demo project" (`seed_demo_project` RPC, mig 227). | Onboarding is step-driven, not outcome-framed; no explicit 15-minute promise or "Launch your first project" CTA. | Copy pass: outcome-first labels + a "Get your first project live in 15 minutes" headline + demo-project accelerator. No flow change. | PoC gate |
| 7 | **Customer proof** (every pilot = case study + testimonial + workflow story + referral) | None public (deliberately — no fabricated customers). | First real pilot → canonical case study; testimonial; workflow story. | **Requires founder**: land the first pilot, then we publish an honest case study on /resources (pattern exists). Stay zero-invention. | — (founder) |
| 8 | **Sales machine** (LinkedIn pain content → free templates → WhatsApp lead → demo → 15-day pilot → paid) | Marketing pages exist; template → lead → pilot flow not built. | Outbound motion; free-tool lead magnet; WhatsApp lead capture. | **Requires founder**: content cadence + lead channel choice (email form vs WhatsApp). We can build a `/templates` resource + lead-capture form if approved. | — (founder) |

## Recommended order (lowest risk first, all draft-until-approved)

1. **R4 — Project Health.** Highest product leverage, ~zero new infra (snapshot + client fallback already live). Pure frontend + tests.
2. **R1 + R6 — Copy reposition + onboarding outcome-framing.** Marketing-only, keeps the no-fabrication rule.
3. **R2 — Today spine.** Larger UX change; needs founder go before scope is locked.
4. **R7/R8 — Pilot proof + sales machine.** Founder-led; agent drafts assets on approval.

## Decision log

| Date | Decision | Owner |
|------|----------|-------|
| 2026-09-06 | Deep-dive captured (`85588e7`); response plan drafted; **no row approved yet** — awaiting founder pick | PM Agent → Product Owner |

---

*Keep honest: every claim on a shipped surface must map to a real capability. See `docs/AGENTS.md` boundary rules (Product Manager Agent: drafts scope/ACs; Product Owner approves committed scope).*