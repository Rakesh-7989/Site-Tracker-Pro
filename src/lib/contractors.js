// SiteTrack Pro — v2 Phase D: contractor sub-hierarchy.
//
// The hand-drawn architecture sheet shows Contractor as a PARENT with three
// children: sub-contractors, material vendor links, and past contract
// archive. Today v1 treats contractor as a flat role + project membership.
//
// This module is the PURE state layer for that hierarchy. UI panels come in
// a later session; the lib + tests ship now so the data shape is locked.
//
// State shapes (lives in App.jsx useLS keys):
//   subContractors:        { [parent_contractor_id]: SubContractor[] }
//   contractorVendorLinks: ContractorVendorLink[]
//   contractorPastContracts: PastContract[]
//
// Each is pure, immutable. CRUD helpers return new objects.

export const INIT_SUB_CONTRACTORS = {};
export const INIT_CONTRACTOR_VENDOR_LINKS = [];
export const INIT_CONTRACTOR_PAST_CONTRACTS = [];

export const CLOSEOUT_STATUSES = ["completed", "disputed", "terminated", "expired"];

// ── SUB-CONTRACTORS ──────────────────────────────────────────────────────

/** List sub-contractors under a parent contractor id. */
export function listSubContractors(state, parentId) {
  if (!parentId) return [];
  return state?.[parentId] || [];
}

/** Add a sub-contractor row. Returns new state. */
export function addSubContractor(state, parentId, row) {
  if (!parentId || !row?.name?.trim()) return state || {};
  const next = { ...(state || {}) };
  const list = [...(next[parentId] || [])];
  const id = row.id || `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  list.push({
    id,
    parent_contractor_id: parentId,
    name: row.name.trim(),
    scope: row.scope || "",
    contact: row.contact || "",
    phone: row.phone || "",
    gst: row.gst || "",
    active: row.active !== false,
    created_at: row.created_at || new Date().toISOString(),
  });
  next[parentId] = list;
  return next;
}

/** Deactivate a sub-contractor (soft delete — preserve audit trail). */
export function deactivateSubContractor(state, parentId, id) {
  if (!state?.[parentId]) return state || {};
  const next = { ...state };
  next[parentId] = next[parentId].map(sc =>
    sc.id === id ? { ...sc, active: false, deactivated_at: new Date().toISOString() } : sc
  );
  return next;
}

/** Remove permanently (hard delete — use sparingly, prefer deactivate). */
export function removeSubContractor(state, parentId, id) {
  if (!state?.[parentId]) return state || {};
  const next = { ...state };
  next[parentId] = next[parentId].filter(sc => sc.id !== id);
  return next;
}

// ── CONTRACTOR ↔ VENDOR LINKS ─────────────────────────────────────────────

/** Get every vendor linked to a contractor. */
export function vendorsForContractor(links, contractorId) {
  if (!Array.isArray(links) || !contractorId) return [];
  return links.filter(l => l.contractor_id === contractorId && l.active !== false);
}

/** Get every contractor that has a given vendor. */
export function contractorsForVendor(links, vendorId) {
  if (!Array.isArray(links) || !vendorId) return [];
  return links.filter(l => l.vendor_id === vendorId && l.active !== false);
}

/** Link a vendor to a contractor (idempotent — re-linking updates contract_id). */
export function linkVendor(links, contractorId, vendorId, opts = {}) {
  if (!contractorId || !vendorId) return links || [];
  const existing = (links || []).find(
    l => l.contractor_id === contractorId && l.vendor_id === vendorId
  );
  if (existing) {
    return links.map(l =>
      l === existing
        ? { ...l, contract_id: opts.contractId || l.contract_id, active: true, updated_at: new Date().toISOString() }
        : l
    );
  }
  return [
    ...(links || []),
    {
      contractor_id: contractorId,
      vendor_id: vendorId,
      contract_id: opts.contractId || null,
      notes: opts.notes || "",
      active: true,
      created_at: new Date().toISOString(),
    },
  ];
}

/** Unlink a vendor from a contractor (soft — mark inactive). */
export function unlinkVendor(links, contractorId, vendorId) {
  if (!Array.isArray(links)) return [];
  return links.map(l =>
    l.contractor_id === contractorId && l.vendor_id === vendorId
      ? { ...l, active: false, unlinked_at: new Date().toISOString() }
      : l
  );
}

// ── PAST CONTRACT ARCHIVE ─────────────────────────────────────────────────

/** Record a past (closed-out) contract for vendor-rating + history. */
export function archivePastContract(archive, row) {
  if (!row?.contractor_id) return archive || [];
  if (!CLOSEOUT_STATUSES.includes(row.closeout_status)) return archive || [];
  const id = row.id || `pc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return [
    ...(archive || []),
    {
      id,
      contractor_id: row.contractor_id,
      project_id: row.project_id || null,
      scope: row.scope || "",
      value_inr: Number(row.value_inr) || 0,
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      closeout_status: row.closeout_status,
      notes: row.notes || "",
      archived_at: row.archived_at || new Date().toISOString(),
    },
  ];
}

/** List archived contracts for a contractor, newest first. */
export function pastContractsForContractor(archive, contractorId) {
  if (!Array.isArray(archive) || !contractorId) return [];
  return archive
    .filter(c => c.contractor_id === contractorId)
    .sort((a, b) => String(b.end_date || "").localeCompare(String(a.end_date || "")));
}

/** Quick reputation summary — counts of each closeout status for a contractor. */
export function contractorReputation(archive, contractorId) {
  const past = pastContractsForContractor(archive, contractorId);
  const counts = Object.fromEntries(CLOSEOUT_STATUSES.map(s => [s, 0]));
  let totalValue = 0;
  for (const c of past) {
    counts[c.closeout_status] = (counts[c.closeout_status] || 0) + 1;
    totalValue += c.value_inr || 0;
  }
  const total = past.length;
  const positive = counts.completed;
  const risk = counts.disputed + counts.terminated;
  // Score 0-100; favours completed, penalises disputed + terminated heavily.
  let score = 50;
  if (total > 0) {
    score = Math.round(50 + ((positive - risk * 2) / total) * 50);
    score = Math.max(0, Math.min(100, score));
  }
  return { total, totalValue, counts, score };
}
