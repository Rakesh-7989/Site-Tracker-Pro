// SiteTrack Pro — Sprint 4 (Session 30.10) Handover packet generator.
//
// Builds the buyer-handover bundle when a project completes. Per the
// architecture (docs/SPRINT_2_ARCHITECTURE.md + v3 plan Sprint 4), this
// is the BLOCKCHAIN STORY for buyers — every photo, payment, drawing,
// RA bill bundled into a single PDF whose merkle root is anchored on
// Polygon. The QR on the printed handover packet resolves to a verify
// page that shows the on-chain proof.
//
// Pure JS — takes already-fetched data + returns the canonical manifest.
// The actual PDF rendering uses a separate adapter so tests don't need
// pdf-lib / jspdf.
//
// Reuses:
//   - blockchainAnchor.merkleRoot()  for the bundle hash
//   - blockchainAnchor.sha256Hex()   for individual leaf hashes
//
// Sprint 4 mid-cycle ships the PDF renderer + QR generator on top.

import { merkleRoot, sha256Hex } from "./blockchainAnchor";

export const HANDOVER_SECTIONS = ["drawings", "photos", "payments", "ra_bills", "compliance"] as const;
type Section = typeof HANDOVER_SECTIONS[number];

interface HandoverProject {
  id: string | number;
  name?: string;
  slug?: string;
  started_at?: string;
  completed_at?: string;
  address?: string;
}

interface HandoverOrg {
  id: string | number;
  name?: string;
}

interface HandoverSectionItem {
  id?: string | number;
  [key: string]: unknown;
}

interface HandoverInput {
  project: HandoverProject;
  org: HandoverOrg;
  drawings?: HandoverSectionItem[];
  photos?: HandoverSectionItem[];
  payments?: HandoverSectionItem[];
  ra_bills?: HandoverSectionItem[];
  compliance?: HandoverSectionItem[];
  generated_at_unix?: number;
}

interface HandoverSectionLeaf {
  leaf_hash: string;
  id?: string | number;
}

interface HandoverSections {
  drawings: HandoverSectionLeaf[];
  photos: HandoverSectionLeaf[];
  payments: HandoverSectionLeaf[];
  ra_bills: HandoverSectionLeaf[];
  compliance: HandoverSectionLeaf[];
}

interface HandoverTotals {
  drawings: number;
  photos: number;
  payments_inr: number;
  ra_bills_inr: number;
}

interface HandoverManifest {
  schema_version: string;
  project_id: string;
  project_name: string;
  project_slug: string;
  org_name: string;
  address: string;
  period_start: string;
  period_end: string;
  sections: HandoverSections;
  totals: HandoverTotals;
  merkle_root: string;
  generated_at_unix: number;
}

const KEEP: Record<Section, string[]> = {
  drawings:   ["id", "title", "drawing_no", "revision", "released_at", "sha256"],
  photos:     ["id", "sha256", "taken_at", "lat", "lon", "site_label"],
  payments:   ["id", "amount_inr", "paid_at", "method", "ra_bill_id"],
  ra_bills:   ["id", "bill_no", "amount_inr", "approved_at", "retention_inr"],
  compliance: ["id", "kind", "ack_no", "state", "filed_at"],
};

export async function hashHandoverItem(section: string, item: HandoverSectionItem): Promise<string> {
  const canon = canonicalize(section, item);
  return await sha256Hex(JSON.stringify(canon, Object.keys(canon).sort()));
}

function canonicalize(section: string, item: HandoverSectionItem): Record<string, unknown> {
  const keepKeys = KEEP[section as Section] || [];
  const out: Record<string, unknown> = {};
  for (const k of keepKeys) {
    if (item[k] !== undefined && item[k] !== null) out[k] = item[k];
  }
  return out;
}

export async function buildHandoverManifest(input: HandoverInput): Promise<HandoverManifest> {
  if (!input || !input.project || !input.org) {
    throw new Error("buildHandoverManifest: project + org required");
  }
  const project = input.project;
  const org = input.org;

  const sections: HandoverSections = {
    drawings: [], photos: [], payments: [], ra_bills: [], compliance: [],
  };
  const allLeaves: string[] = [];

  for (const sec of HANDOVER_SECTIONS) {
    const items = Array.isArray(input[sec]) ? input[sec] : [];
    for (const item of items) {
      const leaf = await hashHandoverItem(sec, item);
      sections[sec].push({ leaf_hash: leaf, id: item.id });
      allLeaves.push(leaf);
    }
  }

  const totals: HandoverTotals = {
    drawings: sections.drawings.length,
    photos: sections.photos.length,
    payments_inr: (input.payments || []).reduce((s, p) => s + (Number(p.amount_inr) || 0), 0),
    ra_bills_inr: (input.ra_bills || []).reduce((s, r) => s + (Number(r.amount_inr) || 0), 0),
  };

  const root = allLeaves.length > 0 ? (await merkleRoot(allLeaves)) ?? EMPTY_MERKLE_ROOT : EMPTY_MERKLE_ROOT;

  return {
    schema_version: "1.0",
    project_id: String(project.id),
    project_name: String(project.name || ""),
    project_slug: String(project.slug || ""),
    org_name: String(org.name || ""),
    address: String(project.address || ""),
    period_start: String(project.started_at || ""),
    period_end: String(project.completed_at || ""),
    sections,
    totals,
    merkle_root: root,
    generated_at_unix: typeof input.generated_at_unix === "number"
      ? input.generated_at_unix
      : Math.floor(Date.now() / 1000),
  };
}

export const EMPTY_MERKLE_ROOT = "0x" + "0".repeat(64);

export function verifyUrl(
  manifestMerkleRoot: string,
  opts: { chain?: string; txHash?: string } = {},
): string {
  const params = new URLSearchParams({ root: manifestMerkleRoot });
  if (opts.chain)  params.set("chain", opts.chain);
  if (opts.txHash) params.set("tx", opts.txHash);
  return `https://sitetrack.in/handover/verify?${params.toString()}`;
}

export function summarizeHandover(manifest: HandoverManifest): string {
  const lines: string[] = [];
  lines.push(`# Handover Packet — ${manifest.project_name}`);
  lines.push("");
  lines.push(`**${manifest.org_name}** · ${manifest.address}`);
  lines.push("");
  lines.push(`Period: ${manifest.period_start} → ${manifest.period_end}`);
  lines.push("");
  lines.push(`## Bundled`);
  lines.push(`- Drawings released: ${manifest.totals.drawings}`);
  lines.push(`- Site photos: ${manifest.totals.photos}`);
  lines.push(`- Payments total: ₹${(manifest.totals.payments_inr / 100).toLocaleString("en-IN")}`);
  lines.push(`- RA bills total: ₹${(manifest.totals.ra_bills_inr / 100).toLocaleString("en-IN")}`);
  lines.push("");
  lines.push(`## Audit anchor`);
  lines.push(`Merkle root: \`${manifest.merkle_root}\``);
  lines.push(`Verify: ${verifyUrl(manifest.merkle_root)}`);
  return lines.join("\n");
}

export function serializeManifest(manifest: HandoverManifest): string {
  return JSON.stringify(sortKeys(manifest));
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj === null || typeof obj !== "object") return obj;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortKeys((obj as Record<string, unknown>)[k]);
  return out;
}
