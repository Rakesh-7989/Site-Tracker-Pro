# Bhashini API Setup — Telugu / Hindi Voice Transcription

**Cost:** 🆓 free for startups (capped under "Startup category" — exact
per-call cap published per-quarter; sufficient for Sprint 2 pilots).
**Approval time:** 5–7 business days.
**Why we use it:** Primary STT provider in `voice_transcribe` EF — works
better than AWS Transcribe on Telangana Telugu + cheaper than Google STT.

## What Bhashini gives us

- Telugu STT optimised on Indian Government recordings (FAR better
  accent coverage than Google STT for Telangana dialect)
- Hindi STT as a bonus (Bhashini Hindi is acceptable; we use it instead
  of AWS per the zero-spend policy)
- Free tier for startups + non-profits, no credit card on file
- Government-of-India endorsement is useful in the RERA / GSTN pilot
  pitch (proof point #2 in `docs/business/POSITIONING.md`)

## Application — what to fill

Go to https://bhashini.gov.in/ → **Developer Portal** → **Sign Up**.

| Field | Suggested answer |
|---|---|
| Organisation name | GiggleZen Technologies Pvt Ltd |
| Org type | Startup |
| Use case category | Speech recognition (ASR) |
| Use case description | "Voice-to-text for Telugu site supervisors' Daily Progress Report (DPR) on a construction-management SaaS for Hyderabad mid-size builders. The voice clip is 8–20 seconds, recorded on Android, sent to a Supabase Edge Function that calls Bhashini. The transcript flows into the day's DPR + a 7am WhatsApp digest to the promoter." |
| Expected monthly volume | 5,000 → 20,000 clips/month at Sprint 2 maturity (2 pilots × 1 site × 5 supervisors × 30 days × ~3 DPRs/day) |
| Primary language | Telugu (te) |
| Secondary language | Hindi (hi) |
| Compliance posture | "BuildNow Telangana integration + RERA-TG quarterly filings + builder-side data ownership; no PII other than supervisor name + phone + site address" |
| Contact | rakesh@gigglezen.com / +91 79 8936 9571 |

Submit, then wait for the approval email (5–7 days). Their team
sometimes emails clarifying questions — respond within 24h to keep the
queue moving.

## What you receive

After approval you'll get:

```
Bhashini API key       — paste into .env.local as BHASHINI_API_KEY
Bhashini user ID       — for support tickets; not used in code
Pipeline endpoints     — already wired into supabase/functions/voice_transcribe/index.ts
```

## Wiring it up

1. Paste the key into `.env.local`:
   ```
   BHASHINI_API_KEY=<paste here>
   ```
2. Push to Supabase:
   ```
   node scripts/deploy/sync-function-secrets.mjs --only BHASHINI_API_KEY
   ```
3. Redeploy the voice EF:
   ```
   node scripts/deploy/deploy-edge-functions.mjs voice_transcribe
   ```
4. Smoke test from the dashboard:
   ```bash
   curl -X POST https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/voice_transcribe \
     -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"audio_sha256":"deadbeef","lang":"te","provider_order":["bhashini"]}'
   ```
   Expect `{"ok": true, "text": "...", "confidence": 0.xx, "provider": "bhashini"}`.

## Fallback while waiting for approval

The `voice_transcribe` EF works in mock mode if `VITEST=1` or
`NODE_ENV=test`. For the Sprint 2 mid-cycle demos, set
`SITETRACK_DRY_RUN=true` and the EF returns canned Telugu transcripts so
the rest of the DPR flow can be exercised end-to-end.

## Common rejections

- **"Use case too generic"** — re-submit with the explicit pilot
  builders named (e.g. "Vasavi Group, Lansum Properties") and the exact
  DPR shape.
- **"Compliance posture missing"** — add a one-line RERA registration
  number reference (TG/03/COMM/Hyderabad/...) once you have one.
- **"Volume estimate unrealistic"** — drop to 1,000–5,000/mo for the
  initial approval; you can request a volume bump later.

## Budget note

Bhashini is in `ALWAYS_FREE_PROVIDERS` (see `src/lib/budgetMode.js`).
No guard prevents the call. The only spend risk is if Bhashini changes
their tiering — we will catch that at the Sprint 2 acceptance gate when
the founder reviews monthly usage in their Bhashini portal.
