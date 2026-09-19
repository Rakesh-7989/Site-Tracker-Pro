# Supabase Edge Functions

| Function                | Purpose                                              | Auth                |
| ----------------------- | ---------------------------------------------------- | ------------------- |
| `razorpay-payment-link` | Create a Razorpay payment link for an invoice       | User JWT            |
| `razorpay-webhook`      | Receive payment_link/payment events from Razorpay   | Signature only      |

## Deploy

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

supabase functions deploy razorpay-payment-link
supabase functions deploy razorpay-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook because Razorpay doesn't send a Supabase JWT —
we verify its HMAC signature instead.

## Env vars (set in Supabase dashboard → Edge Functions → Secrets)

| Var                          | For                                 |
| ---------------------------- | ----------------------------------- |
| `SUPABASE_URL`               | both — auto-injected by Supabase    |
| `SUPABASE_SERVICE_ROLE_KEY`  | both — auto-injected by Supabase    |
| `RAZORPAY_KEY_ID`            | payment-link + webhook — from Razorpay |
| `RAZORPAY_KEY_SECRET`        | payment-link + webhook — from Razorpay |
| `RAZORPAY_WEBHOOK_SECRET`    | webhook only — from Razorpay dashboard |

## Test locally

```bash
supabase functions serve razorpay-payment-link --env-file .env.local
# In another terminal:
curl -X POST http://localhost:54321/functions/v1/razorpay-payment-link \
  -H "Authorization: Bearer <user JWT>" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<uuid>","plan":"pro","return_url":"http://localhost:5173/"}'
```

## Related runbooks

- `docs/setup/CONNECT_SUPABASE.md` — database + schema first
- `docs/integrations/MCP_TOOLKIT.md` — Supabase MCP can deploy/inspect functions