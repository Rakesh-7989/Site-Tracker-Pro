import { describe, it, expect } from "vitest";
import {
  sha256Hex, hashAuditRow, merkleRoot, anchorDigest,
  inMemoryAdapter, polygonAdapter, polygonscanUrl, SUPPORTED_NETWORKS,
} from "../src/lib/integrations/blockchainAnchor";

describe("blockchainAnchor — pure digest helpers", () => {
  it("sha256Hex returns a 64-char hex string", async () => {
    const h = await sha256Hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sha256Hex is deterministic", async () => {
    expect(await sha256Hex("foo")).toBe(await sha256Hex("foo"));
  });

  it("sha256Hex stringifies non-string input", async () => {
    const h = await sha256Hex({ a: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashAuditRow is reproducible across runs with the same fields", async () => {
    const row = { id: "a1", ts: "2026-01-01", actor_id: "u1", action: "CREATE", resource: "project", message: "x" };
    expect(await hashAuditRow(row)).toBe(await hashAuditRow({ ...row })); // same fields, different object
  });

  it("hashAuditRow ignores key order in nested objects via JSON.stringify", async () => {
    const a = { id: "1", before: { x: 1, y: 2 } };
    const b = { id: "1", before: { x: 1, y: 2 } };
    expect(await hashAuditRow(a)).toBe(await hashAuditRow(b));
  });

  it("hashAuditRow detects ANY field change", async () => {
    const base = { id: "1", action: "CREATE", message: "ok" };
    const tampered = { ...base, message: "tampered" };
    expect(await hashAuditRow(base)).not.toBe(await hashAuditRow(tampered));
  });

  it("hashAuditRow throws when row missing", async () => {
    await expect(hashAuditRow(null)).rejects.toThrow();
  });
});

describe("blockchainAnchor — merkleRoot", () => {
  it("returns null for empty leaves", async () => {
    expect(await merkleRoot([])).toBeNull();
  });

  it("returns the single leaf when length === 1", async () => {
    expect(await merkleRoot(["abc"])).toBe("abc");
  });

  it("produces a deterministic root for 2 leaves", async () => {
    const r1 = await merkleRoot(["aa", "bb"]);
    const r2 = await merkleRoot(["aa", "bb"]);
    expect(r1).toBe(r2);
    expect(r1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changing one leaf changes the root (tamper detection)", async () => {
    const r1 = await merkleRoot(["aa", "bb", "cc"]);
    const r2 = await merkleRoot(["aa", "bX", "cc"]);
    expect(r1).not.toBe(r2);
  });

  it("handles odd number of leaves by duplicating the last", async () => {
    const odd = await merkleRoot(["aa", "bb", "cc"]);
    expect(odd).toMatch(/^[0-9a-f]{64}$/);
  });

  it("scales to 100 leaves", async () => {
    const leaves = Array.from({ length: 100 }, (_, i) => `leaf_${i}`);
    const root = await merkleRoot(leaves);
    expect(root).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("blockchainAnchor — inMemoryAdapter", () => {
  it("anchors and returns a txHash + blockNumber", async () => {
    const a = inMemoryAdapter();
    const r = await a.anchor("0xabc");
    expect(r.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.blockNumber).toBe(1);
  });

  it("blockNumber increments per anchor call", async () => {
    const a = inMemoryAdapter();
    const r1 = await a.anchor("root1");
    const r2 = await a.anchor("root2");
    expect(r2.blockNumber).toBe(r1.blockNumber + 1);
  });

  it("verify returns the previously anchored entry", async () => {
    const a = inMemoryAdapter();
    const r = await a.anchor("root");
    const v = await a.verify(r.txHash);
    expect(v).toBeTruthy();
    expect(v.root).toBe("root");
  });

  it("verify returns null for unknown tx", async () => {
    expect(await inMemoryAdapter().verify("0xdeadbeef")).toBeNull();
  });
});

describe("blockchainAnchor — anchorDigest end-to-end", () => {
  it("anchors a non-empty audit log", async () => {
    const rows = [
      { id: "1", ts: "2026-01-01", actor_id: "u1", action: "CREATE", resource: "project", message: "p1 created" },
      { id: "2", ts: "2026-01-01", actor_id: "u2", action: "APPROVE", resource: "po", resource_id: "po1", message: "approved" },
    ];
    const a = inMemoryAdapter();
    const out = await anchorDigest(rows, a);
    expect(out.anchored).toBe(true);
    expect(out.root).toMatch(/^[0-9a-f]{64}$/);
    expect(out.txHash).toMatch(/^0x/);
    expect(out.rowCount).toBe(2);
    expect(out.network).toBe("in-memory");
  });

  it("returns no-rows receipt when audit log is empty", async () => {
    const out = await anchorDigest([], inMemoryAdapter());
    expect(out.anchored).toBe(false);
    expect(out.reason).toBe("no_rows");
  });

  it("rejects when adapter has no anchor method", async () => {
    await expect(anchorDigest([{}], {})).rejects.toThrow();
  });

  it("tampering with one row changes the anchored root", async () => {
    const rows = [
      { id: "1", action: "CREATE", message: "ok" },
      { id: "2", action: "APPROVE", message: "fine" },
    ];
    const a1 = inMemoryAdapter();
    const r1 = await anchorDigest(rows, a1);
    const rowsTampered = [
      { ...rows[0], message: "TAMPERED" },
      rows[1],
    ];
    const a2 = inMemoryAdapter();
    const r2 = await anchorDigest(rowsTampered, a2);
    expect(r1.root).not.toBe(r2.root);
  });
});

describe("blockchainAnchor — polygonAdapter construction", () => {
  it("rejects unsupported networks", () => {
    expect(() => polygonAdapter({ network: "ethereum", rpcUrl: "x", contractAddress: "y", signer: { sendTransaction() {} } })).toThrow(/network/i);
  });
  it("rejects missing rpcUrl", () => {
    expect(() => polygonAdapter({ network: "polygon-mumbai", contractAddress: "y", signer: { sendTransaction() {} } })).toThrow(/rpcUrl/i);
  });
  it("rejects missing contractAddress", () => {
    expect(() => polygonAdapter({ network: "polygon-mumbai", rpcUrl: "x", signer: { sendTransaction() {} } })).toThrow(/contractAddress/i);
  });
  it("rejects missing signer", () => {
    expect(() => polygonAdapter({ network: "polygon-mumbai", rpcUrl: "x", contractAddress: "y" })).toThrow(/signer/i);
  });
  it("accepts a valid config and constructs", () => {
    const a = polygonAdapter({ network: "polygon-mumbai", rpcUrl: "x", contractAddress: "0xc", signer: { sendTransaction: () => ({ hash: "0xt" }) } });
    expect(a.network).toBe("polygon-mumbai");
    expect(a.contractAddress).toBe("0xc");
  });
});

describe("blockchainAnchor — polygonAdapter.anchor encoding", () => {
  it("calls signer.sendTransaction with selector + padded 32-byte root", async () => {
    const calls = [];
    const a = polygonAdapter({
      network: "polygon-mumbai",
      rpcUrl: "https://x.test",
      contractAddress: "0xCONTRACT",
      signer: {
        sendTransaction(tx) { calls.push(tx); return { hash: "0xtx1" }; },
      },
    });
    const root = "deadbeef".repeat(8); // 64 hex chars = 32 bytes, no 0x prefix
    await a.anchor(root);
    expect(calls.length).toBe(1);
    expect(calls[0].to).toBe("0xCONTRACT");
    // Session 24: VERIFIED real selector is 0xeecdf927 (was 0xf73e54d4 — wrong)
    expect(calls[0].data).toBe("0xeecdf927" + root);
  });

  it("accepts custom selector when caller provides one (different contract)", async () => {
    const calls = [];
    const a = polygonAdapter({
      network: "polygon-mumbai", rpcUrl: "x", contractAddress: "0xC",
      signer: { sendTransaction(tx) { calls.push(tx); return { hash: "0x1" }; } },
    });
    await a.anchor("a".repeat(64), { selector: "0xdeadbeef" });
    expect(calls[0].data).toMatch(/^0xdeadbeef/);
  });

  it("strips 0x prefix and pads to 64 hex chars", async () => {
    const calls = [];
    const a = polygonAdapter({
      network: "polygon-mumbai",
      rpcUrl: "x", contractAddress: "0xC",
      signer: { sendTransaction(tx) { calls.push(tx); return { hash: "0x1" }; } },
    });
    await a.anchor("0xabc"); // short with prefix
    expect(calls[0].data.length).toBe(2 + 8 + 64); // 0x + selector + 64 hex
    // Session 24: corrected selector to verified keccak256("anchor(bytes32))").slice(0,8)
    expect(calls[0].data).toMatch(/^0xeecdf927/);
    expect(calls[0].data.endsWith("abc")).toBe(true);
  });

  it("awaits tx.wait() when present (ethers.js style)", async () => {
    let waited = false;
    const a = polygonAdapter({
      network: "polygon-mumbai", rpcUrl: "x", contractAddress: "0xC",
      signer: {
        sendTransaction() {
          return { hash: "0xt", wait: async () => { waited = true; return { hash: "0xt", blockNumber: 42 }; } };
        },
      },
    });
    const r = await a.anchor("a".repeat(64));
    expect(waited).toBe(true);
    expect(r.txHash).toBe("0xt");
    expect(r.blockNumber).toBe(42);
  });
});

describe("blockchainAnchor — polygonscanUrl", () => {
  it("uses Amoy explorer for mumbai (Polygon retired old Mumbai testnet → Amoy)", () => {
    expect(polygonscanUrl("polygon-mumbai", "0xabc")).toContain("amoy.polygonscan.com");
  });
  it("uses polygonscan.com for mainnet", () => {
    expect(polygonscanUrl("polygon-mainnet", "0xabc")).toContain("polygonscan.com");
    expect(polygonscanUrl("polygon-mainnet", "0xabc")).not.toContain("amoy");
  });
  it("returns null without txHash", () => {
    expect(polygonscanUrl("polygon-mainnet", null)).toBeNull();
  });
});

describe("blockchainAnchor — config vocab", () => {
  it("SUPPORTED_NETWORKS lists mumbai + mainnet", () => {
    expect(SUPPORTED_NETWORKS.sort()).toEqual(["polygon-mainnet", "polygon-mumbai"].sort());
  });
});
