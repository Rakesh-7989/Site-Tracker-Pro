# Competitor Deep-Dive — SiteTrackPRO (UK) vs Site-Tracker-Pro

> Date: 2026-09-06 · Author: founder deep-dive (ChatGPT-assisted) + SDE review
> Competitor official product domain: **`https://www.sitetrackpro.co.uk`** — ⚠️
> NOT `sitetrackpro.co`. Verified via App Store (`co.uk.sitetrackpro.sitetrackpro`),
> the .=0.uk site itself, customer subdomains, App Store listings, LinkedIn, and
> public hiring postings. Any future reference to this competitor must use `.co.uk`.
> Source refs: see the link list at the bottom of this file (originally pasted with
> `[1]`-`[8]` anchor links).

---

## 1. What SiteTrackPRO actually is

Reading SiteTrackPRO as generic "construction project management software" is
**wrong positioning**. They attack one very specific problem:

> Eliminate the chaos between a construction **subcontractor's office** and its
> **site team** — wages, work booking, QA, variations, documents, profitability.

Official-site central workflow ([1]): price work · day work · wage processing ·
QA · variations · documents · profitability · invoicing · handovers ·
notifications — all one connected chain.

**Their real wedge = subcontractor operations**, not a small Procore.

## 2. Their strongest insight

They don't market features. They market **the daily pain in the customer's
business**:

- double bookings
- missing photos
- chasing timesheets
- chasing invoices
- forgotten variations
- invisible profitability

Then the solution chain ([2]): mandatory photos · GPS clock-in · automatic
invoices · variation capture · QA sheets · drawing read receipts ·
profitability visibility.

**Marketing formula:** Pain → Financial consequence → Product workflow →
Proof → CTA.

## 3. Product architecture evidence

Tech stack is not publicly disclosed (do not guess React/.NET/etc.). Public
footprint shows a **customer-subdomain application model**:

- `dockerill.sitetrackpro.co.uk` (named customer environment)
- `test.sitetrackpro.co.uk`, `sd.sitetrackpro.co.uk` (dev/test)

A customer subdomain does **not** prove per-customer database/deployment — it
could be shared SaaS with tenant domains or per-customer instances.

**Mobile is the most revealing signal.** iOS 1.5.30 + Android (July 2026 update)
show tiny, steady additions ([4]): QA sheets, timesheet approval, variation
grouping by plot, notifications, multiple images, PDF improvements, UX/stability
fixes. Lesson for us:

> **Big-bang rewrite ≠ their model. Their model = customer workflow → feature →
> release → feedback → next feature.**

## 4. Their release cadence (App Store history)

2025-06 QA sheets + timesheet approval + images during approval · 2025-07
multiple approval info + document ordering + PDF improvements · 2025-08 QA sheet
creation + QA/approval workflows · 2025-09 variation grouping by plot ·
2025-10 user-active status + notifications · 2026+ UX/perf/handover
improvements. **Core workflow first → customers → feedback → micro-feature →
release.**

## 5. Their killer workflow chains

```
SITE → Worker/Supervisor → Book Work → Photo/QA → Supervisor Approval
     → Wage Calculation → Invoice → Payment → Profitability

SITE → Variation → Photo + Notes → Approval → Invoice → Revenue

Drawing/RAMS/Toolbox Talk → Upload → Team access → Read receipt → Auditability
```

The moat is **not individual features** — it is the **connected operational
chain**.

## 6. QA sheets weaponized

QA is not a standalone checklist; it gates **payment / approval / handover**:
operative booking → supervisor approval → automatic email → live tracker → site
agent visibility ([2]).

> **QA = Revenue + Reputation + Compliance + Payment.**

## 7. Emotional strategy — 5 layers

1. **Stress** — verbalize daily frustration: "Where's that invoice? Which site?
   Which plot? Double booked?" ([2])
2. **Time** — customer stories put numbers on it: wage/progress checking *"several
   hours → ~30 minutes"* ([5]); wage processing *"days → hours"* ([4]). Time →
   business freedom.
3. **Money** — missed variations, wrong wages, overbooking, profitability, cash
   flow, getting paid. (Their "up to +8% bottom line" claim is a company claim,
   not an independently verified result.)
4. **Reputation** — *"become the subcontractor site managers want to work with"*:
   professional QA, clean handovers, fewer snags, repeat work. Identity-based
   selling.
5. **Personal life** — hours back for other business tasks *or family* ([6]);
   founder/team content is human (holidays, jokes, site visits).

**Ladder:** Less paperwork → less stress → more time → more money → better
reputation → better life.

## 8. Marketing strategy

- **LinkedIn-first** (~3,100 followers, regular posts) with **industry-native
  content**: weird handwritten invoices, cigarette packets, plasterboard, van
  windows, "where's this plot?" chaos ([2]).
- **Humour** — construction slang + jokes so field workers feel understood, not
  sold to.
- **Customer advocacy** — customers say *"wish we'd done this sooner, super easy,
  support superb, wouldn't live without it"* ([2]); LinkedIn comment threads
  become mini-sales channels ([7]).

## 9. Referral loop (very smart)

> Employee uses SiteTrackPRO → changes company → "I used this before" → new
> employer becomes lead → demo → customer.

A **product-led referral network** inside a human-led sales process.

## 10. Sales & implementation model

**Not self-serve.** Website pushes "Book a Demo"; pricing = **£2/user/week**, no
contract, free trial, training/onboarding, flexible user counts ([1]). The BD/AM
role explicitly runs Lead → Qualify → Demo → Free trial → Follow-up → Convert →
Onboard → Train → Account-manage → Expand/Refer ([8]).

They sell **software + implementation + training + support + process change** —
customer success is part of the commercial role.

## 11. Their offline weakness = our opportunity

An App Store review explicitly asks for offline clock-in/out without signal
([4]). Even a mature product has field-connectivity pain. Our **offline/PWA +
offline queue** already heads this direction — a real differentiator for Indian
sites.

## 12. So what for Site-Tracker-Pro

Our repo is **much broader** (Projects, Drawings, Issues, RFI, Change Orders,
Inspections/QC, Materials, Vendors, BOQ, RA Bills, Invoices, Labour, Budget,
Safety, DPR, Analytics, WhatsApp, Telugu/Hindi/English, PWA, RBAC, plan gating,
offline) and already competes alongside Procore, Autodesk, Fieldwire, Raken,
Powerplay, RDash, Onsite.

**The problem is not "not enough features."** It is:

> **Too many features without one unforgettable product story.**

We must not become "Indian SiteTrackPRO." Instead:
**SiteTrackPRO's operational simplicity + our India-specific construction OS**
(GST, TDS, RERA, EPF/ESI, Telugu/Hindi, WhatsApp, RA bills, Indian workflows).

## 13. Nine principles to grab

1. **One primary customer pain** — lead with *"Stop running your construction
   projects through WhatsApp, Excel and scattered photos."*
2. **Feature → Outcome** — DPR = "daily site proof without chasing your engineer";
   RA Bills = "know exactly what work was completed, measured and billed";
   Drawing revisions = "your site team always works from the latest drawing";
   Material ledger = "know where every rupee went."
3. **"Proof of Work" engine** — every site action yields WHO + WHAT + WHEN +
   WHERE + PHOTO + DOCUMENT + APPROVAL + MONEY IMPACT (e.g. Block B / Floor 4 /
   brickwork / Rakesh Kumar / 10:42 / GPS / 5 photos / QA passed / engineer
   approved / ₹82,500 measured / RA-bill eligible).
4. **Site action → money** — "Today ₹4.8L worth of work completed" instead of
   "27 activities completed."
5. **"Construction Memory"** — photos, drawings, decisions, approvals, RFIs,
   variations, measurements, invoices, material movements, safety events, DPRs.
   After 6 months the platform *is the memory of the project* — dispute-proof.
   *"Don't let your project history disappear into WhatsApp."*
6. **Owner peace of mind** — a "remote construction command center": 12 projects,
   3 need attention (red variation awaiting approval / amber attendance gap /
   amber unacknowledged drawing revision / green on schedule).
7. **WhatsApp as notification layer, not a competitor** — beautiful daily report →
   WhatsApp to client/owner/architect; SiteTrack-Pro stays system of record.
8. **SiteTrack Score (project health)** — 82/100 🟢 (schedule/cost/quality/
   labour/material/documentation/safety) + *"3 things need your attention
   today"*.
9. **Onboarding as product** — "Launch Your First Project": company → project →
   team → drawing → BOQ → labour/vendor → invite client → first DPR → first
   WhatsApp report → Live.

## 14. Repositioning

**Positioning:** *"Site-Tracker-Pro — your construction site, finally under
control."* Subline: *"Track work, people, materials, money and decisions — from
the site to the office, in one place."* Emotionally: *"Less chasing. Less
confusion. More proof. More control."*

**Homepage psychology:** Hero ("Your projects shouldn't live in WhatsApp") →
Pain ("Still managing sites like this? WhatsApp/Excel/calls/paper bills/scattered
photos/old drawings/missed variations") → Transformation ("One project. One
source of truth") → Before/After ("Did anyone send today's site photos? / Which
drawing is latest? … → Site-Tracker-Pro knows") → customer stories as
Problem→Implementation→Result, never generic testimonials.

## 15. Human marketing style (ours, not their words)

- Post 1: **"Sir, WhatsApp lo photo pampincha."** Which photo? Which floor?
  Which block? When? Who completed it? Was it approved? That's not project
  management — that's detective work. 🕵️ **Site-Tracker-Pro turns site activity
  into structured project proof.**
- Campaign: **"Where did the ₹10 lakh go?"** BOQ → Material → Labour → Variation
  → RA Bill — every rupee has a story; Site-Tracker-Pro records it.

## 16. Production strategy & architecture

Our repo architecture is ahead of a demo (React/Vite, Supabase, Postgres/RLS,
Edge Functions, Capacitor, Sentry, CI, staging/prod, offline queue, audit log,
Cashfree, WhatsApp, mobile packaging). **Don't add modules now — harden:**
AUTH → MULTI-TENANCY → RLS → STORAGE → AUDIT → OFFLINE SYNC → BACKUP →
MONITORING → BILLING → MOBILE → PRODUCTION.

**3-layer product architecture instead of 25 modules up front:**
- **TODAY** — "What needs my attention?" (overdue tasks, site updates, pending
  approvals, variations, payment/safety issues, drawing acknowledgements).
- **PROJECT** — "What's happening?" (progress, schedule, people, materials,
  quality, money, documents, communication).
- **RECORD** — "What exactly happened?" (person, timestamp, location, photo,
  document, comment, approval, financial impact, audit trail). **This layer is
  the deepest defensibility.**

## 17. Comparison table

| Area | SiteTrackPRO | Our opportunity |
|------|--------------|-----------------|
| Core ICP | UK subcontractors | Indian construction ecosystem |
| Main wedge | Wage/site operations | Full project/site control |
| Price work | ⭐⭐⭐⭐⭐ | Could add |
| Day work | ⭐⭐⭐⭐⭐ | Could add |
| QA | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Variations | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Documents | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| BOQ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| RA Bills | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| GST/TDS | ❌ / UK-centric | ⭐⭐⭐⭐⭐ |
| RERA | ❌ | ⭐⭐⭐⭐⭐ |
| Telugu/Hindi | ❌ | ⭐⭐⭐⭐⭐ |
| WhatsApp | Strong | Strong opportunity |
| Offline | User-requested gap | Major opportunity |
| Project management | Medium | Strong |
| Client portal | Medium | Strong |
| AI | Not central | Opportunity |
| India workflows | ❌ | **Core advantage** |

## 18. Strategic conclusion

The lesson is not "they have good features." It is:

> **They found a painful workflow and built an entire company around removing
> that pain.**

Their machine: Real construction problem → Simple workflow → Customer uses it →
Feedback → Feature improvement → Testimonial → LinkedIn content → Lead → Demo →
Trial → Onboarding → Customer → Referral → New customer. **Copy the business
system, not the UI / feature names / branding.**

## 19. What to do to Site-Tracker-Pro now

Freeze major new-feature development temporarily and:
1. **Reposition** — "construction management" → "construction control system."
2. **Simplify UX** — 20+ modules → Today / Projects / Work / Money / Documents /
   People / Reports.
3. **Build the Proof-of-Work engine** — Who+What+When+Where+Photo+Approval+Money
   on every important action.
4. **Build Project Health** — one score + 3 things needing attention.
5. **Build the India moat** — GST+TDS+RERA+RA Bills+WhatsApp+Telugu/Hindi+Indian
   contractor workflows (already largely present in repo).
6. **Build onboarding** — "Get your first project live in 15 minutes."
7. **Build customer proof** — every pilot = case study + testimonial + workflow
   story + referral.
8. **Build the sales machine** — LinkedIn pain content → free construction
   templates/tools → WhatsApp lead → demo → 15-day assisted pilot → onboarding →
   paid → customer success → referral.

**Bottom line:** do not rebuild from scratch. Layer a
**SiteTrackPRO-inspired strategy** on the existing `Rakesh-7989/Site-Tracker-Pro`
foundation:

> **SiteTrackPRO's simplicity + customer obsession + workflow depth + human
> marketing × our India-specific construction OS + compliance + WhatsApp +
> multilingual + project/financial depth.**

Executed well, Site-Tracker-Pro becomes **the operating system a small/medium
Indian builder opens every morning to know: what happened yesterday, what's
happening today, what is at risk, and where is my money.**

---

## Sources

1. SiteTrackPRO official website — https://www.sitetrackpro.co.uk
2. SiteTrackPRO LinkedIn — https://uk.linkedin.com/company/sitetrackpro
3. Customer env example — https://dockerill.sitetrackpro.co.uk
4. iOS App Store listing (v1.5.30; Android July 2026) — https://apps.apple.com/gb/app/sitetrackpro/id1513766396
5. Customer story (Euro Building & Maintenance / Ollie Emery) — https://uk.linkedin.com/in/ollie-emery-42919017b
6. Customer story (Stridden / Andy Emery) — https://uk.linkedin.com/in/andy-emery-52007866
7. Community recommendation thread (Max Willcox) — https://www.linkedin.com/posts/max-willcox.../activity-7462405317872488448-FOQR
8. BD/Account Manager role (SimplyHired) — https://www.simplyhired.co.uk/en-GB/job/YjdeoHXeBy9d-...