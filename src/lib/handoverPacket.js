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

import { merkleRoot, sha256Hex } from "./blockchainAnchor.js";

/** Section categories used in the manifest. */
export const HANDOVER_SECTIONS = ["drawings", "photos", "payments", "ra_bills", "compliance"];

/**
 * Compute a deterministic leaf hash for one bundled item. The shape is
 * the canonical-JSON of the relevant fields ONLY — drops volatile fields
 * (created_at, updated_at, viewer_url) so two runs produce the same hash.
 *
 * @param {string} section
 * @param {object} item
 * @returns {Promise<string>}  hex sha256
 */
export async function hashHandoverItem(section, item) {
  const canon = canonicalize(section, item);
  return await sha256Hex(JSON.stringify(canon, Object.keys(canon).sort()));
}

function canonicalize(section, item) {
  const KEEP = {
    drawings:   ["id", "title", "drawing_no", "revision", "released_at", "sha256"],
    photos:     ["id", "sha256", "taken_at", "lat", "lon", "site_label"],
    payments:   ["id", "amount_inr", "paid_at", "method", "ra_bill_id"],
    ra_bills:   ["id", "bill_no", "amount_inr", "approved_at", "retention_inr"],
    compliance: ["id", "kind", "ack_no", "state", "filed_at"],
  };
  const keepKeys = KEEP[section] || [];
  const out = {};
  for (const k of keepKeys) {
    if (item[k] !== undefined && item[k] !== null) out[k] = item[k];
  }
  return out;
}

/**
 * Build the manifest object for a project. The manifest is the source-of-
 * truth structure the PDF + the verify page both render from.
 *
 * @param {object} input
 * @param {object} input.project        — { id, name, slug, started_at, completed_at, address }
 * @param {object} input.org            — { id, name }
 * @param {object[]} [input.drawings]
 * @param {object[]} [input.photos]
 * @param {object[]} [input.payments]
 * @param {object[]} [input.ra_bills]
 * @param {object[]} [input.compliance]
 * @returns {Promise<HandoverManifest>}
 *
 * @typedef {Object} HandoverManifest
 * @property {string} schema_version
 * @property {string} project_id
 * @property {string} project_name
 * @property {string} org_name
 * @property {string} address
 * @property {string} period_start
 * @property {string} period_end
 * @property {object} sections
 * @property {{leaf_hash: string}[]} sections.drawings
 * @property {{leaf_hash: string}[]} sections.photos
 * @property {{leaf_hash: string}[]} sections.payments
 * @property {{leaf_hash: string}[]} sections.ra_bills
 * @property {{leaf_hash: string}[]} sections.compliance
 * @property {number} totals.drawings
 * @property {number} totals.photos
 * @property {number} totals.payments_inr
 * @property {number} totals.ra_bills_inr
 * @property {string} merkle_root
 * @property {number} generated_at_unix
 */
export async function buildHandoverManifest(input) {
  if (!input || !input.project || !input.org) {
    throw new Error("buildHandoverManifest: project + org required");
  }
  const project = input.project;
  const org = input.org;

  const sections = {};
  const allLeaves = [];

  for (const sec of HANDOVER_SECTIONS) {
    const items = Array.isArray(input[sec]) ? input[sec] : [];
    sections[sec] = [];
    for (const item of items) {
      const leaf = await hashHandoverItem(sec, item);
      sections[sec].push({ leaf_hash: leaf, id: item.id });
      allLeaves.push(leaf);
    }
  }

  const totals = {
    drawings: sections.drawings.length,
    photos: sections.photos.length,
    payments_inr: (input.payments || []).reduce((s, p) => s + (Number(p.amount_inr) || 0), 0),
    ra_bills_inr: (input.ra_bills || []).reduce((s, r) => s + (Number(r.amount_inr) || 0), 0),
  };

  // Empty bundle → empty-root sentinel so verify pages can still link.
  const root = allLeaves.length > 0 ? await merkleRoot(allLeaves) : EMPTY_MERKLE_ROOT;

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
    // Tests pass `generated_at_unix` directly so the manifest is
    // deterministic; production uses Date.now() / 1000.
    generated_at_unix: typeof input.generated_at_unix === "number"
      ? input.generated_at_unix
      : Math.floor(Date.now() / 1000),
  };
}

export const EMPTY_MERKLE_ROOT = "0x" + "0".repeat(64);

/**
 * Generate the public verify URL the QR on the printed handover points to.
 *
 * @param {string} manifestMerkleRoot
 * @param {{ chain?: string, txHash?: string }} [opts]
 * @returns {string}
 */
export function verifyUrl(manifestMerkleRoot, opts = {}) {
  const params = new URLSearchParams({ root: manifestMerkleRoot });
  if (opts.chain)  params.set("chain", opts.chain);
  if (opts.txHash) params.set("tx", opts.txHash);
  return `https://sitetrack.in/handover/verify?${params.toString()}`;
}

/**
 * Produce a one-page human-readable summary of the manifest (text). Used
 * by the PDF cover sheet + the WhatsApp announcement to the buyer.
 *
 * @param {HandoverManifest} manifest
 * @returns {string}
 */
export function summarizeHandover(manifest) {
  const lines = [];
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

/**
 * Serialize the manifest so it can be stored alongside the PDF (in
 * Supabase Storage) for future verifies. The serialized form is the
 * canonical JSON — keys sorted at every level — so the bytes are
 * deterministic across language runtimes.
 *
 * @param {HandoverManifest} manifest
 * @returns {string}
 */
export function serializeManifest(manifest) {
  return JSON.stringify(sortKeys(manifest));
}

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj === null || typeof obj !== "object") return obj;
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k]);
  return out;
}
