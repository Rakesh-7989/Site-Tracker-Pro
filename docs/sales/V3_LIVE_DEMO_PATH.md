# v3 Live Demo Path — in-meeting click-through (green surfaces only)

*Generated June 4, 2026. Companion to the 60-sec Loom (`DEMO_SCRIPT_DPR.md`)
and the on-site activation runbook (`PILOT_ONBOARDING_RUNBOOK.md`).*

## What this is

The exact click-path the founder runs **live, in front of a builder**, on
the v3 TypeScript shell. It stays inside the surfaces v3 has actually built
("Ready" rows) and **never touches a placeholder**. ~8 minutes.

The Loom is the warm-up you send 48h before. This is what you drive on a
laptop/phone in the room. The runbook is what you do after they say yes.

> **Why a script at all?** v3 today covers ~10-15% of the legacy surface on
> purpose (pilot-first — see `docs/V3_CUTOVER_READINESS.md`). The covered
> 10-15% IS the wedge. The risk in a live demo is fat-fingering into a
> "coming soon" panel and spending credibility you didn't need to. This
> script removes that risk: green routes only.

## Before the meeting (2 min setup)

1. Open `sitetrack-rakesh.vercel.app/?shell=v3` once on the demo device.
   The `?shell=v3` flag persists in localStorage — you only append it once.
2. Have **two** logins ready from `TEST_USERS_CREDENTIALS.md` (gitignored):
   - **Promoter** — `test-promoter@sitetrack.test` (the buyer's view)
   - **Site supervisor** — `test-site-supervisor@sitetrack.test` (the daily user)
   > Email format: `test-<role>@sitetrack.test` with underscores → hyphens
   > (so `site_supervisor` → `test-site-supervisor`). Passwords in the
   > gitignored `TEST_USERS_CREDENTIALS.md`.
3. Pre-create ONE project named after the builder's real site (e.g.
   "Vasavi Vista") so the demo feels theirs, not a sandbox.
4. Phone on the same device for the DPR voice step (or describe it if the
   voice transcribe is still the mock — **say so honestly**, don't fake it).

## ✅ Green routes — safe to show

| Route | What it proves | Login as |
|---|---|---|
| `/login` | Clean, no demo clutter, password + magic-link | — |
| `/dashboard` | **Role-routed** — promoter sees finance-first | promoter |
| `/dashboard` | Supervisor sees a minimal, field-first surface | site_supervisor |
| `/projects` | Portfolio list | either |
| `/projects/new` | Create a project in ~10 sec | promoter |
| `/projects/:id` → **Overview** tab | Real project summary | either |
| `/projects/:id` → **Team** tab | Real member list, role-aware | either |
| `/dpr` | **The wedge** — voice + photo + geo + WhatsApp preview | site_supervisor |

## ❌ Do NOT click these (placeholders — credibility leak)

- Any project detail tab **other than Overview + Team** (25 tabs are
  "coming soon" skeletons in v3).
- `/activity`, `/audit`
- `/org/members`, `/org/billing`, `/org/integrations`
- `/admin/users`, `/admin/orgs`

If the builder asks "what about [X tab]?" → honest line: *"Adi legacy app
lo ready undi; v3 lo nేను mీ pilot feedback batti port chేస్తున్నా — mీరు
ఏది roజూ touch chేస్తారో adే mundu vస్తుంది."* That's not a weakness; it's
your pilot-first discipline, stated out loud.

## The 8-minute beat sheet

### Act 1 — The buyer's calm (2 min) · login as **promoter**
1. Land on `/dashboard`. Point at the **"Namaskaram, [name]"** header +
   **Promoter** badge. "Idi mీ view — owner view. Finance-first."
2. Point at the **7am WhatsApp digest** card. "Mీరు ఎప్పుడూ login avvanu.
   Roజూ pొద్దున్నే WhatsApp lo progress + cost + risks + site photo."
3. One click to `/projects`. "Mీ portfolio — okే chోట."
4. **Do not** open the 25 placeholder tabs. Open `/projects/:id` →
   **Overview** only. "Project summary." Then **Team** tab. "Evaru ఈ
   site lo." Stop there.

### Act 2 — The field reality (3 min) · switch login to **site_supervisor**
5. Log out, log in as supervisor. Land on `/dashboard`. "Idi mీ site
   supervisor view — minimal, ఒక్క pని: report."
6. Go to `/dpr`. Walk the composer top to bottom:
   - **Language** toggle (te / hi / en). "Telugu lo."
   - **Voice** — record a line ("slab pour ayindi, aaj 80 cubic metres").
     If transcribe is still mock, say: *"Ee transcription Bhashini tho
     live avtundi pilot lo; ippudu demo mock."* Honest.
   - **Photo + geo** — capture; point at the **Hyderabad geo-verified**
     state. "Site lo unnaru ani GPS confirm chేస్తుంది — fake report
     kుదరదు."
   - **WhatsApp preview** — show the rendered digest the promoter receives.
     "Idే promoter ki WhatsApp lo coffee time ki vస్తుంది."
7. Land the line: **"No app install for the promoter. No training for the
   supervisor. Just WhatsApp + ఒక voice note."**

### Act 3 — The close (3 min)
8. Back to laptop. One sentence: *"Idi mీ ఒక్క site tho rేపే start avvొచ్చు.
   First 5 builders — INR 29,999/yr, per-seat charge ledhu."*
9. Pull up `PILOT_AGREEMENT_v1.md`. "Ee paper 1-page — design partner terms."
10. Ask the one question (from the Loom playbook): **"Mీ site supervisor
    ఇది use chేస్తారా? YES / NO / TELL ME MORE."** Then shut up.

## If something breaks mid-demo

- **Login fails / 500** → the EF auth hardening isn't deployed yet
  (founder action pending). Fall back to the Loom + screenshots. Don't
  debug live.
- **DPR composer shows "Access denied"** → you're logged in as the wrong
  role. Only `site_supervisor` (and PM/contractor tiers) have `dpr:submit`.
  Re-login as `test-site-supervisor@sitetrack.test`.
- **A placeholder appears** → you clicked a Gap route. Recover: *"Adi inka
  port avvaledhu — pilot lo mీ priority batti vస్తుంది,"* and navigate back
  to `/dashboard`. Never apologize twice.
- **Total failure** → close the laptop, play the 60-sec Loom from your
  phone, ask the YES/NO/TELL-ME-MORE question. The Loom alone closes.

## What this demo deliberately omits

- ❌ The 25 not-yet-ported detail tabs (legacy has them; v3 will, by
  pilot signal).
- ❌ Org/admin panels — irrelevant to a single-site pilot's first week.
- ❌ Any feature tour. One workflow: voice DPR → WhatsApp digest. That's
  the wedge; everything else is Act 1 context.

## Source + linkage

- Surfaces map to `src/app/router.tsx` (v3 route tree) and
  `docs/V3_CUTOVER_READINESS.md` (Ready vs Gap matrix).
- Personas/logins from `scripts/create-test-users.mjs` +
  `TEST_USERS_CREDENTIALS.md`.
- Positioning/pricing anchored to `docs/POSITIONING.md` + `docs/PRICING.md`.
- Pairs with `DEMO_SCRIPT_DPR.md` (pre-meeting Loom) and
  `PILOT_ONBOARDING_RUNBOOK.md` (post-yes activation).
