# Powerplay Reconnaissance — Interview Script
*Sprint 1, Day 1–5 · Session 30.2*

## Why this script exists

The deep-research workflow (June 2026) verified Powerplay's pricing,
funding, and Hyderabad case-study gap with high confidence. But it
**could NOT confirm** whether Powerplay's product actually lacks RERA
filing, GSTN e-invoice, blockchain anchor, kiosks, or vernacular voice
UX. Absence from marketing copy is not proof of absence in the product.

If SiteTrack Pro builds "moats" on assumption, Powerplay can close them
in a 60-day sprint after seeing the marketing site, and the entire
differentiation thesis collapses.

This script gets that signal from ten people in fifteen days — five
ex-Powerplay customers (or current ones willing to talk) and five
Hyderabad mid-size builders SiteTrack is targeting as design partners.

## Target list (10 interviews)

### Group A — Ex-Powerplay or current Powerplay users (5 interviews)

Goal: verify which of our "moats" are actually present in Powerplay's
product today.

Sourcing path: LinkedIn search `site:linkedin.com/in "Powerplay"
OR "@getpowerplay" Hyderabad/Bangalore` + ex-Powerplay employee 1st-
and 2nd-degree network.

| # | Name | Builder firm | Role | Sourcing |
|---|------|-------------|------|----------|
| A1 | _to fill_ | _to fill_ | _PM / Procurement / Site Engineer_ | _LinkedIn cold + CREDAI intro_ |
| A2 | _to fill_ | _to fill_ | _PM / Procurement / Site Engineer_ | _LinkedIn cold + CREDAI intro_ |
| A3 | _to fill_ | _to fill_ | _PM / Procurement / Site Engineer_ | _LinkedIn cold + CREDAI intro_ |
| A4 | _to fill_ | _to fill_ | _PM / Procurement / Site Engineer_ | _LinkedIn cold + CREDAI intro_ |
| A5 | _to fill_ | _to fill_ | _PM / Procurement / Site Engineer_ | _LinkedIn cold + CREDAI intro_ |

### Group B — Hyderabad mid-size builders (target design partners, 5 interviews)

Goal: validate willingness-to-pay at INR 49,999/yr Pro and
INR 29,999/yr design-partner anchor + understand current workflow
pain that WhatsApp DPR addresses.

| # | Builder firm | Decision-maker target | Active projects | Sourcing path |
|---|-------------|----------------------|-----------------|---------------|
| B1 | My Home Constructions | GM Projects or Head Operations | 12+ | Family-office intro + CREDAI Hyderabad |
| B2 | Aparna Constructions | Head Projects | 15+ | CREDAI Hyderabad + architect partner referral |
| B3 | Sumadhura Group | COO or VP Operations | 10+ | LinkedIn 2nd-degree via architect |
| B4 | Vasavi Constructions | Director or Head Construction | 8+ | Direct cold reach (founder lives in Banjara Hills) |
| B5 | Lansum Group | Promoter or COO | 6+ | Procurement-head intro via vendor |

**Stretch alternates** (fill if any of B1–B5 unreachable in 14 days):
Trendset, Hallmark, Vamsiram, Anuhar, Rajapushpa, Asrithaa, Modi
Builders, Greenmark Developers.

## Format & cadence

- **15 minutes** scheduled, **20 minutes** budget (overrun is fine).
- Zoom or in-person at builder's office (in-person preferred for Group B).
- Founder personally runs each interview. No delegation in Sprint 1.
- One follow-up WhatsApp message within 24 hours with a 1-paragraph
  summary and a "did I capture this right?" check.
- Recording optional (ask consent first). If denied, take notes during
  call, transcribe within 1 hour while memory is fresh.

## Interview script — Group A (ex/current Powerplay users)

### Opening (60 seconds)

> "Thanks for the time. I'm building SiteTrack Pro — a construction
> management tool focused on Hyderabad builders. I'm not trying to sell
> you anything today. I want to learn how you actually use Powerplay
> (or stopped using it) so I don't waste 90 days building things you
> already have. Five questions, fifteen minutes. Cool?"

### Q1 — Workflow reality (3 min)

> "Walk me through your typical Monday morning with Powerplay. What's
> the first thing you open it for? What's the last thing you do before
> closing it?"

**Listen for**: which views they actually use. Which they ignore.
What pain point Monday morning involves.

**Write down (in INTERVIEW_LOG_2026-06.md)**: the top 3 views used,
in order. The top 1 view ignored.

### Q2 — RERA filing reality check (2 min)

> "Quarterly RERA progress report — kya tools use karte ho? Is Powerplay
> ka use karte ho directly, ya dusra tool, ya manual upload?"

**Listen for**: do they actually FILE through Powerplay, or do they
type into the state portal manually? If manual, the RERA moat is real.
If through Powerplay, the moat is parity not differentiator.

**Write down**: Powerplay has RERA filing — YES / NO / UNCLEAR. Quote.

### Q3 — GSTN e-invoice (2 min)

> "RA bills + GST invoices — Powerplay se auto IRN generate hota hai
> ya separately Tally/Cleartax mein file karte ho?"

**Listen for**: same logic — auto IRN through Powerplay vs separate
tool means the moat is or isn't real.

**Write down**: Powerplay has GSTN e-invoice — YES / NO / UNCLEAR. Quote.

### Q4 — Vernacular reality check (2 min)

> "Aapke site supervisor Telugu mein speak karte hai. Powerplay app
> Telugu mein use kar sakte hai? Voice notes record karte hai?"

**Listen for**: translated string tables ≠ voice. We want to know if
they can speak Telugu to the app and get it transcribed.

**Write down**: Powerplay has Telugu voice — YES / NO / UNCLEAR. Quote.

### Q5 — Blockchain / audit trail (1 min)

> "Building handover ke time — owner ko proof of audit trail dete hai
> kya? Powerplay se blockchain-anchored kuch milta hai?"

**Listen for**: do they even care about this? If they say "what's
that?", the blockchain pitch is engineering ego, not customer value.

**Write down**: Powerplay has blockchain anchor — YES / NO / UNCLEAR.
Builder cares about blockchain — YES / NO. Quote.

### Q6 — Bonus (if time): switching cost (3 min)

> "If a Hyderabad-specific alternative landed tomorrow at 30% lower
> price, with Telugu voice, with BuildNow Telangana integration —
> kya consider karte? Kya migrate karte? Kya nahi karte?"

**Listen for**: switching cost, lock-in, contract dynamics. If they
say "we'd consider it" — that's a pilot lead. If they say "we just
signed a 3-year deal" — note that as Powerplay's actual moat.

### Closing (60 seconds)

> "Thanks. Last thing — if you had to fix ONE thing about Powerplay
> tomorrow, what would it be?"

**Listen for**: gold for SiteTrack roadmap. Write down verbatim.

## Interview script — Group B (target Hyderabad builders)

### Opening (60 seconds)

> "Sir, I'm building SiteTrack Pro for Hyderabad builders. Founder
> myself, live in [neighbourhood]. Not selling anything today — I
> want to understand your current workflow so I can build something
> useful for you. Five questions, fifteen minutes. Theek hai?"

### Q1 — Current tool stack (2 min)

> "Aap projects ke liye konsa software use karte ho? Powerplay,
> RDash, Falconbrick, Tally + WhatsApp + Excel — kuch combination?"

**Listen for**: what's installed. Whether they're already paying for
something OR running on WhatsApp + Excel (the larger market).

**Write down (in INTERVIEW_LOG_2026-06.md)**: current stack, monthly
spend if any.

### Q2 — Daily progress reporting (3 min)

> "Site supervisor daily progress kaise report karta hai aapko? Phone
> call? WhatsApp message? Email? Software?"

**Listen for**: confirms or refutes the WhatsApp DPR thesis. If they
say "WhatsApp + voice note + photo", we are validated. If they say
"daily 8am meeting", different problem.

**Write down**: current DPR mechanism, frequency, pain points.

### Q3 — Telugu voice acceptance (2 min)

> "Agar site supervisor Telugu mein voice note record kare aur woh
> automatic transcription ho jaaye text mein — useful hota? Site
> supervisors ki literacy ka kya scene hai?"

**Listen for**: do they think Telugu voice is a real product feature
or a gimmick? Do their supervisors actually need it?

**Write down**: Telugu voice would be useful — YES / NO / SOMEWHAT.
Supervisor literacy level (educated guess).

### Q4 — RERA & BuildNow Telangana (2 min)

> "Quarterly RERA filing aapke side se kaun karta hai? CA? Internal
> team? Built-in software? BuildNow Telangana portal use kiya hai?"

**Listen for**: pain point depth on RERA. Awareness of BuildNow.

**Write down**: who files RERA today, BuildNow awareness Y/N.

### Q5 — Pricing anchor + willingness-to-pay (2 min)

> "Hypothetical — agar ek tool aaye jo daily DPR WhatsApp pe deta
> hai, Telugu voice handle karta hai, RERA filing auto karta hai,
> aur INR 49,999/yr per organization charge karta hai (not per
> user) — kya INR 50k saal ka spend karoge?"

**Listen for**: willingness to pay at our intended Pro tier. Their
response anchors our final price decision.

**Write down**: WTP at INR 49,999/yr — YES / NO / MAYBE / "too expensive"
/ "too cheap". Their counter-offer price if mentioned.

### Q6 — Bonus (if time): design-partner offer (3 min)

> "Sir, I'd like to offer your firm a design-partner slot — INR 29,999/yr
> first year, 24-month lock, 3-month logo exclusivity in your micro-segment.
> In exchange we co-create the product with you and you become our first
> published case study. Interested in a 90-minute on-site meeting next week?"

**Listen for**: YES = pilot lead. NO = ask why (price? trust? timing?).

**Write down**: Pilot interest — YES / NO. If yes, propose 3 dates.

### Closing (60 seconds)

> "Thank you, sir. Last thing — if you had to digitize ONE workflow
> at your firm tomorrow that would save the most time, what would
> it be?"

**Listen for**: roadmap gold. Write verbatim.

## After every interview — within 1 hour

1. Append a numbered row to `INTERVIEW_LOG_2026-06.md` with the full
   transcript (or notes) and the structured answers.
2. Update `VERIFIED_GAPS_MATRIX.md` — flip any UNVERIFIED row to
   VERIFIED if the interview gave a clear answer.
3. Send the follow-up WhatsApp message:
   > "Sir/Ma'am, thank you for the time. To make sure I captured this
   > right: [3-bullet summary]. If anything is wrong, please reply.
   > I'll WhatsApp again next week with [specific commitment]."
4. If the interview surfaced a NEW competitive insight worth
   re-verifying, add to `docs/research/OPEN_QUESTIONS.md`.

## Day 15 gate — Sprint 2 unlock condition

Sprint 2 (build the real WhatsApp DPR) does NOT start until:

- ≥8 of 10 interviews completed and logged
- `VERIFIED_GAPS_MATRIX.md` has signed quotes (or verbatim
  attribution) for every claim in COMPETITOR_COMPARISON_V2.md that
  is currently UNVERIFIED
- ≥5 of Group B builders have a meeting scheduled for Sprint 2 with a
  named decision-maker + date + venue
- Pricing decision locked: either confirm INR 49,999/yr Pro / INR
  29,999/yr pilot, or counter based on WTP data

If gate not met by Day 15, founder runs another 5-day interview
sprint before unlocking Sprint 2. **Do not build on assumption.**

## Source citations preserved here

All claims that drove this script come from:
- `docs/SITETRACK_V3_PLAN.md` §1 (mistakes), §2 (market reality)
- Workflow `wz3yologq` (deep research)
- Workflow `w957hlybp` (repo audit + planning)
- Powerplay self-disclosed: <https://www.getpowerplay.in/resources/case-studies/>
- Powerplay pricing: <https://softwarefinder.com/construction/powerplay>
- BuildNow Telangana: <https://buildnow.telangana.gov.in/>
