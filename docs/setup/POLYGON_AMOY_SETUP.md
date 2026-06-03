# Polygon Amoy Testnet Setup — Audit Anchor

**Cost:** 🆓 free MATIC from faucet, free RPC, free testnet block space.
**Setup time:** 30 min including contract deploy.
**Why we use it:** Sprint 2 proof point #4 — DPR audit log gets a daily
Merkle root anchored on Polygon. Mainnet is paid (~₹0.50/anchor); Amoy
testnet is free and works exactly the same way technically.

**Why Amoy specifically:** Polygon retired Mumbai testnet in April 2024
and replaced it with Amoy. Mumbai endpoints will return errors;
**always use Amoy for testnet work**.

## Limitations of testnet

- The anchor is verifiable on `https://amoy.polygonscan.com/` — same UX
  as mainnet — BUT a sophisticated buyer might note "this is testnet,
  not mainnet." For demo and pilot purposes the proof concept works;
  for marketing / sales claims we wait until the first pilot signs and
  the founder approves mainnet spend.
- Don't show Amoy explorer URLs to prospects without context. The
  Sprint 2 demo says "blockchain-proof badge on every DPR" — show the
  UX, not the explorer.

## Step 1 — Create a deployer wallet

1. Open MetaMask (browser extension; free).
2. Create a new account specifically for SiteTrack dev — DON'T reuse
   personal funds.
3. Copy the 12-word seed phrase to a password manager. Don't lose it.
4. Copy the deployer address (looks like `0xA1B2…`). This goes into
   audit-anchor scripts as the deployer-of-record.

## Step 2 — Configure Amoy in MetaMask

1. MetaMask → Networks → **Add Network** → **Add a network manually**.
2. Fields:
   ```
   Network name:        Polygon Amoy Testnet
   New RPC URL:         https://rpc-amoy.polygon.technology
   Chain ID:            80002
   Currency symbol:     MATIC
   Block explorer:      https://amoy.polygonscan.com
   ```
3. Save. Switch to the new network.

## Step 3 — Fund the deployer wallet from the faucet

1. Go to https://faucet.polygon.technology/.
2. Pick **Amoy** + **MATIC**.
3. Paste your deployer address.
4. Solve the captcha.
5. Wait 30 seconds → 0.5 MATIC arrives. That's enough for ~50 anchor
   transactions during Sprint 2.

If the faucet is rate-limited, alternates:
- https://www.alchemy.com/faucets/polygon-amoy (requires Alchemy
  signup — free)
- https://amoyfaucet.com/ (no signup)

## Step 4 — Deploy the contract

```bash
# From the repo root
cd contracts
npm install                          # one-time
cp .env.example .env
# Edit .env: paste deployer private key (no 0x prefix)
npx hardhat run scripts/deploy.js --network amoy
```

The deploy script prints:

```
SiteTrackAuditAnchor deployed to: 0x1234...abcd
Transaction hash: 0xdead...beef
Gas used: 487231
```

Copy the contract address.

## Step 5 — Wire env vars

In `.env.local`:

```
POLYGON_NETWORK=polygon-amoy
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_CONTRACT_ADDRESS=0x1234...abcd   # from step 4
POLYGON_SIGNER_PRIVATE_KEY=<deployer pk, hex>
CRON_SECRET=<random string for the cron auth header>
```

Push:

```bash
node scripts/sync-function-secrets.mjs --only POLYGON_NETWORK,POLYGON_RPC_URL,POLYGON_CONTRACT_ADDRESS,POLYGON_SIGNER_PRIVATE_KEY,CRON_SECRET
node scripts/deploy-edge-functions.mjs anchor-digest
```

## Step 6 — Smoke test the EF

```bash
curl -X POST "https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/anchor-digest?dry=1" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expect `{"day": "...", "status": "dry-run", "merkle_root": "0x...", "row_count": N}`.

Then run a real anchor (yesterday's rows):

```bash
curl -X POST "https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/anchor-digest" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expect `{"status": "confirmed", "tx_hash": "0x...", "block_number": NNN}`.

Verify on the explorer: https://amoy.polygonscan.com/tx/0x...

## Step 7 — Schedule the daily cron

Already provisioned in `migrations/contracts/README.md` as a
`pg_cron.schedule()` call. To enable:

```sql
-- From Supabase SQL Editor
SELECT cron.schedule(
  'daily-audit-anchor',
  '30 0 * * *',                                  -- 00:30 UTC = 06:00 IST
  $$
  SELECT net.http_post(
    url := 'https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/anchor-digest',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT cron_secret FROM secrets_keystore))
  );
  $$
);
```

## Switching to mainnet (LATER — requires founder approval)

1. Founder approves the ~₹25/mo Polygon mainnet spend (50 anchors × ₹0.50).
2. Set `BUDGET_MODE=paid` in `.env.local`.
3. Set `POLYGON_NETWORK=polygon-mainnet`.
4. Set `POLYGON_RPC_URL=https://polygon-rpc.com`.
5. Re-deploy the contract on mainnet (different address — same code).
6. Set `POLYGON_CONTRACT_ADDRESS` to the mainnet address.
7. Fund the mainnet deployer wallet with ~₹500 worth of MATIC (~50
   MATIC; price varies).
8. `sync-function-secrets.mjs` + `deploy-edge-functions.mjs anchor-digest`.
9. First mainnet anchor smoke-test — expect `status: confirmed` on a
   real Polygonscan transaction.

The code path is **identical** between testnet and mainnet — only the
RPC URL + contract address + network name change. No code changes
needed when flipping. Just the env + the founder's wallet.
