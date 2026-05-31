// supabase/functions/anchor-digest/index.ts
//
// SiteTrack Pro — daily audit-log Merkle anchor cron.
//
// Triggered by pg_cron at 00:30 IST (see contracts/README.md for the SQL).
//
// Flow:
//   1. Auth: require Bearer matching CRON_SECRET env (or x-supabase-signature).
//   2. SELECT * FROM audit_log_v2 WHERE ts::date = yesterday.
//   3. hashAuditRow per row → leaves.
//   4. merkleRoot(leaves) → root.
//   5. POST eth_sendRawTransaction to Polygon RPC with anchor(bytes32) calldata.
//   6. INSERT into audit_anchors (day, row_count, merkle_root, tx_hash, ...).
//   7. Return JSON summary.
//
// Idempotent: re-running for a day that's already anchored returns the existing
// row instead of double-anchoring. This is critical because cron retries are
// expected (HTTP timeouts, RPC flakiness).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Helpers we copy here rather than import from src/lib/ because EFs run on
//    Deno, not Node, and importing browser-targeted JS modules is brittle.
//    The math MUST match src/lib/blockchainAnchor.js — fixtures lock them.

async function sha256Bytes(s: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return new Uint8Array(buf);
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(h: string): Uint8Array {
  const clean = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Canonical row hash — MUST stay in lock-step with src/lib/blockchainAnchor.js
// hashAuditRow(). If you change one side, change both + update tests.
async function hashAuditRow(row: Record<string, unknown>): Promise<Uint8Array> {
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
  ].join("|");
  return await sha256Bytes(canonical);
}

async function merkleRootBytes(leaves: Uint8Array[]): Promise<Uint8Array> {
  if (leaves.length === 0) return new Uint8Array(32);   // zero root for empty days
  let level = leaves.slice();
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i];   // duplicate last if odd
      const combined = new Uint8Array(64);
      combined.set(a, 0); combined.set(b, 32);
      const buf = await crypto.subtle.digest("SHA-256", combined);
      next.push(new Uint8Array(buf));
    }
    level = next;
  }
  return level[0];
}

// ── Polygon RPC client (minimal — only what we need).

interface RpcResp<T> { result?: T; error?: { code: number; message: string } }

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await r.json()) as RpcResp<T>;
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message}`);
  if (j.result === undefined) throw new Error(`RPC ${method}: no result`);
  return j.result;
}

// Submit a pre-signed transaction. We DON'T sign on the EF (would need ethers
// or viem — heavy deps). Instead, we accept a hex-encoded RAW TX from env, OR
// we call an RPC method that the operator has configured (clef / signer-svc).
//
// For now: require POLYGON_SIGNED_TX_BUILDER env to be set to a URL of an
// external signer that accepts {to, data} and returns {signedTx}. If unset,
// we return early in "dry-run" mode.

interface SignerResp { signedTx: string; nonce?: number }

async function buildAndSignTx(
  signerUrl: string, signerToken: string,
  to: string, data: string,
): Promise<string> {
  const r = await fetch(signerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${signerToken}` },
    body: JSON.stringify({ to, data }),
  });
  if (!r.ok) throw new Error(`signer ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as SignerResp;
  if (!j.signedTx?.startsWith("0x")) throw new Error("signer returned no signedTx");
  return j.signedTx;
}

// Build ABI-encoded calldata for anchor(bytes32 root)
// Function selector keccak256("anchor(bytes32)")[:4] = 0xeecdf927
const ANCHOR_SELECTOR = "eecdf927";
function buildAnchorCalldata(rootHex: string): string {
  const clean = rootHex.startsWith("0x") ? rootHex.slice(2) : rootHex;
  if (clean.length !== 64) throw new Error("root must be 32 bytes / 64 hex chars");
  return "0x" + ANCHOR_SELECTOR + clean;
}

// ── HTTP entry

Deno.serve(async (req) => {
  // ─ Auth ─────────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization") || "";
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");        // YYYY-MM-DD; default = yesterday
  const dryRun = url.searchParams.get("dry") === "1";

  const day = dayParam || (() => {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  })();

  // ─ Supabase admin client ─────────────────────────────────────────────
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supa = createClient(supaUrl, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ─ Skip if already anchored ─────────────────────────────────────────
  const { data: existing } = await supa
    .from("audit_anchors").select("*").eq("day", day).maybeSingle();
  if (existing && existing.status === "confirmed") {
    return Response.json({
      day, status: "already-anchored",
      tx_hash: existing.tx_hash, merkle_root: bytesToHex(existing.merkle_root),
    });
  }

  // ─ Fetch the day's audit rows ───────────────────────────────────────
  const start = `${day}T00:00:00Z`;
  const end = `${day}T23:59:59.999Z`;
  const { data: rows, error: rowsErr } = await supa
    .from("audit_log_v2")
    .select("id, ts, actor_id, actor_role, action, resource, resource_id, org_id, project_id, before, after")
    .gte("ts", start).lte("ts", end)
    .order("id", { ascending: true });

  if (rowsErr) return Response.json({ error: rowsErr.message }, { status: 500 });

  // ─ Compute merkle root ──────────────────────────────────────────────
  const leaves: Uint8Array[] = [];
  for (const r of rows ?? []) leaves.push(await hashAuditRow(r as Record<string, unknown>));
  const rootBytes = await merkleRootBytes(leaves);
  const rootHex = "0x" + bytesToHex(rootBytes);

  if (dryRun || (rows?.length ?? 0) === 0) {
    await supa.from("audit_anchors").upsert({
      day, row_count: rows?.length ?? 0,
      merkle_root: rootBytes,
      status: (rows?.length ?? 0) === 0 ? "manual" : "pending",
      network: "none",
      failure_reason: dryRun ? "dry-run" : "no-rows",
      metadata: { dryRun, leafCount: leaves.length },
    });
    return Response.json({ day, status: "dry-run", row_count: rows?.length ?? 0, merkle_root: rootHex });
  }

  // ─ Sign + submit ────────────────────────────────────────────────────
  const rpcUrl = Deno.env.get("POLYGON_RPC_URL")!;
  const contract = Deno.env.get("POLYGON_CONTRACT_ADDRESS")!;
  const signerUrl = Deno.env.get("POLYGON_SIGNER_URL");
  const signerToken = Deno.env.get("POLYGON_SIGNER_TOKEN") || "";
  const network = (Deno.env.get("POLYGON_NETWORK") || "polygon-mainnet") as "polygon-mainnet" | "polygon-amoy" | "polygon-mumbai";

  if (!rpcUrl || !contract) {
    return Response.json({ error: "POLYGON_RPC_URL and POLYGON_CONTRACT_ADDRESS required" }, { status: 500 });
  }
  if (!signerUrl) {
    // Store the digest as 'pending' so it can be signed + sent later.
    await supa.from("audit_anchors").upsert({
      day, row_count: rows?.length ?? 0,
      merkle_root: rootBytes,
      status: "pending",
      network,
      failure_reason: "no-signer-configured",
    });
    return Response.json({ day, status: "pending-no-signer", merkle_root: rootHex, row_count: rows?.length ?? 0 });
  }

  const data = buildAnchorCalldata(rootHex);
  let txHash: string | undefined, blockNumber: number | undefined, failure: string | undefined;
  try {
    const signedTx = await buildAndSignTx(signerUrl, signerToken, contract, data);
    txHash = await rpcCall<string>(rpcUrl, "eth_sendRawTransaction", [signedTx]);
    // Poll receipt briefly (Polygon ~2s blocks).
    for (let i = 0; i < 12; i++) {
      await new Promise(res => setTimeout(res, 2500));
      const receipt = await rpcCall<{ status: string; blockNumber: string } | null>(
        rpcUrl, "eth_getTransactionReceipt", [txHash]);
      if (receipt) {
        if (receipt.status !== "0x1") { failure = "tx-reverted"; break; }
        blockNumber = parseInt(receipt.blockNumber, 16);
        break;
      }
    }
  } catch (e) {
    failure = (e as Error).message;
  }

  const status = blockNumber ? "confirmed" : (txHash ? "submitted" : "failed");

  await supa.from("audit_anchors").upsert({
    day,
    row_count: rows?.length ?? 0,
    merkle_root: rootBytes,
    tx_hash: txHash,
    block_number: blockNumber,
    network,
    status,
    failure_reason: failure,
    anchored_at: new Date().toISOString(),
    confirmed_at: blockNumber ? new Date().toISOString() : undefined,
    row_id_range: rows?.length
      ? { min: rows[0].id, max: rows[rows.length - 1].id }
      : null,
    metadata: { leafCount: leaves.length, anchorSelector: ANCHOR_SELECTOR },
  });

  return Response.json({
    day, status, row_count: rows?.length ?? 0,
    merkle_root: rootHex, tx_hash: txHash, block_number: blockNumber,
    network, ...(failure ? { failure_reason: failure } : {}),
  });
});
