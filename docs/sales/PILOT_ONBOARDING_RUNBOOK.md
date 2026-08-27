# Pilot Onboarding Runbook — 90-Minute On-Site Activation
*Sprint 2, Day 16+ · Session 30.3*

The founder activates each signed pilot in person at the builder's
office. 90 minutes. No webinar. No Loom. The founder physically shows
up. Per `docs/business/PILOT_AGREEMENT_v1.md` clause 1.2.

This runbook is what the founder reads twice — once the night before,
once in the car en route — and ticks off in real time. It exists so
the activation lands the same way for pilot #1 as for pilot #5, even
when the founder is tired.

Pair this with:
- `docs/business/PILOT_AGREEMENT_v1.md` — what the builder signed.
- `docs/sales/DEMO_SCRIPT_DPR.md` — the 60-sec Loom they already saw.
- `scripts/seeds/seed-first-org.mjs` — provisioning helper.

## Pre-activation prep (night before)

| Task | Owner | Done |
|------|-------|------|
| Confirm meeting time + venue with the Builder's POC | Founder | [ ] |
| Print 2 copies of `docs/business/PILOT_AGREEMENT_v1.md` (if not yet signed) | Founder | [ ] |
| Charge laptop + phone + battery pack to 100% | Founder | [ ] |
| Confirm WHATSAPP_PERMANENT_TOKEN env var for this org's WhatsApp Cloud API access (if applicable) | Founder | [ ] |
| Sync `docs/sales/DPR_DEMO_SUPERVISOR_NUMBER.md` — which supervisor's phone we'll register | Founder | [ ] |
| Pull `scripts/seeds/seed-first-org.mjs` config to point to pilot org name + slug | Founder | [ ] |
| Bring `docs/sales/SUPERVISOR_TRAINING_TE.mp4` on phone (offline-playable) | Founder | [ ] |
| Pack: business cards, single-page agreement summary, water, charger | Founder | [ ] |
| WhatsApp message at 8 AM the morning of: "Coming to your office at [time]. Anything I should prep?" | Founder | [ ] |

## Activation minute-by-minute (90 minutes)

### Minutes 0–10 — Arrival + warm-up

| Min | Activity | Founder note |
|-----|----------|--------------|
| 0–3 | Arrive. Founder badge. Builder POC introduction. | Be 5 min early. Wait outside, don't enter at exactly 0:00. |
| 3–7 | Coffee + small talk. Read the room — is the promoter joining or just the GM Projects? | If promoter joins: shift more time to slide 8 (promoter digest). If only GM: shift to slide 6 (supervisor workflow). |
| 7–10 | Lay laptop on table, open `https://sitetrackpro.in` already signed in to the seed org. | Pre-clear browser cache to avoid stale state. |

### Minutes 10–25 — The product, the way they'll actually use it

| Min | Activity | Founder note |
|-----|----------|--------------|
| 10–14 | Show **Dashboard** view. "This is what your GM Projects sees in the office." | Resist showing other views — keep focus. |
| 14–20 | Show **Daily Progress** placeholder view. "Sprint 2 ships the real one in 2 weeks. This is what your site supervisor will tap on his Rs 8,000 Android. Voice note in Telugu, photo, send. That's it." | Open the pilot interest form to show the flow. Don't actually submit. |
| 20–25 | Show **Projects** view. Create one project named after a real Builder site (e.g. "Vasavi Vista Phase 2"). | This makes the rest of the demo concrete. |

### Minutes 25–40 — Onboard their first project

| Min | Activity | Founder note |
|-----|----------|--------------|
| 25–30 | Add the first project — name, RERA registration (if available), address. | If they don't know the RERA number on the spot, leave blank. Don't grill them. |
| 30–35 | Add 1 milestone (e.g. "Basement excavation"), 1 BOQ row (e.g. "Cement 100 bags"), 1 drawing (any sample PDF). | Demonstrate the depth without dwelling. |
| 35–40 | Show that all 16 stub views (`compliance`, `forecast`, kiosks, etc) are HIDDEN. "We don't show you what we haven't actually shipped. See `docs/planning/FEATURE_FREEZE.md` on GitHub if you want to verify." | This is the trust moment. The Sprint 1 freeze is a SALES asset, not just engineering hygiene. |

### Minutes 40–60 — Set up the supervisor

| Min | Activity | Founder note |
|-----|----------|--------------|
| 40–45 | "Who's your site supervisor on this project? Get them on the call now." | If the supervisor is on-site (most common): WhatsApp video call from the Builder's office. Make this feel important. |
| 45–55 | With the supervisor: register their WhatsApp number into the demo org via the pilot interest form on `/?view=dpr`. Walk them through the Sprint 2 flow in Telugu using `docs/sales/TELUGU_PHRASE_BANK_DPR.md`. | If supervisor speaks Hindi not Telugu: that's fine — use the Hindi-mix variant in the phrase bank. |
| 55–60 | Share Telugu supervisor training video (`SUPERVISOR_TRAINING_TE.mp4`) via WhatsApp. | Confirm they received it. |

### Minutes 60–80 — Set up the promoter (the buyer)

| Min | Activity | Founder note |
|-----|----------|--------------|
| 60–65 | Register the promoter's WhatsApp number for the daily 7 AM digest. | Confirm with the Builder that the promoter is OK receiving WhatsApp from this number daily. |
| 65–72 | Show the promoter what a daily digest will look like (use a Loom + mock JSON from `voiceTranscribe.mockTranscribe`). | This is the value proposition the promoter pays for. |
| 72–80 | Explain SLOs from `docs/business/PILOT_AGREEMENT_v1.md` clause 3: 95% DPR delivery within 60 sec, 12h founder response, 1 month free per missed SLO. | Land this slow — it's the differentiator vs every other vendor. |

### Minutes 80–90 — Commit + handoff

| Min | Activity | Founder note |
|-----|----------|--------------|
| 80–84 | Confirm Cashfree invoice for INR 35,398.82 (incl. 18% GST) will arrive within 24h. Demonstrate billing UI. | Pull up `https://app.cashfree.com` to show the actual invoice flow. |
| 84–87 | Schedule first weekly check-in for 1 week from today, same time. | Get it on both calendars before leaving. |
| 87–90 | Thank the Builder POC + the supervisor + the promoter (if joining). Hand over founder business card with WhatsApp number on the back highlighted. | This is the lasting impression — make it warm not transactional. |

## Post-activation (within 4 hours)

| Task | Owner | Done |
|------|-------|------|
| WhatsApp follow-up: "Thank you for the 90 min today. [3 things we accomplished]. Next steps: [3 things they need to do this week]." | Founder | [ ] |
| Update `docs/sales/PIPELINE_TRACKER.md` with pilot status: ACTIVATED | Founder | [ ] |
| Add row to `docs/sales/PILOT_CONTRACTS/<builder_name>.md` capturing: contact info, supervisor phone, promoter phone, project list, RERA #, SLO start date | Founder | [ ] |
| Trigger seed-first-org for this Builder with their actual org name: `node scripts/seed-pilot-org.mjs --name "<Firm Name>" --slug "<firm-slug>"` (Sprint 2 deliverable) | Founder | [ ] |
| Send Cashfree invoice via dashboard | Founder | [ ] |

## Post-activation week 1 daily check-ins

Day 1–7 after activation, founder WhatsApps the supervisor once a day:

```
"[Supervisor name] sir, ee roju DPR pampincharu ah? Eemi issue
vacchindi? Edhi work cheyatam ledhu ani cheppandi."
```

(Translation: "Did you send a DPR today? Any issues? Tell me what's
not working.")

Why: in Sprint 1 customer-research, the #1 reason pilots churn at
Day 30 is "supervisor stopped using it on Day 4 and nobody knew". A
30-second daily WhatsApp check-in prevents the silent abandonment.

After Day 7: switch to weekly check-ins (founder rule, not contract).

## Activation contingencies

| Scenario | Founder response |
|----------|------------------|
| Builder POC not available on time | Wait 15 min in the lobby. Then WhatsApp once. Then leave (don't sit for 2 hours). Reschedule. |
| Supervisor speaks neither Telugu nor Hindi | Switch to English. Confirm with Builder — different supervisor for the pilot? |
| Promoter declines WhatsApp digest | Pivot: register the GM Projects's WhatsApp instead. Promoter can opt in later. |
| Builder asks for a feature that's frozen | "We hide it because we haven't shipped the real version. Sprint 4 (Day 46–60). You're a design partner — your feedback shapes the priority." Be honest. |
| Cashfree invoice fails to deliver | Send PI via email manually. Cashfree dashboard sometimes delays sandbox invoices. |
| Supervisor's phone doesn't support `mediaDevices.getUserMedia` (very old Android) | Document it. Sprint 2 deliverable: low-end-device fallback (text-only DPR with attached photo via WhatsApp Web). |
| Builder asks to back out at activation | Honour `PILOT_AGREEMENT_v1.md` clause 8: 30-day no-fault termination, refund pro-rated. Don't try to sell harder. |

## What success looks like (Day 14 post-activation)

- Supervisor has sent ≥ 7 DPRs (one per working day) over the
  first 14 days.
- Promoter has received ≥ 14 daily digests with ≥ 95% delivery
  inside 60 sec.
- Zero P1 bugs (a P1 is: DPR sent but never delivered; transcription
  ≥ 30% wrong; promoter's number used without consent).
- One scheduled weekly check-in completed by founder.
- `VERIFIED_GAPS_MATRIX.md` updated with what this Builder said about
  Powerplay (per Group B interview Q5).
- Cashfree invoice marked paid OR escalated.

If any of these fail: the founder visits the site personally on Day
15. Don't fix it over WhatsApp.

## Day 30 outcome rubric

| Outcome | Founder action |
|---------|----------------|
| Pilot is using it daily + paying invoice | Celebrate. Move to Sprint 3 features. Start case-study draft per `docs/business/CASE_STUDY_TEMPLATE.md`. |
| Pilot is using sporadically (< 5 DPRs/week) | On-site visit. Find out what's blocking. Pivot product roadmap. |
| Pilot has stopped using | Honest conversation. Per `PILOT_AGREEMENT_v1.md` clause 8.1: 30-day no-fault. Capture the verbatim reason — it's gold for Sprint 2 v2. |
| Pilot wants to upgrade | Move them to Pro (₹49,999/yr). Update `docs/sales/PIPELINE_TRACKER.md`. |

## Source

- Sprint 2 Day 16+ deliverable per `docs/archive/SITETRACK_V3_PLAN.md` §5.
- Pilot tier economics per `docs/business/PRICING.md` + `docs/business/PILOT_AGREEMENT_v1.md`.
- Architecture per `docs/architecture/SPRINT_2_ARCHITECTURE.md`.
- Telugu phrasing per `docs/sales/TELUGU_PHRASE_BANK_DPR.md`.
- Supervisor + promoter persona per `docs/business/POSITIONING.md`.

## Edit log

- v1.0 (Sprint 2, Day 16, June 2026) — initial runbook.
- v1.x — after pilot #1 + pilot #2 activations, founder amends with
  what actually happened vs what this anticipated.
