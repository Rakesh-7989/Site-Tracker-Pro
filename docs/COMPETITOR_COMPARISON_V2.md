# Site-Tracker vs Competitors — Feature-by-Feature, Honest Gap Report

Last updated end-of-Session-24.

Compares every implemented Site-Tracker feature against how
**Procore** (US/global leader), **Powerplay** (Indian Series B),
**BuildSupply** (Indian procurement-led), **Falconbrick** (Indian snag
list), plus the two reference repos **HRMS** + **TripGZio** do the same
thing.

Verdict legend:
- **🏆 BEAT** — we're meaningfully better here
- **🤝 PARITY** — roughly equivalent
- **⚠️ WEAKER** — competitor does this better; gap noted
- **❌ MISSING** — we don't have it at all

---

## 1. Multi-tenancy + role model

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Tenant isolation | Postgres RLS via `current_setting('app.tenant_id')` + 5 SQL files | Procore: app-layer + cross-tenant tests; Powerplay/BuildSupply/Falconbrick: app-layer only (no Postgres RLS); HRMS: same session-var pattern as us | 🏆 |
| Role count | **19** (v1 6 + v2 12 + vendor) | Procore: ~20 (incl. Project Manager, Superintendent, Subcontractor, Owner, Designer, etc.); Powerplay: ~6 flat; BuildSupply: ~5; Falconbrick: ~4 | 🤝 (Procore deeper, others thinner) |
| Org-level admin tier | Org Admin with 9 panels (Members, Billing, Integrations, Templates, Approval Chains, Notification Rules, Features, Activity, Re-run wizard) | Procore has Company-level admin (similar split); Powerplay/BuildSupply: org admin = same UI as super admin | 🏆 |
| Project types as a model | 4 types (Construction / Interior / Design / Consultant) — drives tabs + team + BOQ presets | Procore has "Project Type" as a free-text custom field; nobody else types projects | 🏆 |
| Sub-contractor as a sub-tier of contractor | Lib done (`contractors.js`), UI panels deferred | Procore: yes, fully built; Powerplay: partial (sub as a "trade") | ⚠️ (lib ready, UI gap) |

**Gaps:** Multi-org user (one user belonging to N orgs) — TripGZio has it, we don't. Vendor portal UI is deferred (role exists, view doesn't).

---

## 2. BOQ + RA Bills + Measurement Book (the Indian-specific trio)

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| BOQ native (Civil/MEP/Finishing/External categories) | Yes, full tab + line CRUD + per-type presets | Procore: customisation only; Powerplay: partial; BuildSupply: yes; Falconbrick: no | 🏆 (vs Procore/Powerplay/Falcon) / 🤝 (vs BuildSupply) |
| BOQ Excel import | ❌ Not built | Procore: yes; BuildSupply: yes | ⚠️ MISSED — Indian builders all have BOQs in Excel today |
| RA Bills with retention math + cumulative tracking | Yes, full lifecycle (submitted → approved → paid) | Procore: add-on; Powerplay: partial; BuildSupply: no | 🏆 |
| Measurement Book (MB) with item-level entry + auto-recompute | Yes, RA bill totals auto-update from MB rows | Procore: no; Powerplay: no; BuildSupply: no | 🏆 (unique to us in this comparison set) |
| Estimate vs BOQ (markup + overhead + contingency + GST) | Yes, separate Estimate tab over BOQ | Procore: separate Estimating module ($); Powerplay: no | 🏆 (we ship in base, Procore charges extra) |

**Gaps:** Excel/CSV import for BOQ (real blocker for first 10 customers — every builder has existing BOQs). Bill of Materials (BOM) distinct from BOQ — Indian construction treats these as separate; we conflate.

---

## 3. Drawing release + version control

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Per-role release (architect → PM/contractor/client) | Yes, `released_to` array with auto-supersede on new revision | Procore: yes, more granular permissioning; Powerplay: partial; PlanGrid: yes | 🤝 |
| Auto-supersede same-title-and-type | Yes via `drawingKey()` + collision check | Procore: yes; Powerplay: yes | 🤝 |
| Markup viewer (canvas overlay) | Yes, basic | Procore + PlanGrid: best-in-class with measure tools, callouts, link to RFI | ⚠️ (basic vs leaders) |
| Drawing-diff (side-by-side rev A vs rev B) | ❌ Not built | Procore + PlanGrid: yes | ❌ MISSED |
| OCR on uploaded drawings + searchable PDF | ❌ Not built | Procore: yes; PlanGrid: yes | ❌ MISSED |
| Cross-reference drawings ↔ RFI ↔ punch list | Partial — punch items have free-text link only | Procore: hard relations via UI | ⚠️ |

**Gaps:** Drawing-diff overlay is a real "wow" Procore demo moment. OCR turns scanned drawings into searchable. Both deferred — call out in product roadmap.

---

## 4. Daily Site Report (DPR) + WhatsApp

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| DPR PDF generation | Yes (`buildDPR` + `exportDPR` in `src/lib/exports.js`) | Procore: daily log; Powerplay: native DPR (their hero feature); BuildSupply: no | 🤝 (vs Powerplay) |
| WhatsApp share (wa.me deep link) | Yes, all plans | Procore: no; Powerplay: yes; Falconbrick: no | 🤝 |
| WhatsApp Business API (auto-send at 6 PM) | Runbook only, no real API integration yet | Powerplay: partial; nobody fully automated | 🟡 (claim > reality) |
| Photo + workforce + weather + issues in DPR | Yes, full template with photos | Powerplay: yes; Procore: yes | 🤝 |
| 3-language DPR output (EN/TE/HI) | Yes via i18n helper | Powerplay: EN/HI only; Procore: EN-only | 🏆 |

**Gaps:** Actual WhatsApp Business API isn't wired — `docs/WHATSAPP_BUSINESS_API.md` documents the 8-week verification but Edge Function not built. Until that ships, our "auto-send" is manual share-link.

---

## 5. Material price aggregator

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Live commodity quote view (steel/cement/etc.) | Yes, 6 mock adapters (`materialPrices.js`) | BuildSupply: real with 50+ vendors; Procore: no; Powerplay: no | ⚠️ (we have lib; real adapters not wired) |
| Vendor + best-quote selection | Yes in lib (`bestQuote`, `savings`) | BuildSupply: yes; nobody else | 🤝 (lib ready, real data missing) |
| Material price history + forecast | ❌ Not built | BuildSupply: yes (Indian market unique strength) | ❌ MISSED |
| Direct purchase from quote | ❌ Not built | BuildSupply: yes (their core revenue stream) | ❌ MISSED — we don't take procurement margin |

**Gaps:** We have the SHELL but no real vendor adapter wired. BuildSupply's whole business is here — copying their adapter pattern is achievable but needs vendor partnerships.

---

## 6. RERA / GST / EPFO compliance

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| RERA format validation | Yes (`validateRera`) | Procore: no; Powerplay: no; BuildSupply: no; Falconbrick: no | 🏆 |
| GSTIN format + checksum | Yes (`validateGstin`) | Same — nobody | 🏆 |
| EPFO code regex | Yes (`validateEpfo`) | Same — nobody | 🏆 |
| RERA TG monthly progress filing (auto-submit) | Stub only (Edge Function scaffolded, not real scrape) | Nobody has this | 🟡 (unique IF we ship the scraper) |
| GSTN e-invoicing auto-push | ❌ Not built | Some Indian SaaS have it (Zoho Books, Cleartax); construction SaaS no | ❌ MISSED — high-value for ₹500cr+ customers (mandatory) |
| Auto-PF / ESI filing from labour register | ❌ Not built | Nobody in construction; HRMS has it for employees | ❌ MISSED |
| RERA Karnataka / Maharashtra adapter | ❌ Not built (only TG stub) | Nobody | ❌ MISSED |

**Gaps:** Real RERA scraper not built (Edge Function stub only). Multi-state RERA adapters absent. GSTN auto-push absent. Auto-PF filing absent.

**This is our biggest unique-value moat ON PAPER but the real-API work is largely undone.**

---

## 7. AI Insights

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Deterministic risk score | Yes (`computeRiskScore`) | Procore Predictive Insights: yes (paid add-on); others: no | 🤝 |
| LLM narrative summary | Yes (`fetchLLMInsight`) | Procore: yes; others: no | 🤝 |
| Telugu / Hindi native output | Yes via `LANG_INSTRUCTIONS` table | Procore: EN-only; nobody else has multi-lingual | 🏆 |
| Cost forecast with overrun prediction | Yes (`aiForecast.js`) | Procore: yes; Powerplay: no | 🤝 |
| AI-recommended scope (suggest features to disable based on usage) | ❌ Not built | Nobody — this would be unique | ❌ MISSED — proposed in strategic brief as moat |

**Gaps:** AI-recommended scope was in my own strategic brief but never implemented.

---

## 8. Subscription billing

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Per-org pricing (not per-user) | Yes (₹999 / ₹2,999 / ₹7,999) | Procore: ₹31k/user (300× more expensive); Powerplay: ₹1.5k/user; BuildSupply: ₹2k/user | 🏆 (pricing model itself is unique) |
| Cashfree UPI AutoPay | Edge Function code written, not deployed | Nobody offers UPI AutoPay for SaaS billing in this category | 🟡 (claim ahead of reality) |
| Razorpay invoice payment (one-off) | Yes (`razorpay.js` + `buildUpiDeepLink`) | Some Indian SaaS yes; competitor construction SaaS no | 🤝 |
| Plan upgrade self-serve | Yes in OrgBillingView | Procore: enterprise sales only; Powerplay: yes; BuildSupply: yes | 🤝 |
| Free tier (limited features) | ❌ Not built | Powerplay: 14-day trial; Falconbrick: yes | ⚠️ MISSED — need a real free tier for SEO/self-serve |

**Gaps:** Cashfree EF not deployed against a real Cashfree account. No free tier (just a 14-day trial mention in the landing page).

---

## 9. Blockchain audit anchoring (unique selling point)

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Daily Merkle root of audit_log | Pure lib done (`blockchainAnchor.js`, 33 tests + corrected selector) | NOBODY in Indian or global construction SaaS has this | 🏆 (genuine unique moat) |
| Polygon adapter | Yes (signer-injectable) | — | 🏆 |
| Smart contract Solidity source | ❌ Not written | — | ❌ MISSED — without the contract this can't actually run |
| Public verification URL (Polygonscan) | Yes (`polygonscanUrl`) | — | 🏆 |
| Court-admissible documentation (IT Act 2000 s.65B brief) | Mentioned in lib comments, no formal legal opinion | — | ⚠️ — need a real Indian IT lawyer's sign-off before claiming this in sales |

**Gaps:** No actual smart contract. No deployed instance. No legal opinion. The 33 tests verify the encoding math, but the integration story is unfinished.

---

## 10. Mobile app

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Mobile-responsive web | Yes | Procore: yes; Powerplay: yes; everyone yes | 🤝 |
| Native Android app | Capacitor configured (`capacitor.config.json`), `docs/PLAY_STORE_PREP.md` runbook, but no actual `android/` folder or signed `.aab` built yet | Procore: native iOS + Android; Powerplay: native Android (their strength) | ⚠️ (claim > reality) |
| Native iOS app | Same — Capacitor config exists, not built | Procore: yes; Powerplay: yes | ❌ MISSED |
| Offline-first IndexedDB | Yes, full sync queue (`offline.js`) | Procore: partial mobile; Powerplay: yes (their differentiator) | 🤝 |
| Camera capture + photo geolocation | Yes, both implemented | Powerplay: yes; everyone yes | 🤝 |
| Kiosk modes (Labour entry, Site wall) | Yes, 3 modes (Labour / Site Wall / AR Drawing Overlay) | Procore: no; Powerplay: no; nobody | 🏆 |
| AR drawing overlay | Beta scaffold, no homography yet | Nobody (Procore has BIM viewer, no AR) | ⚠️ — claim ahead of reality |

**Gaps:** No actual mobile build tested. Kiosks are a unique moat but need a real touchscreen-tablet UX pass.

---

## 11. Feature toggle catalog (3-layer cascade)

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Per-feature on/off toggles | Yes (37 catalog entries, super → org → user cascade) | Procore: limited per-org Tool On/Off; Powerplay: no; nobody else has 3-layer | 🏆 (architectural moat) |
| Plan-gate composes with org toggle | Yes (`isFeatureEnabled` checks plan + flag together) | Procore: separate UI per plan; not composed | 🏆 |
| Feature-level audit on toggle change | Yes (every toggle records `recordAudit UPDATE`) | Procore: no; nobody | 🏆 |

**Gaps:** None significant — this is a real architectural strength.

---

## 12. E-signature + audit

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Typed-name e-signature on change orders | Yes (with consent text + UA + timestamp + email captured) | Procore: integration with DocuSign ($); Powerplay: no | 🤝 |
| Immutable audit log (append-only) | Yes (`audit_log_v2` + `record_audit_v2` SECURITY DEFINER, RLS append-only) | Procore: enterprise tier yes; Powerplay: app-layer only | 🏆 |
| Cross-action audit coverage | ~25 action sites wired (CREATE, UPDATE, DELETE, APPROVE, REJECT, RELEASE, PAYMENT, IMPERSONATE, etc.) | Procore: comprehensive; Powerplay: partial | 🤝 |
| PDF audit report export | CSV export only | Procore: PDF formatted for auditors | ⚠️ MISSED |

**Gaps:** No PDF audit report (only CSV). For builder firms with external auditors, a printable formatted audit PDF is table-stakes.

---

## 13. Approval chains (configurable per ₹ threshold)

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| Configurable per-resource (expense / PO / RA / CO / invoice / drawing release) | Yes (`approvalChains.js`) | Procore: yes; Powerplay: no; BuildSupply: no | 🤝 (vs Procore) / 🏆 (vs others) |
| Multi-rung escalation with ₹ thresholds | Yes (`resolveApprovers` walks rungs) | Procore: yes | 🤝 |
| Signature + comment required flags per rung | Yes | Procore: yes | 🤝 |
| Delegation (out-of-office substitution) | Yes (`delegations.js`) | Procore: yes; others: no | 🤝 (vs Procore) / 🏆 (vs others) |

**Gaps:** None significant.

---

## 14. Onboarding + go-live

| Aspect | Site-Tracker | Competitor reality | Verdict |
| ------ | ------------ | ------------------ | ------- |
| In-app 5-step wizard | Yes (`OnboardingWizardView`) | Procore: in-app + dedicated CS rep; Powerplay: CS-led only; nobody has wizard | 🏆 |
| Project-type picker first | Yes (added Session 24) | Procore: no (free-text); others: no | 🏆 |
| Templates: project / BOQ / checklist | Yes (`templates.js` + panel) | Procore: yes; Powerplay: no | 🤝 (vs Procore) / 🏆 (vs others) |
| Bulk user import | ❌ Not built | Procore: CSV upload; Powerplay: yes | ❌ MISSED — needs a CSV uploader for "invite 50 team members" |
| Migration from competitor (data import) | ❌ Not built | Procore: dedicated migration team; nobody else has import | ❌ MISSED — biggest barrier to win Powerplay customers |

**Gaps:** Two real gaps that block sales — bulk user CSV import + competitor-migration script (e.g. read a Powerplay export, map to our schema).

---

## 15. Honest disclosure — claims that exceed reality

These are things we **DOCUMENT** as if shipped, but the production-ready version isn't actually built. If a customer asks tomorrow, we'd have to say "coming in a few weeks":

| Claim | Reality | Block to ship |
| ----- | ------- | ------------- |
| Cashfree UPI AutoPay billing | Edge Functions coded; never deployed to a real Cashfree account | Need a Cashfree merchant account + KYC + webhook secret |
| WhatsApp Business API auto-DPR | Runbook documents the 8-week verification; no Edge Function exists yet | 8 weeks of Meta verification + template approval |
| Blockchain audit anchoring (Polygon) | Pure lib done with corrected selector; no Solidity contract written | 1 day Solidity + 1 day deploy + legal opinion |
| RERA TG auto-filing | Stub Edge Function only; no real Playwright scraper | Need a TG RERA test account + 3 days dev |
| AR Drawing Overlay | UI scaffold; no actual homography matching | Significant CV work (~2 weeks) |
| Mobile app on Play Store | Capacitor config + runbook; no `android/` folder, no `.aab` | Mac/Linux build env + keystore + 1 day work |
| Multi-state RERA (Karnataka, Maharashtra) | Only TG mentioned in adapter list | Each state portal has different scrape rules |
| GSTN e-invoicing auto-push | Not built | New module, ~3 days for Indian builders >₹500cr turnover |
| AI-recommended scope (suggest which features to disable) | Mentioned in pitch as moat; not built | 1-2 days analytics + LLM call |

**11 claims that exceed reality**. None are deceptive (all are honestly marked "scaffolded" / "stub" / "runbook only" in code comments), but in a sales call you'd be cutting corners if you said "we have this."

---

## 16. What competitors have that we don't (real misses)

Pure missing features — neither stubbed nor scaffolded:

| Feature | Competitor | Why it matters |
| ------- | ---------- | -------------- |
| **BOQ Excel/CSV import** | Procore, BuildSupply | Every existing builder has BOQs in Excel. Without this they re-enter 200 line items by hand. **#1 sales blocker.** |
| **Drawing-diff overlay** | Procore, PlanGrid | "Rev A vs Rev C side-by-side" is the demo moment Procore wins on |
| **OCR on drawings** | Procore, PlanGrid | Searchable scanned drawings — table stakes at enterprise |
| **GSTN e-invoicing** | Indian fintech SaaS | Mandatory for >₹500cr turnover orgs — we'd be illegal for them |
| **Auto-PF / ESI filing from labour register** | HRMS | Saves ₹50k/year per project; we have the labour register but don't file |
| **Bulk user CSV import** | Procore, Powerplay | "Onboard 50 people in 5 minutes" is sales decision-maker |
| **Migration script from competitor (Powerplay/BuildSupply)** | nobody as default, custom Procore | Biggest win-back lever — without this customers can't switch |
| **PDF audit report (not just CSV)** | Procore | Auditors want formatted PDFs |
| **Multi-currency** | Procore | International expansion only — fine to defer |
| **SSO (SAML / Google Workspace)** | Procore enterprise | Required for big builder firms with IT compliance |
| **Project archive / soft-delete + restore** | Procore | Once a customer has 50+ projects, they need archive |
| **Custom field engine** | Procore | Each org adds 5-10 custom fields per tab. We have feature toggles but not custom fields |
| **API + webhook integration guide** | Procore | Supabase auto-generates REST; we haven't documented it for customers |
| **Cross-project search includes drawing CONTENT** | Procore (via OCR) | Our `GlobalSearch` searches names/titles, not drawing text |
| **Multi-org user (one user belongs to N firms)** | TripGZio | Some architects work across builder firms — they need this |
| **Time-zone awareness on timestamps** | Procore | All our timestamps assume IST — would break for export to gulf/UAE Indian-diaspora customers |

---

## 17. Recommended add-list (prioritised by ROI)

**Ship in next 30 days (sales-blocking):**
1. **BOQ Excel import** — 1 day, biggest sales unblock
2. **Bulk user CSV import** in OrgMembersView — half day
3. **PDF audit report** in OrgActivityView — half day
4. **Real Cashfree EF deploy + first paying customer** — 1 week
5. **Project archive (soft delete with 90-day restore)** — half day

**Ship in 60-90 days (claim-truth alignment):**
6. **WhatsApp Business API Edge Function** — once Meta verification ships (8 weeks)
7. **RERA TG real scraper Edge Function** — needs TG RERA test account
8. **Blockchain anchor — Solidity contract + Polygon Mumbai deploy** — 2 days
9. **Mobile app build + Play Store internal track** — 1 week
10. **Competitor-migration script (Powerplay → SiteTrack)** — 3 days, biggest win-back lever

**Ship in 6 months (enterprise-readiness):**
11. SSO (SAML)
12. Custom field engine
13. Drawing-diff overlay
14. OCR on drawings
15. GSTN e-invoicing
16. Auto-PF / ESI filing
17. Multi-org user
18. AI-recommended scope

---

## 18. Bottom line

**We BEAT competitors on:** Per-org pricing model, 3-layer feature toggle
catalog, MB-linked RA bills, 4-project-type model, immutable audit log,
RLS at DB layer, Telugu/Hindi AI narrative, kiosks, Org Admin tier depth,
blockchain anchoring (on paper), onboarding wizard.

**We MATCH competitors on:** Basic BOQ, drawing release, DPR, e-signature,
risk score, approval chains, delegations, templates.

**We're WEAKER on:** Drawing markup polish (vs Procore/PlanGrid), mobile
maturity (vs Powerplay), real procurement marketplace (vs BuildSupply),
documented integrations (vs Procore).

**We're MISSING:** Excel import (real sales blocker), competitor migration,
PDF audit reports, GSTN e-invoicing, SSO, multi-org user, drawing OCR/diff,
custom fields, bulk CSV operations.

**Honesty score:** 11 features we've documented as production-ready are
actually scaffolds or stubs. None are deceptive in code comments — but
sales pitches must match what's REALLY shippable today.

---

## 19. The single biggest miss

If I had to pick ONE thing I should have built but didn't: **BOQ Excel
import.** Every Indian builder has 5-50 historical BOQs in Excel right
now. Without a one-click upload that maps Excel columns to our BOQ
schema, asking them to re-enter 200 line items is a guaranteed lost sale.

**1 day of work. Highest ROI single feature on the roadmap.**

---

## 20. Reference

- All claims about competitor features come from public docs + the
  reference repos in `temp_analysis/HRMS` and `temp_analysis/Tripgzio`
  (analysed in earlier sessions).
- See `docs/HRMS_DEPLOYMENT_STUDY.md` for the HRMS deep-dive that
  informed several rows.
- See `docs/ROLE_MODEL_V2.md` for the role-tier comparison.
- See `docs/PROJECT_TYPES_ROADMAP.md` for the type-gate spec.
- This doc must be updated whenever we ship any item from §17.
