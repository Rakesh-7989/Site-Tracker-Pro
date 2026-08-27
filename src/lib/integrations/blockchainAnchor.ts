const SUPPORTED_NETWORKS = ["polygon-mumbai", "polygon-mainnet"];

interface AuditRow {
  id?: string;
  ts?: string;
  actor_id?: string;
  actor_role?: string;
  action?: string;
  resource?: string;
  resource_id?: string;
  org_id?: string;
  project_id?: string;
  before?: unknown;
  after?: unknown;
  message?: string;
  [key: string]: unknown;
}

interface AnchorReceipt {
  txHash?: string;
  blockNumber?: number;
  [key: string]: unknown;
}

interface Adapter {
  network: string;
  anchor: (root: string, opts?: Record<string, unknown>) => Promise<AnchorReceipt>;
  verify?: (txHash: string) => Promise<unknown>;
}

interface DigestResult {
  root: string | null;
  txHash: string | null;
  blockNumber: number | null;
  network: string | null;
  anchoredAt: string;
  rowCount: number;
  anchored: boolean;
  reason?: string;
}

interface PolygonAdapterOpts {
  network: string;
  rpcUrl: string;
  contractAddress: string;
  signer: {
    sendTransaction: (tx: { to: string; data: string }) => Promise<{ hash?: string; wait?: () => Promise<AnchorReceipt> } & AnchorReceipt>;
  };
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function sha256Hex(input: unknown): Promise<string> {
  if (typeof input !== "string") input = JSON.stringify(input);
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input as string));
  return bufToHex(buf);
}

export async function hashAuditRow(row: AuditRow): Promise<string> {
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

export async function merkleRoot(leaves: string[]): Promise<string | null> {
  if (!Array.isArray(leaves) || leaves.length === 0) return null;
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(await sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

export async function anchorDigest(rows: AuditRow[], adapter: Adapter, opts: Record<string, unknown> = {}): Promise<DigestResult> {
  if (!adapter || typeof adapter.anchor !== "function") {
    throw new Error("anchorDigest: adapter.anchor required");
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { root: null, txHash: null, blockNumber: null, network: null, anchoredAt: "", rowCount: 0, anchored: false, reason: "no_rows" };
  }
  const leaves = await Promise.all(rows.map(hashAuditRow));
  const root = await merkleRoot(leaves);
  const receipt = await adapter.anchor(root!, opts);
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

export function inMemoryAdapter() {
  const log: Array<{ root: string; txHash: string; blockNumber: number; ts: string }> = [];
  return {
    network: "in-memory",
    async anchor(root: string) {
      const txHash = "0x" + (await sha256Hex(`mock:${root}:${log.length}`));
      const blockNumber = log.length + 1;
      log.push({ root, txHash, blockNumber, ts: new Date().toISOString() });
      return { txHash, blockNumber };
    },
    async verify(txHash: string) {
      return log.find(entry => entry.txHash === txHash) || null;
    },
    _log: log,
  };
}

export function polygonAdapter({ network, rpcUrl, contractAddress, signer }: PolygonAdapterOpts) {
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
    async anchor(rootHex: string, opts: Record<string, unknown> = {}) {
      const selector = (opts && (opts.selector as string)) || "0xeecdf927";
      const padded = rootHex.replace(/^0x/, "").padStart(64, "0");
      const data = selector + padded;
      const tx = await signer.sendTransaction({ to: contractAddress, data });
      const receipt = typeof (tx as { wait: () => Promise<AnchorReceipt> }).wait === "function" ? await (tx as { wait: () => Promise<AnchorReceipt> }).wait() : tx;
      return {
        txHash: (receipt as AnchorReceipt)?.hash || (tx as AnchorReceipt)?.hash,
        blockNumber: (receipt as AnchorReceipt)?.blockNumber,
      };
    },
    async verify(txHash: string) {
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

export function polygonscanUrl(network: string, txHash: string): string | null {
  if (!txHash) return null;
  const base = network === "polygon-mainnet"
    ? "https://polygonscan.com"
    : "https://amoy.polygonscan.com";
  return `${base}/tx/${txHash}`;
}

export { SUPPORTED_NETWORKS };
