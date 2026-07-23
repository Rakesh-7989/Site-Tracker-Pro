interface Rung {
  threshold: number;
  role: string;
  requireSig?: boolean;
  requireComment?: boolean;
}

interface Chain {
  id: string;
  name: string;
  resource: string;
  rungs: Rung[];
}

interface ChainState {
  [orgId: string]: {
    [resource: string]: Chain;
  };
}

export const INIT_APPROVAL_CHAINS: ChainState = {};

export const APPROVAL_RESOURCES = [
  { id: "expense", label: "Expense" },
  { id: "po", label: "Purchase Order" },
  { id: "ra_bill", label: "RA Bill" },
  { id: "change_order", label: "Change Order" },
  { id: "invoice", label: "Invoice" },
  { id: "drawing_release", label: "Drawing Release" },
];

export const APPROVAL_ROLES = ["pm", "architect", "orgadmin", "superadmin"];

export function defaultChain(resource: string): Chain {
  switch (resource) {
    case "expense":
      return {
        id: `default_${resource}`,
        name: "Default expense chain",
        resource,
        rungs: [
          { threshold: 50000, role: "pm", requireSig: false, requireComment: false },
          { threshold: 500000, role: "architect", requireSig: true, requireComment: true },
          { threshold: Infinity, role: "orgadmin", requireSig: true, requireComment: true },
        ],
      };
    case "po":
    case "ra_bill":
    case "invoice":
      return {
        id: `default_${resource}`,
        name: `Default ${resource.replace("_", " ")} chain`,
        resource,
        rungs: [
          { threshold: 100000, role: "pm", requireSig: false, requireComment: false },
          { threshold: 1000000, role: "architect", requireSig: true, requireComment: true },
          { threshold: Infinity, role: "orgadmin", requireSig: true, requireComment: true },
        ],
      };
    case "change_order":
      return {
        id: `default_${resource}`,
        name: "Default change-order chain",
        resource,
        rungs: [
          { threshold: 0, role: "architect", requireSig: true, requireComment: true },
          { threshold: 500000, role: "orgadmin", requireSig: true, requireComment: true },
        ],
      };
    case "drawing_release":
      return {
        id: `default_${resource}`,
        name: "Default drawing-release chain",
        resource,
        rungs: [
          { threshold: 0, role: "architect", requireSig: true, requireComment: false },
        ],
      };
    default:
      return {
        id: `default_${resource}`,
        name: `Default ${resource} chain`,
        resource,
        rungs: [
          { threshold: Infinity, role: "orgadmin", requireSig: true, requireComment: true },
        ],
      };
  }
}

export function getChain(chains: ChainState, orgId: string, resource: string): Chain {
  const orgChains = chains?.[orgId] || {};
  return orgChains[resource] || defaultChain(resource);
}

export function resolveRung(chain: Chain, amount: number): Rung | null {
  if (!chain || !Array.isArray(chain.rungs) || chain.rungs.length === 0) return null;
  const sorted = [...chain.rungs].sort((a, b) => a.threshold - b.threshold);
  for (const rung of sorted) {
    if (amount <= rung.threshold) return rung;
  }
  return sorted[sorted.length - 1];
}

export function resolveApprovers(chain: Chain, amount: number): Rung[] {
  if (!chain || !Array.isArray(chain.rungs)) return [];
  const sorted = [...chain.rungs].sort((a, b) => a.threshold - b.threshold);
  const matched: Rung[] = [];
  for (const rung of sorted) {
    matched.push(rung);
    if (amount <= rung.threshold) break;
  }
  return matched;
}

export function upsertChain(chains: ChainState, orgId: string, chain: Chain): ChainState {
  if (!orgId || !chain || !chain.resource) return chains;
  const next = { ...(chains || {}) };
  next[orgId] = { ...(next[orgId] || {}), [chain.resource]: chain };
  return next;
}

export function removeChain(chains: ChainState, orgId: string, resource: string): ChainState {
  if (!chains?.[orgId]) return chains;
  const next = { ...chains };
  const orgChains = { ...next[orgId] };
  delete orgChains[resource];
  next[orgId] = orgChains;
  return next;
}

export function validateChain(chain: Chain): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!chain) return { ok: false, errors: ["Chain is null"] };
  if (!chain.name?.trim()) errors.push("Chain name is required");
  if (!APPROVAL_RESOURCES.find(r => r.id === chain.resource)) {
    errors.push(`Resource must be one of: ${APPROVAL_RESOURCES.map(r => r.id).join(", ")}`);
  }
  if (!Array.isArray(chain.rungs) || chain.rungs.length === 0) {
    errors.push("At least one approval rung is required");
  } else {
    const thresholds = new Set<number>();
    for (const r of chain.rungs) {
      if (typeof r.threshold !== "number" || r.threshold < 0) {
        errors.push(`Invalid threshold: ${r.threshold}`);
      }
      if (thresholds.has(r.threshold)) {
        errors.push(`Duplicate threshold: ₹${r.threshold}`);
      }
      thresholds.add(r.threshold);
      if (!APPROVAL_ROLES.includes(r.role)) {
        errors.push(`Invalid role: ${r.role}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
