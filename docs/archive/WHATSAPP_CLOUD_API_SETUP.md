# WhatsApp Cloud API Setup — Daily Promoter Digest

**Cost:** 📊 1,000 service conversations/month per WABA = free. Beyond
that, ₹0.40 per conversation (utility template). Guard refuses sends
past 1k unless `WHATSAPP_OVERRIDE_PAID=1`.
**Setup time:** 30–60 min (mostly Meta Business Manager paperwork).
**Why we use it:** Sprint 2 proof point — DPR → 7am WhatsApp digest to
promoter. The founder's #1 differentiator vs Powerplay.

## Prerequisites

1. **Personal Facebook account** (for Business Manager login).
2. **A phone number** that is NOT already on WhatsApp Personal /
   Business app. Either a fresh SIM (cheap, ~₹50) or your existing
   GiggleZen-registered number — but only ONE WhatsApp installation
   per number, so detach it from the regular app first.
3. **Display name approval** — Meta reviews this; usually 1–2 days.
4. **GST number** (already have it for GiggleZen Technologies).

## Step 1 — Meta Business Manager

1. Go to https://business.facebook.com/ → **Create Account**.
2. Business name: **GiggleZen Technologies**.
3. Your name: **Rakesh Boyapati**.
4. Business email: `rakesh@gigglezen.com`.
5. Add a business phone (same as personal mobile is OK).

## Step 2 — Create a WhatsApp Business Account (WABA)

1. In Business Manager → **All Tools** → **WhatsApp Manager**.
2. Click **Get Started**.
3. Pick **Send messages from your own app** (NOT "Use third party").
4. Add a phone number — the one you set aside above.
5. Display name: **SiteTrack** (short, brandable, Meta-approved).
6. Submit for verification. ~1–2 day review.

## Step 3 — Create a Meta App

1. https://developers.facebook.com/apps/ → **Create App**.
2. Type: **Business**.
3. App name: `sitetrack-pro`.
4. Add **WhatsApp** product to the app.

## Step 4 — Get the credentials we need

From the WhatsApp product config page:

| Credential | Where to find | Goes into |
|---|---|---|
| **Phone number ID** | WhatsApp → API Setup → "From" dropdown | `WHATSAPP_PHONE_NUMBER_ID` |
| **WhatsApp Business Account ID** | Same page, top-right | `WHATSAPP_BUSINESS_ACCOUNT_ID` |
| **Temporary access token (24h)** | Same page, blue token blob | DO NOT use; we need a PERMANENT one |
| **Permanent access token** | Business Settings → System Users → Add System User → Generate Token (scopes: `whatsapp_business_messaging` + `whatsapp_business_management`) | `WHATSAPP_PERMANENT_TOKEN` |
| **Webhook verify token** | Make up a random string (e.g. `uuidgen`) — Meta echoes it back when verifying your webhook | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |

## Step 5 — Wire it up

1. Paste all 4 into `.env.local`.
2. Push to Supabase:
   ```
   node scripts/deploy/sync-function-secrets.mjs --only WHATSAPP_PHONE_NUMBER_ID,WHATSAPP_BUSINESS_ACCOUNT_ID,WHATSAPP_PERMANENT_TOKEN,WHATSAPP_WEBHOOK_VERIFY_TOKEN
   ```
3. Apply migration 57 (creates the quota counter table):
   ```
   psql "$SUPABASE_DB_URL" -f scripts/supabase/57_whatsapp_quota_counter.sql
   ```
4. Redeploy the WhatsApp EFs:
   ```
   node scripts/deploy/deploy-edge-functions.mjs whatsapp_dpr_send whatsapp-send promoter_digest_cron
   ```
5. Dry-run smoke test — set `SITETRACK_DRY_RUN=true`, send a test
   payload via `curl`:
   ```bash
   curl -X POST https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/whatsapp_dpr_send \
     -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"client_token":"test-1","org_id":"o-1","promoter_phone_e164":"+919876543210","language":"te"}'
   ```
   Expect `{"ok": true, "status": "sent", "meta_message_id": "wamid.DRY_RUN_..."}`.

## Step 6 — Test a real send (zero-spend mode)

1. Remove `SITETRACK_DRY_RUN` from `.env.local`.
2. Re-sync + redeploy.
3. From the WhatsApp Manager, send a test message via the "API Setup"
   tab to your own number — confirms Meta is happy with your config.
4. Then send via SiteTrack:
   ```bash
   curl -X POST https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/whatsapp_dpr_send \
     -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"client_token":"test-real-1","org_id":"o-1","promoter_phone_e164":"+919876543210","language":"te","transcript_text":"Test from SiteTrack."}'
   ```
5. Check the `whatsapp_quota_counter` table — should show `sent_count: 1`
   for the current month.

## Free-tier accounting

Meta's "1k free service conversations / month / WABA" works on a UTC
calendar. A **service conversation** = a 24-hour window opened by a
**user-initiated message** (e.g. promoter messages the SiteTrack
number, then we can reply free for 24h). For our flow — supervisor's
DPR → promoter daily — we send **utility template messages** instead,
which also count toward the 1k free tier (Meta changed the model in
July 2024).

The guard meters every non-dry-run send. Soft warn at 800/mo; hard
block at 1000/mo unless `WHATSAPP_OVERRIDE_PAID=1`.

Current cap math:
- 1 pilot × 1 promoter × 1 daily digest = 30 sends/month
- 5 pilots × 1 promoter each × 1 daily digest = 150 sends/month
- 10 pilots × 2 promoters each × 1 daily digest = 600 sends/month

Easily under cap until ~15+ active pilots.

## When you cross the cap

1. The 1001st send returns HTTP 402 with `error: "whatsapp quota
   exceeded: 1001/1000..."`.
2. The dashboard surfaces this distinctly (failure_reason starts with
   `budget-blocked:`).
3. Founder approves the overage spend in writing.
4. Flip `WHATSAPP_OVERRIDE_PAID=1` in `.env.local`, sync + redeploy.
5. Track spend monthly via `whatsapp_quota_counter` table query.

## Common rejections

- **"Display name not approved"** — Meta sometimes rejects "SiteTrack"
  for being generic. Try "SiteTrack Pro" or "SiteTrack by GiggleZen".
- **"Phone number already on WhatsApp"** — must fully delete the
  WhatsApp app and confirm via SMS that the number is detached, then
  retry.
- **"Need GST"** — provide GST number 36AAJCG1234A1Z5 (GiggleZen's).

## What this does NOT cover

- Marketing template messages (different tier; not in Sprint 2 scope).
- Inbound messages from the promoter to the SiteTrack number — handled
  separately by the `whatsapp_webhook` EF, wired in Sprint 3.
