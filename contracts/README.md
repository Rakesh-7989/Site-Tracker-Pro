# SiteTrack Pro — On-Chain Audit Anchor

A 60-line Solidity contract that pins our daily audit-log Merkle root to
Polygon mainnet. Together with [src/lib/blockchainAnchor.js](../src/lib/blockchainAnchor.js)
and [supabase/functions/anchor-digest/](../supabase/functions/anchor-digest)
this is the full tamper-evidence vertical.

```
audit_log_v2 (yesterday)
       │
       ▼
hashAuditRow per row  ──►  [h1, h2, h3, …]
       │
       ▼
merkleRoot()  ──►  32-byte root
       │
       ▼
polygonAdapter.anchor(root)
       │
       ▼
AuditAnchor.anchor(bytes32)  on Polygon mainnet
       │
       ▼
event Anchored(root, ts, by)
       │
       ▼
audit_anchors row (day, root, tx_hash, block_number)
```

---

## Three deploy paths (pick one)

### Path A — Remix (zero install, 5 minutes)

1. Open https://remix.ethereum.org
2. File → Create new → paste `AuditAnchor.sol`
3. Solidity Compiler tab → set version `0.8.20+` → Compile
4. Deploy & Run tab → Environment = "Injected Provider (MetaMask)"
5. In MetaMask: switch network to **Polygon Mumbai** (testnet first)
   - Free MATIC from https://faucet.polygon.technology
6. Click **Deploy** → confirm in MetaMask
7. Copy the deployed contract address — paste into your `.env.local`:
   ```
   POLYGON_CONTRACT_ADDRESS=0x…
   POLYGON_RPC_URL=https://rpc-mumbai.maticvigil.com
   ```
8. After 1 successful Mumbai test (call `anchor(bytes32(uint(1)))` from Remix),
   switch MetaMask to **Polygon Mainnet** and repeat. Cost: ~₹2 in MATIC.

### Path B — Foundry (CLI, recommended for prod)

```bash
# Install Foundry once
curl -L https://foundry.paradigm.xyz | bash
foundryup

# From repo root
forge create contracts/AuditAnchor.sol:AuditAnchor \
  --rpc-url $POLYGON_RPC_URL \
  --private-key $POLYGON_SIGNER_PRIVATE_KEY \
  --legacy
```

Output line:
```
Deployer: 0xYOUR_ADDR
Deployed to: 0xCONTRACT_ADDR
Transaction hash: 0xTX
```

Copy `Deployed to` → `POLYGON_CONTRACT_ADDRESS`.

### Path C — Hardhat (if you already use it)

```bash
npm i -D hardhat
npx hardhat init   # pick "empty config"
# Drop AuditAnchor.sol into contracts/
# Write scripts/deploy.js using hre.ethers
npx hardhat run scripts/deploy.js --network polygon
```

---

## Verifying after deploy

```bash
# 1. Read the contract's owner (should be your signer address)
cast call $POLYGON_CONTRACT_ADDRESS "owner()(address)" --rpc-url $POLYGON_RPC_URL

# 2. Read anchorCount (0 initially)
cast call $POLYGON_CONTRACT_ADDRESS "anchorCount()(uint256)" --rpc-url $POLYGON_RPC_URL

# 3. Trigger a test anchor (only owner can)
cast send $POLYGON_CONTRACT_ADDRESS "anchor(bytes32)" \
  0x0000000000000000000000000000000000000000000000000000000000000001 \
  --rpc-url $POLYGON_RPC_URL --private-key $POLYGON_SIGNER_PRIVATE_KEY

# 4. Confirm event emitted
cast logs --address $POLYGON_CONTRACT_ADDRESS \
  "Anchored(bytes32,uint256,address)" --rpc-url $POLYGON_RPC_URL
```

If all four succeed, the contract is live. The lib already knows how to
ABI-encode `anchor(bytes32)` via the hard-coded selector `0xeecdf927`.

---

## Daily cron — automatic anchoring

The Supabase Edge Function at [supabase/functions/anchor-digest/](../supabase/functions/anchor-digest)
runs daily at 00:30 IST via `pg_cron`:

```sql
-- Run once after deploying the contract + EF
select cron.schedule(
  'daily-audit-anchor',
  '30 0 * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT.functions.supabase.co/anchor-digest',
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_token'))
    );
  $$
);
```

Set `app.cron_token` to a strong shared secret (same one the EF expects in env).

---

## Cost expectations

| Item | Polygon Mumbai (test) | Polygon Mainnet (prod) |
|---|---|---|
| Deploy | Free (faucet MATIC) | ~₹3-5 one-time |
| One anchor call | Free | ~₹0.05-0.10 |
| 365 anchors / year | Free | **~₹25-40 / year** |

The Indian-builder competitive moat — "court-admissible tamper-evidence" —
costs us less per year than one Maggi packet.

---

## Security

- The signer private key (`POLYGON_SIGNER_PRIVATE_KEY`) lives **only** in
  Supabase EF env vars. Never in `.env.local`, never in the browser bundle.
- `owner` controls who can `anchor()`. Rotate via `transferOwnership()`.
- The contract has **no admin escape hatch** — it cannot edit past events,
  cannot drain funds (it doesn't hold any), cannot self-destruct. Minimal
  surface = minimal blast radius.
- Off-chain code verifies a tx by:
  1. `eth_getTransactionReceipt(txHash)` → confirm `status = 1`
  2. Parse `logs[].topics` → confirm `Anchored` event for our contract
  3. Compare `topics[1]` (the root) to our locally-computed root → must match.

If steps 1-3 pass, the audit row in question demonstrably existed by the
tx's `blockTimestamp`.
