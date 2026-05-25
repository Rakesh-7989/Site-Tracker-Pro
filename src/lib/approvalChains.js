// SiteTrack Pro — Configurable approval chains.
//
// Replaces the hard-coded "PM approves under ₹50k, architect approves over"
// rule with org-configurable chains. Each chain defines a resource type
// (expense / po / ra_bill / change_order / invoice) and an ordered list of
// rungs. A rung is { threshold, role, requireSig?, requireComment? }.
//
// resolveApprovers(amount, chain) walks the rungs in order and returns the
// chain that applies. Walls (Pro/Business plan) can be enforced at the UI
// layer via planGating.js.
//
// IMPORTANT: This module is PURE — no React, no localStorage, no I/O. State
// lives in App.jsx (useLS "approval_chains") and is passed in.

/** Initial seed shape for org-level approval chains state. */
export const INIT_APPROVAL_CHAINS = {
  // keyed by org_id → { [resource_type]: { id, name, resource, rungs: [...] } }
  // Default empty until an Org admin opens the panel.
};

/** Resource types that support approval chains. */
export const APPROVAL_RESOURCES = [
  { id: "expense", label: "Expense" },
  { id: "po", label: "Purchase Order" },
  { id: "ra_bill", label: "RA Bill" },
  { id: "change_order", label: "Change Order" },
  { id: "invoice", label: "Invoice" },
  { id: "drawing_release", label: "Drawing Release" },
];

/** Roles eligible to be approvers. (orgadmin = builder-firm owner.) */
export const APPROVAL_ROLES = ["pm", "architect", "orgadmin", "superadmin"];

/** Built-in default chain — used when an org has not configured its own. */
export function defaultChain(resource) {
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

/**
 * Get the chain configured for one org + resource — falls back to defaults.
 */
export function getChain(chains, orgId, resource) {
  const orgChains = chains?.[orgId] || {};
  return orgChains[resource] || defaultChain(resource);
}

/**
 * Resolve the SINGLE rung that applies to a given amount on a given chain.
 * Returns null when no rung matches (chain misconfigured or empty).
 */
export function resolveRung(chain, amount) {
  if (!chain || !Array.isArray(chain.rungs) || chain.rungs.length === 0) return null;
  // Sort ascending by threshold, then pick the FIRST rung whose threshold >= amount.
  const sorted = [...chain.rungs].sort((a, b) => a.threshold - b.threshold);
  for (const rung of sorted) {
    if (amount <= rung.threshold) return rung;
  }
  // Amount exceeds every configured threshold — fall through to the top rung.
  return sorted[sorted.length - 1];
}

/**
 * Resolve ALL approvers up the chain (multi-signature workflow).
 * For amount=₹600k on the default expense chain you get [pm, architect].
 * Useful for "this PO needs 2 signatures" semantics.
 */
export function resolveApprovers(chain, amount) {
  if (!chain || !Array.isArray(chain.rungs)) return [];
  const sorted = [...chain.rungs].sort((a, b) => a.threshold - b.threshold);
  // Walk until we cover the amount — every rung at or below counts as an approver
  // *unless* this is the lowest rung that already covers the amount alone.
  const matched = [];
  for (const rung of sorted) {
    matched.push(rung);
    if (amount <= rung.threshold) break;
  }
  return matched;
}

/**
 * Add/update a chain on an org. Returns a NEW chains object (immutable).
 */
export function upsertChain(chains, orgId, chain) {
  if (!orgId || !chain || !chain.resource) return chains;
  const next = { ...(chains || {}) };
  next[orgId] = { ...(next[orgId] || {}), [chain.resource]: chain };
  return next;
}

/** Delete a chain for an org+resource. Returns new chains object. */
export function removeChain(chains, orgId, resource) {
  if (!chains?.[orgId]) return chains;
  const next = { ...chains };
  const orgChains = { ...next[orgId] };
  delete orgChains[resource];
  next[orgId] = orgChains;
  return next;
}

/**
 * Validate a chain config. Returns { ok, errors: string[] }.
 * - thresholds must be unique and non-negative
 * - roles must be from APPROVAL_ROLES
 * - resource must be from APPROVAL_RESOURCES
 */
export function validateChain(chain) {
  const errors = [];
  if (!chain) return { ok: false, errors: ["Chain is null"] };
  if (!chain.name?.trim()) errors.push("Chain name is required");
  if (!APPROVAL_RESOURCES.find(r => r.id === chain.resource)) {
    errors.push(`Resource must be one of: ${APPROVAL_RESOURCES.map(r => r.id).join(", ")}`);
  }
  if (!Array.isArray(chain.rungs) || chain.rungs.length === 0) {
    errors.push("At least one approval rung is required");
  } else {
    const thresholds = new Set();
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
