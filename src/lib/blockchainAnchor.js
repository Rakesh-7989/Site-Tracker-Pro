// SiteTrack Pro — Blockchain audit anchoring (Polygon).
//
// Why this matters strategically:
//   This is the unique differentiator from the pitch deck — no Indian
//   construction SaaS competitor (Procore, Powerplay, BuildSupply,
//   Falconbrick) has tamper-proof cryptographic audit. By committing the
//   daily Merkle root of audit_log_v2 to Polygon, we get:
//     - Notarised proof of WHEN each change happened
//     - Detectable tampering (any retroactive edit changes the hash)
//     - Court-admissible evidence per IT Act 2000 s.65B
//
// Architecture (3 layers, all in this file):
//   1. PURE digest helpers — SHA-256 of an audit row, Merkle root of N rows.
//      Pure, deterministic, fully testable (no chain).
//   2. ADAPTER pattern — `inMemoryAdapter` for tests + dev, `polygonAdapter`
//      for production. Both implement { anchor(rootHex), verify(txHash) }.
//   3. ORCHESTRATOR — `anchorDigest(rows, adapter, signer)` runs the full
//      flow: compute root → submit → return { root, txHash, blockNumber }.
//
// Production flow (called daily by a Supabase pg_cron job):
//   1. Read every audit_log_v2 row from yesterday
//   2. Build Merkle root via merkleRoot(rows.map(sha256OfRow))
//   3. Call anchorDigest with polygonAdapter (Mumbai testnet first, mainnet later)
//   4. Store { date, root_hex, tx_hash, block_number } in a `audit_anchors` table
//
// The Polygon adapter needs a small smart contract:
//   contract SiteTrackAnchor { event Anchored(bytes32 root, uint256 ts); }
//   function anchor(bytes32 root) public { emit Anchored(root, block.timestamp); }
// Deploy once, store the address. Cost: ~$0.0001 per daily anchor (Polygon gas).

const SUPPORTED_NETWORKS = ["polygon-mumbai", "polygon-mainnet"];

/** Compute SHA-256 hex digest of a string. Browser + Node 18+ (Web Crypto). */
export async function sha256Hex(input) {
  if (typeof input !== "string") input = JSON.stringify(input);
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return bufToHex(buf);
}

/** Canonical row hash — uses a STABLE field order so the hash is reproducible.
 *
 * Why not JSON.stringify(row) directly: object key order is unstable across
 * runtimes. We pick the fields we care about + sort them, so the same row
 * always hashes the same.
 */
export async function hashAuditRow(row) {
  if (!row) throw new Error("hashAuditRow: row required");
  const canonical = [
    row.id || "",
    row.ts || "",
    row.actor_id || "",
    row.actor_role || "",
    row.action || "",
    row.resource || "",
    row.resource_id || "",
    row.org_id || "",
    row.project_id || "",
    JSON.stringify(row.before ?? null),
    JSON.stringify(row.after ?? null),
    row.message || "",
  ].join("|");
  return sha256Hex(canonical);
}

/** Merkle root of an array of hex digests. Returns a single hex string. */
export async function merkleRoot(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) return null;
  let level = [...leaves];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left; // duplicate last node when odd
      // eslint-disable-next-line no-await-in-loop
      next.push(await sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

/** End-to-end: rows[] → Merkle root → anchor on chain → return receipt. */
export async function anchorDigest(rows, adapter, opts = {}) {
  if (!adapter || typeof adapter.anchor !== "function") {
    throw new Error("anchorDigest: adapter.anchor required");
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { root: null, txHash: null, anchored: false, reason: "no_rows" };
  }
  const leaves = await Promise.all(rows.map(hashAuditRow));
  const root = await merkleRoot(leaves);
  const receipt = await adapter.anchor(root, opts);
  return {
    root,
    txHash: receipt?.txHash || null,
    blockNumber: receipt?.blockNumber || null,
    network: adapter.network || null,
    anchoredAt: new Date().toISOString(),
    rowCount: rows.length,
    anchored: !!receipt?.txHash,
  };
}

// ── ADAPTERS ──────────────────────────────────────────────────────────────

/**
 * In-memory adapter — for tests + local dev. Generates a deterministic fake
 * txHash from the root so callers can wire end-to-end without a chain.
 */
export function inMemoryAdapter() {
  const log = [];
  return {
    network: "in-memory",
    async anchor(root) {
      const txHash = "0x" + (await sha256Hex(`mock:${root}:${log.length}`));
      const blockNumber = log.length + 1;
      log.push({ root, txHash, blockNumber, ts: new Date().toISOString() });
      return { txHash, blockNumber };
    },
    async verify(txHash) {
      return log.find(entry => entry.txHash === txHash) || null;
    },
    _log: log, // exposed for tests
  };
}

/**
 * Polygon adapter — production. Requires:
 *   network: "polygon-mumbai" (testnet) or "polygon-mainnet"
 *   rpcUrl:  https RPC endpoint (Alchemy, Infura, Quicknode, Polygon's own)
 *   contractAddress: the deployed SiteTrackAnchor contract
 *   signer:  an object with { sendTransaction({ to, data }) } — typically an
 *            ethers.js Wallet or similar. We deliberately keep this generic
 *            so the lib doesn't depend on ethers (caller injects).
 *
 * Encoded data: the 4-byte selector of `anchor(bytes32)` + the 32-byte root.
 * keccak256("anchor(bytes32)").slice(0,8) == "f73e54d4" (deterministic).
 */
export function polygonAdapter({ network, rpcUrl, contractAddress, signer }) {
  if (!SUPPORTED_NETWORKS.includes(network)) {
    throw new Error(`polygonAdapter: network must be one of ${SUPPORTED_NETWORKS.join(", ")}`);
  }
  if (!rpcUrl) throw new Error("polygonAdapter: rpcUrl required");
  if (!contractAddress) throw new Error("polygonAdapter: contractAddress required");
  if (!signer || typeof signer.sendTransaction !== "function") {
    throw new Error("polygonAdapter: signer.sendTransaction required");
  }
  return {
    network,
    rpcUrl,
    contractAddress,
    async anchor(rootHex) {
      // ABI encode: function anchor(bytes32) — selector + 32-byte arg
      const selector = "0xf73e54d4"; // keccak256("anchor(bytes32)").slice(0,10)
      const padded = rootHex.replace(/^0x/, "").padStart(64, "0");
      const data = selector + padded;
      const tx = await signer.sendTransaction({ to: contractAddress, data });
      // Ethers-style — caller's signer should return a tx with hash + wait()
      const receipt = typeof tx.wait === "function" ? await tx.wait() : tx;
      return {
        txHash: receipt?.hash || tx?.hash,
        blockNumber: receipt?.blockNumber,
      };
    },
    async verify(txHash) {
      // Minimal JSON-RPC call — fetches the receipt
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }),
      });
      const json = await res.json();
      return json?.result || null;
    },
  };
}

/**
 * Build a public verification URL — anyone can click to see the anchor on
 * Polygonscan. Used in the UI ("Verify on Polygonscan ↗" link).
 */
export function polygonscanUrl(network, txHash) {
  if (!txHash) return null;
  const base = network === "polygon-mainnet"
    ? "https://polygonscan.com"
    : "https://amoy.polygonscan.com";
  return `${base}/tx/${txHash}`;
}

// ── utils ─────────────────────────────────────────────────────────────────

function bufToHex(buf) {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export { SUPPORTED_NETWORKS };
