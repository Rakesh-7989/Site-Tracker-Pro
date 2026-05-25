// SiteTrack Pro — Org-level integration settings.
//
// Replaces per-user localStorage for WhatsApp / Cashfree / AI provider /
// Razorpay credentials. Now every user in the org inherits the same config —
// which is the only way it makes sense in production (one Razorpay account
// per builder firm, not per project manager).
//
// State lives in App.jsx (useLS "org_integrations"). Shape:
//   { [org_id]: { ai: {...}, razorpay: {...}, whatsapp: {...}, cashfree: {...} } }
//
// Each provider's payload mirrors the shape that lib/ai.js + lib/razorpay.js
// already use, so the legacy localStorage reads can switch over by just
// pulling from this org record instead.
//
// SECURITY NOTE: Production should keep secrets server-side. This module
// stores them in IndexedDB-backed state. The Supabase migration path encrypts
// at-rest on the server; until then, customers must accept the risk.

const PROVIDERS = ["ai", "razorpay", "whatsapp", "cashfree"];

/** Initial seed shape for org-level integrations state. */
export const INIT_ORG_INTEGRATIONS = {};

/** Empty integration config (used when an org has not configured anything). */
export const EMPTY_INTEGRATION = {
  ai: { provider: "", key: "", model: "" },
  razorpay: { key_id: "", key_secret: "", vpa: "" },
  whatsapp: { phone_id: "", token: "", template_id: "" },
  cashfree: { app_id: "", secret: "", webhook: "" },
};

/** Get one org's integration record (defaults to EMPTY_INTEGRATION). */
export function getOrgIntegrations(store, orgId) {
  if (!store || !orgId) return EMPTY_INTEGRATION;
  return { ...EMPTY_INTEGRATION, ...(store[orgId] || {}) };
}

/** Get one provider's config for one org. */
export function getProviderForOrg(store, orgId, provider) {
  if (!PROVIDERS.includes(provider)) return null;
  const rec = getOrgIntegrations(store, orgId);
  return rec[provider] || EMPTY_INTEGRATION[provider];
}

/** Update one provider's config for one org. Returns NEW store object. */
export function setProviderForOrg(store, orgId, provider, config) {
  if (!orgId || !PROVIDERS.includes(provider)) return store;
  const next = { ...(store || {}) };
  const orgRec = { ...(next[orgId] || EMPTY_INTEGRATION) };
  orgRec[provider] = { ...(orgRec[provider] || {}), ...(config || {}) };
  next[orgId] = orgRec;
  return next;
}

/** Clear one provider's config for one org. */
export function clearProviderForOrg(store, orgId, provider) {
  if (!orgId || !PROVIDERS.includes(provider)) return store;
  const next = { ...(store || {}) };
  const orgRec = { ...(next[orgId] || EMPTY_INTEGRATION) };
  orgRec[provider] = { ...EMPTY_INTEGRATION[provider] };
  next[orgId] = orgRec;
  return next;
}

/** True when at least one secret field on a provider is non-empty. */
export function isProviderConfigured(store, orgId, provider) {
  const cfg = getProviderForOrg(store, orgId, provider);
  if (!cfg) return false;
  return Object.values(cfg).some(v => typeof v === "string" && v.trim().length > 0);
}

/**
 * Migrate legacy localStorage entries (per-user) into the org-level store.
 * Returns NEW store object — the localStorage entries are left in place so
 * callers can decide whether to clear them.
 */
export function migrateLegacyToOrg(store, orgId, legacy = {}) {
  if (!orgId) return store;
  let next = store || {};
  if (legacy.ai) next = setProviderForOrg(next, orgId, "ai", legacy.ai);
  if (legacy.razorpay) next = setProviderForOrg(next, orgId, "razorpay", legacy.razorpay);
  if (legacy.whatsapp) next = setProviderForOrg(next, orgId, "whatsapp", legacy.whatsapp);
  if (legacy.cashfree) next = setProviderForOrg(next, orgId, "cashfree", legacy.cashfree);
  return next;
}

/** Mask secrets for display (e.g. "sk-****abcd"). */
export function maskSecret(s) {
  if (!s || typeof s !== "string") return "";
  if (s.length <= 8) return "****";
  return `${s.slice(0, 3)}${"*".repeat(Math.max(s.length - 7, 4))}${s.slice(-4)}`;
}

/** Summary across all providers — used by the dashboard tile. */
export function integrationsSummary(store, orgId) {
  const out = {};
  for (const p of PROVIDERS) {
    out[p] = isProviderConfigured(store, orgId, p);
  }
  out.count = Object.values(out).filter(Boolean).length;
  out.total = PROVIDERS.length;
  return out;
}

export { PROVIDERS };
