# Production Wiring Setup Guides

The founder runs through these walkthroughs ONCE to wire SiteTrack Pro
to its third-party services. Every step honours the zero-spend policy
(`docs/business/ZERO_SPEND_POLICY.md`) — paid surfaces are flagged + alternatives
documented.

## Order of operations

| # | Guide | Cost | Approval time | Blocks |
|---|---|---|---|---|
| 1 | [Sentry](SENTRY_SETUP.md) | 📊 free 5k errors/mo | 5 min | Error visibility during pilots |
| 2 | [Bhashini API](BHASHINI_API_SETUP.md) | 🆓 free for startups | 5–7 days | Telugu voice transcription |
| 3 | [Polygon Amoy](POLYGON_AMOY_SETUP.md) | 🆓 free testnet | 30 min | Audit anchor demo |
| 4 | [WhatsApp Cloud API](WHATSAPP_CLOUD_API_SETUP.md) | 📊 1k free/mo | 30–60 min + 1–2 day Meta review | Promoter daily digest |
| 5 | [Resend SMTP](../RESEND_SMTP_SETUP.md) | 📊 free 3k emails/mo | 5–15 min + DNS propagation | Sign-up + transactional email |
| 6 | Cashfree subscriptions | 📊 2% per txn | deferred | Pilot billing — wire when first pilot signs |

## Verification

After each step:

```bash
# Audit which Edge Functions are now ready
node scripts/dev/check-env-config.mjs

# Confirm budget mode is correct
node scripts/ci/verify-budget-config.mjs
```

When the env audit shows all required keys present:

```bash
# Push to Supabase
node scripts/deploy/sync-function-secrets.mjs

# Bulk redeploy the affected EFs
node scripts/deploy/deploy-edge-functions.mjs
```

## What NOT to wire yet

These services are intentionally skipped during the zero-spend window:

- **AWS Transcribe** — stripped from `voiceTranscribe.js` auto chain.
  Keys may sit in `.env.local` but the guard refuses them at call time.
- **Polygon Mainnet** — wired but inactive. Default network is Amoy
  testnet.
- **OpenAI / Anthropic API** — no Sprint 1/2 feature depends on AI.
  Defer to Sprint 4 if at all.

## When in doubt

`docs/business/ZERO_SPEND_POLICY.md` is the authoritative source. If you discover
a new third-party dependency, add it to the provider catalog in BOTH
`src/lib/budgetMode.js` AND `supabase/functions/_shared/budget.ts` — the
test suite enforces parity.
