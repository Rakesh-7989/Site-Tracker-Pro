# Cashfree Subscription Onboarding — Wire-up Runbook

Cashfree is SiteTrack's primary subscription billing rail because the
majority of Indian builders pay monthly SaaS via UPI AutoPay, not credit
cards. Razorpay handles one-off invoice payments well (per-project, per-RA-
bill); Cashfree handles the recurring SaaS subscription itself.

## End-to-end flow

```
Org admin clicks "Upgrade plan"
        ↓
OrgBillingView.requestUpgrade()      ← src/features/org/index.jsx
        ↓
buildSubscriptionRequest(org, plan)  ← src/lib/cashfree.js
        ↓
POST /functions/v1/cashfree-subscription      (Supabase Edge Function)
        ↓
POST {cashfree}/pg/subscriptions     (server-to-server, signed with secret)
        ↓
Cashfree returns subscription_session_id
        ↓
Browser opens cashfree.session(session_id)  → UPI mandate UI
        ↓
User approves AutoPay mandate
        ↓
Cashfree fires webhook to /functions/v1/cashfree-webhook
        ↓
verifyWebhookSignature() validates HMAC SHA-256       ← src/lib/cashfree.js
        ↓
applyWebhookEvent(currentRow, event) returns next row
        ↓
UPSERT into subscriptions table  (service_role bypasses RLS)
        ↓
Realtime broadcast → OrgBillingView pill flips to "active"
```

## Required setup (one-time per environment)

### 1. Cashfree dashboard

1. Sign up at https://merchant.cashfree.com.
2. Complete KYC (PAN + GST + bank verification — takes 24-48h for Indian
   businesses).
3. Generate API keys: **Settings → API Keys**. You'll get:
   - `app_id`
   - `secret`
4. Create plans in the dashboard — **MUST match** the IDs in
   `buildSubscriptionRequest()`:
   - `sitetrack_basic_monthly` → ₹999
   - `sitetrack_pro_monthly` → ₹2,999
   - `sitetrack_business_monthly` → ₹7,999
5. Generate a webhook secret: **Settings → Webhooks → Add Secret**.
6. Whitelist your webhook URL: `https://<project>.supabase.co/functions/v1/cashfree-webhook`.

### 2. Per-org configuration (in-app)

The org admin pastes `app_id` and `secret` into **My Organization →
Integrations → Cashfree**. They live in the `org_integrations` table,
encrypted at rest by Supabase.

### 3. Supabase Edge Functions

Two functions to deploy (skeleton bodies belong in `supabase/functions/`):

#### `cashfree-subscription`

```ts
// supabase/functions/cashfree-subscription/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { org_id, payload } = await req.json();

  // 1. Load Cashfree creds from org_integrations
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: row } = await supa
    .from("org_integrations")
    .select("cashfree")
    .eq("org_id", org_id)
    .single();
  const { app_id, secret, env } = row?.cashfree || {};
  if (!app_id || !secret) return new Response("Cashfree not configured", { status: 400 });

  // 2. Forward to Cashfree
  const base = env === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
  const cfRes = await fetch(`${base}/subscriptions`, {
    method: "POST",
    headers: {
      "x-client-id": app_id,
      "x-client-secret": secret,
      "x-api-version": "2025-01-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await cfRes.json();

  // 3. Record subscription intent locally (pending)
  await supa.from("subscriptions").upsert({
    org_id,
    provider: "cashfree",
    external_id: json.subscription_id,
    plan: payload.plan_id.replace(/^sitetrack_|_monthly$/g, ""),
    status: "pending",
  });

  return new Response(JSON.stringify(json), { status: cfRes.status });
});
```

#### `cashfree-webhook`

```ts
// supabase/functions/cashfree-webhook/index.ts
import { verifyWebhookSignature, applyWebhookEvent } from "../_shared/cashfree.ts";

Deno.serve(async (req) => {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";
  const timestamp = req.headers.get("x-webhook-timestamp") || "";

  // Each org has its OWN webhook secret. Look up by Cashfree subscription_id
  // to find the right secret. (For Phase 1 you can use a SINGLE platform
  // secret stored in env — Cashfree supports both modes.)
  const secret = Deno.env.get("CASHFREE_WEBHOOK_SECRET")!;

  const ok = await verifyWebhookSignature({ rawBody, timestamp, signature, secret });
  if (!ok) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(rawBody);
  const subId = event.data?.subscription?.subscription_id;
  if (!subId) return new Response("No subscription_id", { status: 400 });

  // Load current row, apply event, write back.
  const { data: current } = await supa
    .from("subscriptions")
    .select("*")
    .eq("external_id", subId)
    .single();
  const next = applyWebhookEvent(current || {}, event);
  await supa.from("subscriptions").upsert(next);

  return new Response("ok");
});
```

The shared lib `supabase/functions/_shared/cashfree.ts` is a thin re-export
of `src/lib/cashfree.js` (same code, both runtimes).

## Webhook event types we handle

| Cashfree event                   | Our action                                     |
| -------------------------------- | ---------------------------------------------- |
| `SUBSCRIPTION_AUTHORIZED`        | status → `pending` (mandate signed)            |
| `SUBSCRIPTION_ACTIVATED`         | status → `active`, set `current_period_*`      |
| `SUBSCRIPTION_PAYMENT_SUCCESS`   | extend `current_period_end`                    |
| `SUBSCRIPTION_PAYMENT_FAILED`    | status → `past_due`, notify orgadmin           |
| `SUBSCRIPTION_PAUSED`            | status → `past_due`                            |
| `SUBSCRIPTION_CANCELLED`         | status → `cancelled`, downgrade to `basic`     |
| `SUBSCRIPTION_COMPLETED`         | status → `cancelled` (2-year term ended)       |

## Testing in sandbox

1. Set `env=sandbox` in the org's Cashfree integration row.
2. Use Cashfree test cards / test UPI:
   - Successful: `success@upi`
   - Failure: `failure@upi`
3. Watch the `subscriptions` table in Supabase Studio as you trigger events.
4. Verify the OrgBillingView pill flips between states without a manual reload
   (Supabase realtime should push the change).

## Failure modes

| Symptom                                | Likely cause                              | Fix                                          |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| 401 on /functions/v1/cashfree-webhook  | Webhook secret mismatch                   | Compare `CASHFREE_WEBHOOK_SECRET` to dash    |
| 400 "Cashfree not configured"          | `org_integrations.cashfree.app_id` empty  | Org admin must paste creds in Integrations   |
| `subscriptions` row never created      | Edge Function not deployed                | `supabase functions deploy cashfree-*`       |
| Pill stuck on "Mandate pending"        | Webhook not firing                        | Check webhook URL is publicly reachable      |
| Cashfree returns `INVALID_PLAN_ID`     | Plan not pre-created in dashboard         | Create the 3 monthly plans (see step 4)      |

## Security notes

- The `secret` field NEVER leaves the Edge Function. The browser only ever
  sees `app_id`. (Even masked, never expose the secret.)
- `verifyWebhookSignature()` uses constant-time string comparison to prevent
  timing attacks.
- Webhook timestamp + body are signed together — replay attacks need the
  exact original timestamp.
- The `subscriptions` table RLS denies all writes to `authenticated`; only
  `service_role` (used by Edge Functions) can write. Orgadmins CANNOT
  self-promote by editing the row.

## Related docs

- `docs/PRODUCTION_RLS.md` — the RLS gate this depends on.
- `docs/BACKEND_PLAN.md` — broader Supabase rollout plan.
- `docs/GOLIVE.md` — production go-live runbook.
