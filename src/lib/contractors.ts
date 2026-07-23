interface SubContractor {
  id: string;
  parent_contractor_id: string;
  name: string;
  scope: string;
  contact: string;
  phone: string;
  gst: string;
  active: boolean;
  created_at: string;
  deactivated_at?: string;
  [key: string]: unknown;
}

interface ContractorVendorLink {
  contractor_id: string;
  vendor_id: string;
  contract_id: string | null;
  notes: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
  unlinked_at?: string;
  [key: string]: unknown;
}

interface PastContract {
  id: string;
  contractor_id: string;
  project_id: string | null;
  scope: string;
  value_inr: number;
  start_date: string | null;
  end_date: string | null;
  closeout_status: string;
  notes: string;
  archived_at: string;
  [key: string]: unknown;
}

export const INIT_SUB_CONTRACTORS: Record<string, SubContractor[]> = {};
export const INIT_CONTRACTOR_VENDOR_LINKS: ContractorVendorLink[] = [];
export const INIT_CONTRACTOR_PAST_CONTRACTS: PastContract[] = [];

export const CLOSEOUT_STATUSES = ["completed", "disputed", "terminated", "expired"];

export function listSubContractors(state: Record<string, SubContractor[]>, parentId: string): SubContractor[] {
  if (!parentId) return [];
  return state?.[parentId] || [];
}

export function addSubContractor(state: Record<string, SubContractor[]>, parentId: string, row: Partial<SubContractor>): Record<string, SubContractor[]> {
  if (!parentId || !row?.name?.trim()) return state || {};
  const next = { ...(state || {}) };
  const list = [...(next[parentId] || [])];
  const id = row.id || `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  list.push({
    id,
    parent_contractor_id: parentId,
    name: row.name!.trim(),
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

export function deactivateSubContractor(state: Record<string, SubContractor[]>, parentId: string, id: string): Record<string, SubContractor[]> {
  if (!state?.[parentId]) return state || {};
  const next = { ...state };
  next[parentId] = next[parentId].map(sc =>
    sc.id === id ? { ...sc, active: false, deactivated_at: new Date().toISOString() } : sc
  );
  return next;
}

export function removeSubContractor(state: Record<string, SubContractor[]>, parentId: string, id: string): Record<string, SubContractor[]> {
  if (!state?.[parentId]) return state || {};
  const next = { ...state };
  next[parentId] = next[parentId].filter(sc => sc.id !== id);
  return next;
}

export function vendorsForContractor(links: ContractorVendorLink[], contractorId: string): ContractorVendorLink[] {
  if (!Array.isArray(links) || !contractorId) return [];
  return links.filter(l => l.contractor_id === contractorId && l.active !== false);
}

export function contractorsForVendor(links: ContractorVendorLink[], vendorId: string): ContractorVendorLink[] {
  if (!Array.isArray(links) || !vendorId) return [];
  return links.filter(l => l.vendor_id === vendorId && l.active !== false);
}

export function linkVendor(links: ContractorVendorLink[], contractorId: string, vendorId: string, opts: { contractId?: string; notes?: string } = {}): ContractorVendorLink[] {
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

export function unlinkVendor(links: ContractorVendorLink[], contractorId: string, vendorId: string): ContractorVendorLink[] {
  if (!Array.isArray(links)) return [];
  return links.map(l =>
    l.contractor_id === contractorId && l.vendor_id === vendorId
      ? { ...l, active: false, unlinked_at: new Date().toISOString() }
      : l
  );
}

export function archivePastContract(archive: PastContract[], row: Partial<PastContract>): PastContract[] {
  if (!row?.contractor_id) return archive || [];
  if (!CLOSEOUT_STATUSES.includes(row.closeout_status!)) return archive || [];
  const id = row.id || `pc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return [
    ...(archive || []),
    {
      id,
      contractor_id: row.contractor_id!,
      project_id: row.project_id || null,
      scope: row.scope || "",
      value_inr: Number(row.value_inr) || 0,
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      closeout_status: row.closeout_status!,
      notes: row.notes || "",
      archived_at: row.archived_at || new Date().toISOString(),
    },
  ];
}

export function pastContractsForContractor(archive: PastContract[], contractorId: string): PastContract[] {
  if (!Array.isArray(archive) || !contractorId) return [];
  return archive
    .filter(c => c.contractor_id === contractorId)
    .sort((a, b) => String(b.end_date || "").localeCompare(String(a.end_date || "")));
}

export function contractorReputation(archive: PastContract[], contractorId: string): { total: number; totalValue: number; counts: Record<string, number>; score: number } {
  const past = pastContractsForContractor(archive, contractorId);
  const counts: Record<string, number> = Object.fromEntries(CLOSEOUT_STATUSES.map(s => [s, 0]));
  let totalValue = 0;
  for (const c of past) {
    counts[c.closeout_status] = (counts[c.closeout_status] || 0) + 1;
    totalValue += c.value_inr || 0;
  }
  const total = past.length;
  const positive = counts.completed;
  const risk = counts.disputed + counts.terminated;
  let score = 50;
  if (total > 0) {
    score = Math.round(50 + ((positive - risk * 2) / total) * 50);
    score = Math.max(0, Math.min(100, score));
  }
  return { total, totalValue, counts, score };
}
