# SiteTrack Pro — Zero-Spend Policy (June 2026 → June 2027)

The founder (Rakesh Boyapati) has committed to **zero spend on software
or cloud services for the 12-month window from June 2026 to June 2027**.
This doc captures how that constraint is enforced in code, what the free-
tier inventory looks like, and what the approval workflow is when a paid
service becomes unavoidable.

## TL;DR

- `BUDGET_MODE=zero-spend` (default) blocks paid providers at call time.
- Set `BUDGET_MODE=paid` in `.env.local` only after founder approval.
- All call sites check `src/lib/budgetMode.js` (browser) or
  `supabase/functions/_shared/budget.ts` (EFs) before invoking any
  third-party service. Tests pin the JS+TS catalogs in lock-step.

## Enforcement points

| Layer | Guard | What it blocks |
|---|---|---|
| `voiceTranscribe.js` `pickProviderOrder()` | `isProviderAllowed('aws')` | AWS Transcribe call when zero-spend |
| `anchor-digest/index.ts` | `isProviderAllowed(networkToProvider(POLYGON_NETWORK))` | Polygon mainnet anchor when zero-spend; defaults to `polygon-amoy` testnet |
| `whatsapp_dpr_send/index.ts` | `whatsapp_quota_increment` RPC + monthly counter | Hard-blocks at 1,000 conversations/month per WABA unless `WHATSAPP_OVERRIDE_PAID=1` |
| `scripts/check-env-config.mjs` | Mode banner + provider classification | Surfaces budget-blocked configs to the founder at env-audit time |

## Free-tier inventory (verified, no payment method on file)

| Service | Free tier | Hard limit | Sprint use |
|---|---|---|---|
| **Vercel Hobby** | unlimited deploys, 100GB bandwidth/mo | non-commercial only — must flip when first paying customer signs | hosting React app |
| **Supabase Free** | 500MB Postgres, 5GB egress/mo, 500k EF invocations, 1GB storage | DB auto-pauses after 1 week of inactivity | DB + auth + Edge Functions + storage |
| **Resend Free** | 3,000 emails/month, 100/day, 1 verified domain | shared `onboarding@resend.dev` unless domain verified | transactional email, founder digest |
| **Sentry Developer** | 5k errors/mo, 7-day retention, 1 user | no team features | error monitoring |
| **GitHub Free** | unlimited repos, 2k Actions min/mo | Actions cap | source + CI |
| **Bhashini API** | free for startups (application-gated, 5-7 day approval) | TBD per-call cap | Telugu + Hindi voice → text |
| **Telegram Bot API** | 100% free, no limits | no WhatsApp-grade reach | alerts, founder digest (alternate) |
| **WhatsApp Cloud API (Meta)** | 1,000 service conversations/mo per WABA | hard cap; guard refuses past 1k | promoter daily digest |
| **Cashfree** | no monthly fee, 2% per txn | charge only when collecting payment | pilot subscription billing |
| **Polygon Amoy testnet** | free MATIC from faucet | testnet only — no marketing claim | mock blockchain anchors during dev |

## Paid services to AVOID this year

| Service | Cost | Free alternative |
|---|---|---|
| **AWS Transcribe** | ~$0.024/min audio | Bhashini-only mode. AWS path is preserved in code but gated; flip `BUDGET_MODE=paid` to re-enable |
| **WhatsApp Business API beyond 1k/mo** | $0.005 / template msg | Stay under 1k/mo via `whatsapp_quota_counter` enforcement; switch overflow to Telegram |
| **Polygon Mainnet gas** | ~₹0.50 per anchor tx | Polygon Amoy testnet (default) until pilot signs + budget unlocks |
| **OpenAI / Anthropic API** | per-token | Defer — no AI feature is gate-blocking for Sprint 1+2 |
| **AWS S3 / R2 storage** | per-GB | Supabase Storage free tier (1GB) covers Sprint 2 |
| **Vercel Pro** | $20/mo | Stay on Hobby until first paying customer |
| **Supabase Pro** | $25/mo | Stay on Free tier; watch 500MB DB cap |

## Approval workflow for new paid dependencies

When a build step would cross into paid territory:

```
🚨 PAID SERVICE FLAG
Service: <name>
Cost estimate: <₹X/mo or ₹X per use>
Why needed: <one-line justification>
Free alternative: <name + tradeoff>
Decision needed: proceed paid / use alternative / defer
```

Do NOT proceed without an explicit decision from the founder. When in
doubt, default to deferring.

## Flipping out of zero-spend mode (future)

When the first pilot signs (₹29,999/yr cash in hand) and the founder is
ready to enable paid surfaces:

1. Add `BUDGET_MODE=paid` to `.env.local`.
2. Run `node scripts/sync-function-secrets.mjs` to push the new env to
   Supabase function secrets.
3. Run `node scripts/check-env-config.mjs` — banner should read
   `💳 Budget mode: paid`.
4. Re-deploy the affected EFs.

The code path doesn't change — only the guards relax.

## Catalog of provider classifications

See `src/lib/budgetMode.js` (`PAID_PROVIDERS`, `CAPPED_FREE_PROVIDERS`,
`ALWAYS_FREE_PROVIDERS`) and `supabase/functions/_shared/budget.ts`
(same sets, TypeScript mirror). The two files are tested for parity in
`tests/budgetMode.test.js` so they cannot drift.

When wiring a new third-party dependency, add it to ONE of the three
sets in BOTH files. If you forget, the test suite will catch the drift,
and `classifyProvider()` will return `'unknown'` which is treated as
blocked.
