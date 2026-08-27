# WhatsApp Business API Verification — Application Runbook

The Business plan ships native WhatsApp Business API (auto-DPR at 6 PM,
invoice links, RA-bill notifications). The verification process takes
8 weeks from start to first message sent — so it must begin NOW, in
parallel with all other launch work.

This runbook walks through every form, document and follow-up.

---

## Why the long timeline?

WhatsApp does not let any business send programmatic messages without:

1. A **verified business** (Facebook Business Manager + government docs).
2. A **WhatsApp Business Account (WABA)** approved by Meta.
3. A **display phone number** that has never been on personal WhatsApp.
4. **Message templates** pre-approved by Meta for transactional / utility use.

Each step has 1-2 week review periods. Most rejections come from
**template wording** — Meta does not allow marketing language in
utility templates.

---

## Phase 1 — Facebook Business Manager (Week 1-2)

### Documents you need to have ready

| Document                       | Format       | Source                                |
| ------------------------------ | ------------ | ------------------------------------- |
| Certificate of Incorporation   | PDF          | MCA21 portal (`http://www.mca.gov.in`)|
| GST registration certificate   | PDF          | GST portal (`https://gst.gov.in`)     |
| PAN of company                 | PDF / image  | Already issued                         |
| Director's PAN                 | PDF / image  | —                                     |
| Address proof                  | Utility bill PDF | Last 3 months                      |
| Authorised signatory letter    | PDF + sign   | Letterhead template — see below       |

### Steps

1. Go to `https://business.facebook.com/overview`.
2. **Create Business Account** → "GiggleZen Technologies Pvt. Ltd."
3. **Business Settings → Business Info** — fill exact details from your
   Certificate of Incorporation.
4. **Security Center → Business Verification → Start Verification**.
5. Upload Certificate of Incorporation + Utility Bill (both ≤6 months old).
6. Verification confirmation phone call: Meta calls the registered business
   phone in ~5-10 business days. Answer it.
7. Receive **"Business verified"** badge → proceed to Phase 2.

### Authorised signatory letter template

```
GiggleZen Technologies Private Limited
[Registered office address]
[Date]

To: Meta Platforms, Inc.

Subject: Authorisation to manage WhatsApp Business Account

We hereby authorise Rakesh Boyapati, Founder & CEO (DIN: ●●●●●●●●),
to act on behalf of GiggleZen Technologies Pvt. Ltd. for all matters
related to the Meta Business Account verification, WhatsApp Business
Account setup, and template message approval.

We confirm that all submitted documents are genuine and that we will
comply with the WhatsApp Business Messaging Policy.

For GiggleZen Technologies Pvt. Ltd.

_________________________
[Director name]
Director
DIN: ●●●●●●●●

Affix company seal.
```

Print, sign in blue ink, scan as PDF.

---

## Phase 2 — WhatsApp Business Account (Week 3-4)

### Get a dedicated phone number

Critical: **the number must NEVER have been on personal WhatsApp**. If
you used your personal SIM with WhatsApp, you cannot use that number.

Recommended: buy a fresh corporate SIM (Airtel / Jio business
plans). Keep this SIM in a basic phone in your office — Meta sends OTPs
here for the entire WABA lifetime.

### Create the WhatsApp Business Account

1. Business Manager → **Accounts → WhatsApp Accounts → Add**.
2. Pick your verified business.
3. Enter the new phone number. Meta sends an OTP — enter it.
4. Pick **display name** — what your customers see in their WhatsApp inbox:
   - Suggested: **"SiteTrack — by GiggleZen"**
   - Must include your registered business name (GiggleZen).
   - No marketing words ("Best", "Top", etc.) — auto-rejected.
5. Pick **business category**: `Professional Services → Software`.
6. Upload **business logo** (≥640×640 PNG, transparent background).
7. Submit → wait 2-5 business days for display name approval.

---

## Phase 3 — Cloud API setup (Week 5)

Meta now hosts the WhatsApp Business API directly (no BSP needed). This
is what `src/lib/cashfree.js`-style code talks to.

1. Business Manager → **WhatsApp Accounts → [Your WABA] → API Setup**.
2. Click **Generate access token** — copy it (this is the long-lived
   token; never expose in browser).
3. Note your **Phone Number ID** (numeric, ~15 digits).
4. Note your **WhatsApp Business Account ID** (numeric).
5. Set up the **webhook URL** (the Supabase Edge Function that will
   receive incoming messages + delivery receipts):
   - URL: `https://<your-supabase-project>.supabase.co/functions/v1/whatsapp-webhook`
   - Verify token: generate a random 32-char hex string. Save in env vars.
   - Subscribe to: `messages`, `message_status`, `message_template_status_update`.

### Store credentials in SiteTrack

1. Sign in to your SiteTrack instance as orgadmin.
2. Navigate **My Organization → Integrations → WhatsApp Business**.
3. Paste:
   - **phone_id**: from Step 3 above
   - **token**: from Step 2 above
   - **template_id**: leave blank until Phase 4 templates approved
4. Save.

These values land in `org_integrations` table (one row per org, encrypted
at rest by Supabase). They never travel in the browser bundle.

---

## Phase 4 — Template approval (Week 6-8) — THE LONG ONE

Each template needs Meta review. Submit ALL templates at once (parallel
review). Expect 1-2 week review per template.

### Required templates for SiteTrack v1

| Template name              | Category   | Language | Purpose                                          |
| -------------------------- | ---------- | -------- | ------------------------------------------------ |
| `dpr_daily_report`         | Utility    | en, te, hi | The 6 PM Daily Site Report                       |
| `invoice_payment_link`     | Utility    | en, te, hi | "Invoice INV-001 ready · ₹X · pay via UPI"       |
| `ra_bill_submitted`        | Utility    | en, te, hi | RA bill submitted notification to architect      |
| `drawing_released`         | Utility    | en, te, hi | New drawing version released                     |
| `high_severity_issue`      | Utility    | en, te, hi | HIGH severity issue opened                       |
| `welcome_onboarding`       | Utility    | en, te, hi | First message after onboarding completes         |

### Template wording — examples

**dpr_daily_report (Telugu):**
```
🏗️ {{1}} — Daily Site Report
Date: {{2}}
Progress: {{3}}%
Workers on site: {{4}}
Open HIGH issues: {{5}}

Full report PDF: {{6}}

— SiteTrack by GiggleZen
```

Parameters:
- `{{1}}` project_name
- `{{2}}` date (Indian format: 26 May 2026)
- `{{3}}` progress percentage
- `{{4}}` worker count
- `{{5}}` open high-severity issue count
- `{{6}}` short URL to PDF (use bit.ly or your own redirect)

**Forbidden words in templates:**
- "Buy", "Sale", "Offer", "Free", "Discount" → auto-rejected (marketing flag)
- "Click here" without URL preview → flagged
- Emoji density >2 per message → flagged

### Submission

1. Business Manager → **WhatsApp Accounts → Message Templates → Create Template**.
2. For each template above:
   - Pick **Category: Utility** (never Marketing — utility has higher
     deliverability + lower spam penalty).
   - Pick languages — submit en + te + hi all at once.
   - Paste body with `{{N}}` placeholders matching the parameters above.
   - Add optional **footer**: "Reply STOP to unsubscribe."
   - Submit.
3. Review status visible inline: Pending → Approved / Rejected.
4. If Rejected: read reason. Common ones:
   - "Marketing language detected" → remove sale words
   - "Generic template" → add more context-specific tokens
   - "Suspicious URL" → use bit.ly or your own domain
5. Resubmit. Each resubmission counts against your template limit (250
   active templates / WABA, plenty of headroom).

### Once approved

Each approved template returns a `template_id` (UUID). Store the mapping
in `org_integrations.whatsapp.template_ids` for SiteTrack to use:

```json
{
  "phone_id": "...",
  "token": "...",
  "template_ids": {
    "dpr_daily_report": "uuid-1",
    "invoice_payment_link": "uuid-2",
    "ra_bill_submitted": "uuid-3",
    "drawing_released": "uuid-4",
    "high_severity_issue": "uuid-5",
    "welcome_onboarding": "uuid-6"
  }
}
```

---

## Phase 5 — First message + monitoring (Week 8)

### Send a test from the Meta playground

1. Business Manager → **API Setup → Test Send**.
2. Enter a test recipient phone number (your own — must be on WhatsApp).
3. Pick `welcome_onboarding` template, language `en`.
4. Send. You should receive it within 30 seconds.

If that works → wire the Supabase Edge Function `whatsapp-send` to call
the same Graph API endpoint. The function reads creds from
`org_integrations` and templates from `org_integrations.whatsapp.template_ids`.

### Set quality rating monitoring

WhatsApp tracks a **quality rating** per phone number (Green / Yellow / Red).
Red = rate-limited or banned. Triggers:

- Too many users reporting your messages as spam
- High block rate
- Sending without consent

Set up a daily check:

```sql
-- Run this in Supabase SQL Editor weekly
select count(*) as messages_sent,
       count(*) filter (where status='delivered') as delivered,
       count(*) filter (where status='read') as read
from whatsapp_log
where ts > now() - interval '7 days';
```

Aim for: delivered ≥ 95%, read ≥ 60%. Below those → audit which templates
are firing too often + add an unsubscribe flow.

---

## Cost expectations

WhatsApp Business charges per **conversation** (24-hour window per
user-business pair):

| Conversation type | India rate (2026)    |
| ----------------- | -------------------- |
| Utility           | ₹0.50 per conversation |
| Authentication    | ₹0.40 per conversation |
| Marketing         | ₹0.95 per conversation |
| Service (user-initiated) | Free first 1000 / month |

**Estimate for first 20 customers:**

- 20 orgs × 5 projects × 1 DPR/day × 5 recipients = 500 conversations/day
- = 15,000/month
- × ₹0.50 utility rate
- = **₹7,500/month total** for the whole platform

Pass-through to customer at ₹0.75/conversation → ₹3,750/month margin per
20 customers. Modest, but signals serious product investment.

---

## Failure response

If Meta sends "WABA suspended" email:

1. Don't panic. Read the reason.
2. Most common: a single rogue template fired too often → de-activate it.
3. Reply within the 48-hour window with: business verification proof,
   template approval history, opt-in evidence.
4. Wait 5 business days for review.
5. If permanently banned → you've lost the phone number, not the
   business. Get a new corporate SIM and restart at Phase 2.

This is rare for utility-only senders with proper opt-in. The risk is
real for marketing-heavy senders.

---

## Related runbooks

- `docs/setup/CONNECT_SUPABASE.md` — database + Edge Function deployment
- `docs/setup/CASHFREE_ONBOARDING.md` — subscription billing (uses the same Edge Function pattern)
- `docs/architecture/PRODUCTION_RLS.md` — RLS gate before any customer onboarding

---

## Timeline checkpoint

Track progress in this section. Update weekly.

- [ ] Week 1: Documents collected, Business Manager created
- [ ] Week 2: Business verification submitted, phone call done
- [ ] Week 3: Corporate SIM purchased, WABA created
- [ ] Week 4: Display name approved
- [ ] Week 5: Cloud API tokens generated, webhook URL set
- [ ] Week 6: All 6 templates submitted in 3 languages
- [ ] Week 7: First template approvals coming back
- [ ] Week 8: All templates approved, first production DPR sent
- [ ] Week 9: Quality rating Green, first 20 customers receiving WhatsApp DPRs
