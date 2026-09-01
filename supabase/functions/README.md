# Supabase Edge Functions

| Function                | Purpose                                              | Auth                |
| ----------------------- | ---------------------------------------------------- | ------------------- |
| `cashfree-subscription` | Create a Cashfree subscription intent for an org    | User JWT (orgadmin) |
| `cashfree-webhook`      | Receive lifecycle events from Cashfree, update subs | Signature only      |
| `razorpay-payment-link` | Create a Razorpay payment link for an invoice       | User JWT            |
| `razorpay-webhook`      | Receive payment_link/payment events from Razorpay   | Signature only      |

## Deploy

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

supabase functions deploy cashfree-subscription
supabase functions deploy cashfree-webhook --no-verify-jwt
supabase functions deploy razorpay-payment-link
supabase functions deploy razorpay-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhooks because Cashfree/Razorpay don't send a
Supabase JWT — we verify their HMAC signatures instead.

## Env vars (set in Supabase dashboard → Edge Functions → Secrets)

| Var                          | For                                      |
| ---------------------------- | ---------------------------------------- |
| `SUPABASE_URL`               | both — auto-injected by Supabase         |
| `SUPABASE_SERVICE_ROLE_KEY`  | both — auto-injected by Supabase         |
| `CASHFREE_WEBHOOK_SECRET`    | webhook only — from Cashfree dashboard   |
| `RAZORPAY_KEY_ID`            | payment-link + webhook — from Razorpay    |
| `RAZORPAY_KEY_SECRET`        | payment-link + webhook — from Razorpay    |
| `RAZORPAY_WEBHOOK_SECRET`    | webhook only — from Razorpay dashboard    |

## Test locally

```bash
supabase functions serve cashfree-subscription --env-file .env.local
# In another terminal:
curl -X POST http://localhost:54321/functions/v1/cashfree-subscription \
  -H "Authorization: Bearer <user JWT>" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<uuid>","plan":"pro","return_url":"http://localhost:5173/"}'
```

## Shared code

`_shared/cashfree.ts` mirrors `src/lib/integrations/cashfree.ts` (browser ESM) for the Deno
runtime. Same logic, two implementations because Edge Functions can't bundle
node_modules. They MUST stay in sync — when one changes, change both.

## Related runbooks

- `docs/setup/CASHFREE_ONBOARDING.md` — end-to-end Cashfree setup
- `docs/setup/CONNECT_SUPABASE.md` — database + schema first
- `docs/integrations/MCP_TOOLKIT.md` — Supabase MCP can deploy/inspect functions
