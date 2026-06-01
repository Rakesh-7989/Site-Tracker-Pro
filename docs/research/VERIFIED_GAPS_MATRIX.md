# Verified Gaps Matrix — Powerplay vs SiteTrack Pro
*Sprint 1, Day 1–15 · Session 30.2*

The deep-research workflow could NOT confirm Powerplay's product LACKS
RERA/GSTN/blockchain/kiosks/vernacular UI from public sources. Absence
from marketing copy is not proof. This matrix tracks the conversion
from UNVERIFIED → VERIFIED as interview evidence lands.

**Update rule**: a claim moves from UNVERIFIED to VERIFIED only when
**≥2 of 5 Group A interviewees** give a consistent answer with
verbatim attribution. Single-source claims stay UNVERIFIED.

| Claim | Original verdict | Interview evidence | Verified verdict | Source interviews | Action if VERIFIED |
|-------|------------------|---------------------|------------------|-------------------|---------------------|
| Powerplay has RERA-Telangana auto-filing | UNVERIFIED | _to fill from Group A_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#__, #___ | If ABSENT → Sprint 4 ships RERA-TG depth as a moat. If PRESENT → drop the claim, compete on price + locality. |
| Powerplay has RERA-Karnataka auto-filing | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | If ABSENT → Sprint 5 ships RERA-KA. If PRESENT → de-prioritize. |
| Powerplay has RERA-Maharashtra auto-filing | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | If ABSENT → Sprint 5 ships RERA-MH. If PRESENT → de-prioritize. |
| Powerplay generates GSTN e-invoice IRN | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | If ABSENT → Sprint 4 ships GSTN as moat. If PRESENT → not a moat. |
| Powerplay has Polygon blockchain anchor | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | If ABSENT AND builders care → moat. If ABSENT AND builders DGAF → kill the feature. |
| Powerplay has Telugu voice-to-text (not just translated strings) | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | If ABSENT → Sprint 2 Telugu voice is the wedge. |
| Powerplay has labour-kiosk biometric attendance | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | If ABSENT → Sprint 3 kiosk is real moat. If PRESENT → parity. |
| Powerplay has BuildNow Telangana integration | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | Likely ABSENT (Bengaluru-based vendor). Sprint 2 ships our own — should be moat. |
| Powerplay has WhatsApp-first promoter digest (7am cron) | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | If ABSENT → Sprint 3 digest is the wedge. |
| Powerplay has handover-packet blockchain anchor | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | If ABSENT AND builders care → Sprint 4 handover is moat. |
| Powerplay has supplier-portal GSTN-validated invoice upload | UNVERIFIED | _to fill_ | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ | _#___ | Sprint 5 deliverable; check parity. |
| Powerplay has procurement-linked embedded credit (Mar 2026 launch) | VERIFIED-PRESENT | Trade press 3-0: Telangana Today + RealtynMore + Content Media Solution | VERIFIED-PRESENT | Public sources | DO NOT fight on credit. Compete on Hyderabad depth + locality + price. |
| Powerplay has Pro INR 71,999/yr + Pro+ INR 1,19,999/yr (Indian pricing) | VERIFIED-PRESENT | SoftwareFinder, Techjockey, Capterra, vendor's own compare page | VERIFIED-PRESENT | Public sources | Reprice SiteTrack to INR 49,999/yr Pro (30% under). |
| Powerplay marquee case studies feature Hyderabad builders | VERIFIED-ABSENT | Direct WebFetch of getpowerplay.in/resources/case-studies/ | VERIFIED-ABSENT | Public sources | EXPLOIT — sign My Home / Aparna / Sumadhura / Vasavi / Lansum as first case studies. |
| Powerplay positioning: "multilingual support + 7-day adoption" | VERIFIED-PRESENT | Vendor own page + SoftwareFinder + SoftwareAdvice + nbmcw | VERIFIED-PRESENT | Public sources | Differentiate on Telugu voice (not strings) + Hyderabad depth (not breadth). |

## Group B (Hyderabad builder) capture — willingness-to-pay

| Claim | Original verdict | Interview evidence | Verified verdict |
|-------|------------------|---------------------|------------------|
| INR 49,999/yr Pro tier acceptable to mid-size Hyderabad builders | UNVERIFIED | _to fill — need 3 YES_ | _to fill_ |
| INR 29,999/yr design-partner price acceptable | UNVERIFIED | _to fill_ | _to fill_ |
| Telugu voice DPR is a real demand (not gimmick) | UNVERIFIED | _to fill — need 3 YES_ | _to fill_ |
| Builders care about blockchain audit handover | UNVERIFIED | _to fill — need 3 YES_ | _to fill_ |
| Builders use BuildNow Telangana portal today | UNVERIFIED | _to fill_ | _to fill_ |
| Builders pay for SaaS today (any vendor) | UNVERIFIED | _to fill_ | _to fill_ |

## Decision rules

- **All UNVERIFIED at Day 15** → cannot start Sprint 2 features that
  depend on the claim. Run another 5-day interview pass.
- **VERIFIED-PRESENT** (Powerplay has it) → drop from moat narrative,
  reframe as parity, compete on price + Hyderabad locality.
- **VERIFIED-ABSENT** (Powerplay lacks it) → keep in moat narrative,
  prioritize for build sprint.
- **MIXED** (3 YES + 2 NO) → ambiguous; treat as VERIFIED-PRESENT
  defensively (assume the worst about Powerplay's product).

## Sources of original verdicts

- `docs/SITETRACK_V3_PLAN.md` §2 — market reality, citing research
  findings #1–7.
- Workflow `wz3yologq` — deep-research output (15 confirmed claims,
  10 refuted).
- Workflow `w957hlybp` — repo audit + planning.
- `docs/research/POWERPLAY_RECON_SCRIPT.md` — the interview script
  that fills this matrix.

## Cadence

- Update this matrix **after every interview** (within 1 hour).
- Re-check the table at Day 7 (5 interviews done) and Day 14 (8
  interviews done).
- At Day 15 — lock the matrix and present at the Sprint 1 → Sprint 2
  unlock gate.
