# Sprint Coach — Founder's Field Work Guide
*Sprint 2, Day 16 · Session 30.4*

The `sprint-coach` agent is your daily operating partner for Sprint 1
+ Sprint 2 field work — the work no code can do for you. Customer
interviews, in-person meetings, LinkedIn / WhatsApp outreach, pilot
signature pursuit, CREDAI presence, Loom shoot prep, supervisor
onboarding, pilot site activation.

This guide explains what it does, how to invoke it, and the rules of
engagement.

---

## What it is

A Claude Code subagent defined at `.claude/agents/sprint-coach.md`
that:

1. **Reads** every Sprint 1+2 doc you've shipped (the 90-day plan,
   positioning, pricing, agreements, recon script, target list,
   outreach sequences, warm-intro map, meeting log, Loom storyboard,
   Telugu phrase bank, pilot onboarding runbook, etc).
2. **Tells you what to do** based on the Sprint Day + your last
   reported progress.
3. **Drafts messages** — LinkedIn DMs, WhatsApp follow-ups, Telugu
   voice phrases — using the calibrated templates.
4. **Captures outcomes** — when you finish an interview or meeting,
   it updates `INTERVIEW_LOG_2026-06.md`, `MEETING_LOG_2026-06.md`,
   `VERIFIED_GAPS_MATRIX.md` based on what you verbatim report.
5. **Scores progress** against the Sprint 1 → 2 unlock gate and the
   Sprint 2 Day-30 acceptance criteria.

It does NOT write code, run builds, or deploy. Route those to the
engineering agents.

---

## How to invoke

In a Claude Code session, you can invoke the subagent in any of
these ways:

```
> Use the sprint-coach agent. Today emi cheyali?

> @sprint-coach — draft a LinkedIn DM to [Name] at [Firm].

> Sprint coach, score me on the Sprint 1 → 2 gate.

> sprint-coach: I just finished interviewing [Name]. Capture this.
```

Claude Code automatically routes to the agent. The agent reads the
relevant docs and replies with a specific action.

If you're outside Claude Code (e.g. WhatsApp), you can still simulate
the coach behaviour by reading the docs yourself in this order:
1. `docs/archive/SITETRACK_V3_PLAN.md` — find your Sprint Day.
2. `docs/sales/MEETING_LOG_2026-06.md` — check what's scheduled.
3. `docs/research/VERIFIED_GAPS_MATRIX.md` — check gate progress.
4. Open the relevant doc per the playbook table below.

---

## The 8 most common asks (with examples)

### 1. "Today emi cheyali?"

The coach reads `SITETRACK_V3_PLAN.md` + recent log files, identifies
the Sprint Day, and returns 3 concrete actions with time-budgets.

**Sample output**:

> You're on Sprint 1 Day 4.
>
> 1. **By 11 AM** — Send 10 Group A LinkedIn DMs using the A-T1
>    template (`docs/sales/LINKEDIN_OUTREACH_SEQUENCE.md` lines
>    20-35). Each DM ≤ 90 words. Personalize hook per target's
>    LinkedIn headline.
> 2. **10 AM (Tuesday only)** — Vasavi walk-in at Banjara Hills
>    office. Carry Loom QR + 1-page pitch. Drop at reception
>    if Director unavailable. See `WARM_INTRO_MAPPING.md` Vasavi
>    section (path #1, HIGH strength).
> 3. **EOD** — Call CREDAI Telangana office +91-40-XXXXXXXX for
>    next monthly meet date. Register as tech-vendor associate
>    (~₹10k). See `WARM_INTRO_MAPPING.md` Node 1.

### 2. "Help me prep for tomorrow's meeting with Aparna"

The coach reads `MEETING_LOG_2026-06.md` (your meeting entry) +
`LINKEDIN_TARGET_LIST.md` (verified Aparna company facts) +
`POSITIONING.md` (5 proof points + 8 forbidden claims) +
`DESIGN_PARTNER_DECK.md` (9-slide deck).

**Sample output**:

> Aparna meeting tomorrow — here's your 1-page cheat-sheet:
>
> **Verified facts about Aparna** (from Indeed):
> - ISO 9001:2015 + OHSAS 18001:2007 + ISO 14001:2015 certified
>   — heavily compliance-oriented.
> - 25 years operation, Hyderabad-based.
> - 4.0/5 overall rating, 4.4/5 management rating (top-down
>   decision-making).
> - 43% CEO approval (lukewarm — possible recent transition).
> - Hard interview process, 1-week cycle.
>
> **3 proof points to lead with** (from POSITIONING.md):
> 1. BuildNow Telangana govt precedent (their compliance posture
>    matches our compliance-first positioning).
> 2. Per-organization pricing, not per-seat.
> 3. Powerplay's zero Hyderabad marquee case studies.
>
> **3 forbidden claims to avoid**:
> 1. "Powerplay doesn't have RERA filing" — UNVERIFIED.
> 2. "30x cheaper than Powerplay" — actual delta is 30%.
> 3. "Production blockchain audit anchor" — Sprint 4 deliverable.
>
> **Opening line** (compliance-heavy variant from
> `LINKEDIN_OUTREACH_SEQUENCE.md` B-T1 variant 2):
> "Namaste sir/ma'am — [Firm]'s ISO + OHSAS posture made me
> look you up. Most Indian builder tools treat compliance as an
> afterthought. SiteTrack Pro is built compliance-first, anchored
> to BuildNow Telangana (the state portal that uses the same
> blockchain + WhatsApp approach)."
>
> **Closing ask**:
> "Sir/ma'am, would you consider being one of our first 5 design
> partners at INR 29,999/yr for 24 months?"
>
> **Post-meeting capture checklist** (from `MEETING_LOG_2026-06.md`):
> - Outcome: PILOT-YES / MAYBE / NO
> - WTP signal at INR 49,999/yr Pro
> - Verbatim NO reason if NO
> - Verbatim Q5 ("one workflow you'd digitize")

### 3. "I just finished an interview with [Name]"

The coach asks you to verbalise the answers, then updates 2-3 log
files based on what you report.

**Sample interaction**:

> **You**: "Interview chesa — Ramesh from Sumadhura. RERA filing
> Powerplay lo direct ga ledhu — vaala team Tally + state portal lo
> manual ga file chesi roju. Telugu voice support ledhu, but
> multilingual labels unayi. Blockchain — 'what's that' annaru.
> WhatsApp DPR unayi — manual ga supervisor ki call chesi pampisthe."
>
> **Coach**: Confirms ("Capture cheyamantarra?"). Then:
>
> Updates `VERIFIED_GAPS_MATRIX.md` (3 rows):
> - "Powerplay has RERA-TG auto-filing" → VERIFIED-ABSENT
>   (Source: Interview A1, Ramesh, Sumadhura, 2026-06-XX)
> - "Powerplay has Telugu voice (not just translated strings)" →
>   VERIFIED-ABSENT (Source: same interview)
> - "Builder cares about blockchain audit handover" → NO
>   (Source: same interview, asked "what's that")
>
> Appends a row to `INTERVIEW_LOG_2026-06.md` with the 6-question
> structured capture template.
>
> **Action**: WhatsApp Ramesh within 4 hours:
> "Sir, thank you for the time. 3 things you helped me with:
> (1) RERA today is Tally + manual. (2) Telugu voice ledhu in
> Powerplay. (3) Blockchain — not on your radar. Iddari kosam
> meeku WhatsApp sender weekly summary share chestha. Thank you 🙏"

### 4. "Draft a LinkedIn DM to [Name]"

The coach picks the right template variant + personalises it.

**Sample**:

> **You**: "Draft DM to [Name], COO at Lansum."
>
> **Coach** (uses founder-to-founder variant 3 in
> `LINKEDIN_OUTREACH_SEQUENCE.md`):
>
> "Namaste [Name] sir — Rakesh Boyapati.
>
> Hyderabad mein chhota construction tool bana raha hoon —
> WhatsApp pe DPR, Telugu voice, BuildNow integration. Aapne
> Lansum khud build kiya hai — promoter-to-promoter ki baat
> karte ho. 15 min next week?
>
> Loom: [URL]"
>
> Word count: 47 (under T1's 90-word ceiling). Cadence rule
> reminder: send T2 in 5 days if no reply.

### 5. "How do I say [English phrase] in Telugu?"

The coach checks the phrase bank first, then translates using the
construction-Telugu register if not present.

**Sample**:

> **You**: "How do I say 'I'm coming to your office at 10 AM tomorrow,
> please ask the site engineer to be present' in Telugu?"
>
> **Coach** (translates using TS dialect with English loan words):
>
> "Repu morning 10 ki mee office ki vasthunna. Site engineer ki
> kuda undamani cheppandi."
>
> Pronunciation: "Repu morning ten ki mee office ki vas-thun-na.
> Site engineer ki ku-da un-da-ma-ni chep-pan-di."
>
> Register: Hyderabadi Telugu, English loan words preserved
> (morning, office, site engineer).

### 6. "Score me on the Sprint 1 → 2 gate"

The coach now has a **deterministic scorecard tool** that the
founder can also run directly from the shell:

```bash
# Markdown verdict (what the coach prints back)
node scripts/sprint-1-gate-score.mjs --format md

# Machine-readable JSON (pipe into other tools / CI)
node scripts/sprint-1-gate-score.mjs --format json

# Gate-aware: exit 1 if not ready (use in pre-push hook)
node scripts/sprint-1-gate-score.mjs --strict
```

The tool reads the same 5 docs the coach used to read manually:
- `docs/research/INTERVIEW_LOG_2026-06.md` (interviews completed)
- `docs/research/VERIFIED_GAPS_MATRIX.md` (verdict per claim)
- `docs/sales/MEETING_LOG_2026-06.md` (Sprint 2 meetings booked)
- `docs/sales/PILOT_CONTRACTS/` (signed pilot agreements)
- `docs/business/PRICING.md` (pricing-decision locked)

It returns a verdict + per-criterion table + next-action list. The
parser (`src/lib/sprint1GateScore.js`) is unit-tested so the score
is stable across runs — no human eyeballing needed.

**Sample (Day 1, no fieldwork yet)**:

> # Sprint 1 → 2 Gate Scorecard
> *Generated 2026-06-02*
>
> ## Verdict
>
> ⏳ **4/5 CRITERIA OPEN**
>
> 4 of 5 criteria still open. See detail per row.
>
> ## Per-criterion breakdown
>
> | # | Criterion | Target | Current | Pass | Detail |
> |---|---|---|---|---|---|
> | 1 | Interviews completed | ≥ 8 | 0 | ❌ | 0 of 10 logged |
> | 2 | Verified gaps closed | 11 | 0 | ❌ | 11 still UNVERIFIED |
> | 3 | Sprint 2 meetings booked | ≥ 5 | 0 | ❌ | 0 scheduled |
> | 4 | Pilot signals | ≥ 1 YES or ≥ 2 MAYBE | 0 / 0 | ❌ | No signals yet |
> | 5 | Pricing locked | yes | yes | ✅ | All 3 tiers present |
>
> ## Next action
>
> 1. **Interviews** — Run 2 today (Group A LinkedIn responses
>    pending). See POWERPLAY_RECON_SCRIPT.md.
> 2. **Meetings** — CREDAI Telangana monthly meet on Day 6 is the
>    highest-ROI booking. Register today.
> 3. **Pilot signals** — Vasavi walk-in (Day 5) + Lansum founder
>    DM are the two paths most likely to flip a MAYBE.

**Wiring**: the coach (`.claude/agents/sprint-coach.md`) now
ALWAYS shells out to this script via Bash before answering — it
never eyeballs the docs.

### 7. "What's my next warm-intro step for My Home?"

The coach reads `WARM_INTRO_MAPPING.md` for My Home + checks which
paths you've already activated (from your reports).

**Sample**:

> My Home warm-intro pathways still open (highest first):
>
> 1. **CREDAI Telangana monthly meet** — HIGH strength. Dr. Rao or
>    GM Projects regularly attend. Status: not yet attended.
>    Action: register today (₹10k fee, 1-day effort).
> 2. **Architect referral** — HIGH strength. Identify lead
>    architects on JM Apartments, Jewel, Rainbow, Navadweepa,
>    Tycoon, Hub. Status: not started. Action: LinkedIn search
>    "[project name] architect" + DM top 3.
> 3. **Family-office circle** — MEDIUM strength. Banjara Hills
>    residential club / Hyderabad business-family social network.
>    Status: depends on your existing network density.
>
> Recommended next move: Path #1 (CREDAI). Highest ROI per day
> invested.

### 8. "Bhashini API kosam apply chesta — em cheppali"

The coach pulls from `SPRINT_2_ARCHITECTURE.md` + general knowledge
of Bhashini's application process.

**Sample**:

> Bhashini application (typical 5-7 day turnaround):
>
> 1. Go to https://bhashini.gov.in/ and click "Developer Access".
> 2. Sign up as a non-profit / startup with these details:
>    - Org: GiggleZen Technologies Pvt Ltd
>    - Use case: "Voice-to-text for Telugu site supervisor's
>      Daily Progress Report on a construction-management SaaS for
>      Hyderabad mid-size builders."
>    - Expected volume: 5,000–20,000 clips/month at Sprint 2
>      maturity.
>    - Languages: Telugu (primary), Hindi (secondary).
> 3. Attach our compliance posture: BuildNow Telangana integration
>    + RERA-TG roadmap + builder-side data ownership.
> 4. After approval, set `BHASHINI_API_KEY` env var in Supabase
>    Edge Function project settings.
>
> Founder note: Bhashini's free tier covers up to ~50,000 calls/mo
> for non-profit + startup categories. After that, AWS Transcribe
> ($0.024/min) is the paid fallback per our voiceTranscribe.js lib.

---

## Doc → Coach action mapping

| Founder situation | Coach reads | Coach does |
|---|---|---|
| Daily check-in | `SITETRACK_V3_PLAN.md` | 3-bullet day plan |
| Pre-meeting prep | `MEETING_LOG_2026-06.md` + `LINKEDIN_TARGET_LIST.md` + `POSITIONING.md` + `DESIGN_PARTNER_DECK.md` | 1-page cheat sheet |
| Post-meeting capture | (founder verbatim report) | Update `MEETING_LOG` + `VERIFIED_GAPS_MATRIX` |
| Interview prep | `POWERPLAY_RECON_SCRIPT.md` | 6-question script preview |
| Post-interview capture | (founder verbatim report) | Update `INTERVIEW_LOG` + `VERIFIED_GAPS_MATRIX` |
| Draft LinkedIn DM | `LINKEDIN_OUTREACH_SEQUENCE.md` + `LINKEDIN_TARGET_LIST.md` | Personalised DM ≤ 90 words |
| Draft WhatsApp follow-up | `MEETING_LOG_2026-06.md` templates | Personalised follow-up |
| Telugu translation | `TELUGU_PHRASE_BANK_DPR.md` | Telugu + English gloss + pronunciation |
| Warm-intro next step | `WARM_INTRO_MAPPING.md` | Highest-strength unactivated path |
| Score Sprint 1 → 2 gate | `VERIFIED_GAPS_MATRIX` + `INTERVIEW_LOG` + `MEETING_LOG` | Scorecard with gaps |
| Score Sprint 2 Day-30 | `SPRINT_2_ARCHITECTURE.md` + actual usage data | Scorecard with gaps |
| Loom shoot prep (Day 2) | `LOOM_SHOOT_CHECKLIST.md` + `TELUGU_PHRASE_BANK_DPR.md` + `LOOM_STORYBOARD.md` | Pre-shoot checklist + Telugu lines |
| Pilot activation prep (Day 20+) | `PILOT_ONBOARDING_RUNBOOK.md` | Pre-activation checklist |

---

## Rules of engagement

### What the coach WILL do

- Read docs literally, cite section / line.
- Update log files when you report explicit outcomes.
- Draft messages within the doc-templated style + word limits.
- Translate Telugu / Hindi using the calibrated register.
- Score progress against the gate criteria.
- Tell you when to STOP (e.g. don't send T4, gate not met, abort
  Vasavi walk-in).

### What the coach WILL NOT do

- Make commitments on your behalf.
- Fabricate interview / meeting outcomes.
- Promise features that haven't shipped (cross-checks
  `docs/FEATURE_FREEZE.md`).
- Quote pricing other than `docs/business/PRICING.md` verified tiers.
- Use forbidden claims from `docs/business/POSITIONING.md` §"What we WILL
  NOT say".
- Modify code, run builds, or deploy.

### When to override the coach

If the coach is wrong (its recommendation feels off given context
it doesn't have), say so + tell it why. It's an assistant, not
authority. Your founder judgement wins.

If you want to UPDATE a log file with the founder's own narrative
(not in the coach's structured template), use `Edit` directly on
the file. The coach respects your handwriting.

---

## Sample week 1 conversation (Sprint 1 Day 2 → Day 7)

```
Day 2 morning:
  > sprint-coach: Loom shoot today. Help me prep.
  Coach: [reads SHOOT_CHECKLIST + STORYBOARD + PHRASE_BANK]
         "Here's your 06:30 AM checklist + the 3 Telugu lines
          the talent will speak…"

Day 3 morning:
  > sprint-coach: Today emi cheyali?
  Coach: "Day 3 = CREDAI Telangana call + LinkedIn target
          hand-research. Three actions: (a) call CREDAI by
          11 AM, (b) identify A1-A5 LinkedIn names by 3 PM,
          (c) identify Lansum founder + Aparna ISO
          consultant by 6 PM."

Day 4 morning:
  > sprint-coach: Draft 5 Group B T1 DMs.
  Coach: "Here are 5 personalised B-T1 messages, one per M1-M5
          builder. Each under 90 words…"

Day 4 evening:
  > sprint-coach: Vasavi walk-in done. Director not available.
                  Left Loom QR + 1-pager at reception. Receptionist
                  said director travels next 5 days.
  Coach: [Updates MEETING_LOG row M4 with status DROPPED]
         "Logged. Suggest: switch M4 path to subcontractor float
          (path #2, MEDIUM strength). Want me to identify 3
          RMC plant managers who supply Vasavi?"

Day 5 morning:
  > sprint-coach: RMC coffee #1 today with Manoj from UltraTech.
                  What should I ask?
  Coach: [reads WARM_INTRO_MAPPING Node 3]
         "3 questions: (1) Which builders pay on time?
          (2) Which builders' supervisors actually file daily
          reports vs make phone calls? (3) Can he intro me to
          GM Projects at the slowest-paying builder (they
          have the most cashflow pain — best pitch fit)?"

Day 6 evening:
  > sprint-coach: CREDAI meet ayindi. Bumped into someone from
                  Sumadhura, exchanged cards. Got intro to GM
                  Projects via mutual.
  Coach: [Updates MEETING_LOG with Sumadhura intro path #1
          activated]
         "Logged. Suggest: send Sumadhura B-T1 DM via the
          mutual within 24 hours so the intro stays fresh."

Day 7 morning:
  > sprint-coach: Interview chesa — Ramesh from Sumadhura.
                  RERA Powerplay lo direct ga ledhu — Tally +
                  manual. Telugu voice ledhu. Blockchain —
                  'what's that'.
  Coach: [Updates VERIFIED_GAPS_MATRIX 3 rows + appends
          INTERVIEW_LOG row]
         "Logged. Sprint 1 → 2 gate is now 4/8 interviews,
          7/13 verified-gap rows, 3/5 meetings. On track —
          but need 4 more interviews + 2 more meetings in 8
          days. Want me to draft the T2 follow-up batch?"
```

---

## Founder rule of thumb

The coach reads docs. The coach updates logs. The coach drafts
messages. The coach scores progress.

**The coach does not do the work.** You do.

Use it as your operating partner, not your replacement. The 90-min
on-site activation, the Telugu voice note to your supervisor, the
handshake with Dr. Rao at CREDAI — those are yours. The coach makes
sure you're prepped, scripted, and tracking.

## Sources

- `.claude/agents/sprint-coach.md` — the agent definition.
- `.agents/sitetrack-pro/founder-sprint-coach.md` — the team
  charter.
- `docs/archive/SITETRACK_V3_PLAN.md` — the 90-day plan the coach reads.
- `docs/SPRINT_2_ARCHITECTURE.md` — Sprint 2 specifics.

## Edit log

- v1.0 (Sprint 2, Day 16, June 2026) — initial guide.
- v1.x — refine sample sessions as the founder reports patterns.
