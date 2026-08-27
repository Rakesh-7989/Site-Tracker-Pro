const PROVIDERS = ["ai", "razorpay", "whatsapp", "cashfree"] as const;

interface IntegrationConfig {
  [provider: string]: Record<string, string>;
}

interface OrgIntegrationsStore {
  [orgId: string]: IntegrationConfig;
}

export const INIT_ORG_INTEGRATIONS: OrgIntegrationsStore = {};

export const EMPTY_INTEGRATION: IntegrationConfig = {
  ai: { provider: "", key: "", model: "" },
  razorpay: { key_id: "", key_secret: "", vpa: "" },
  whatsapp: { phone_id: "", token: "", template_id: "" },
  cashfree: { app_id: "", secret: "", webhook: "" },
};

export function getOrgIntegrations(store: OrgIntegrationsStore | null | undefined, orgId: string): IntegrationConfig {
  if (!store || !orgId) return EMPTY_INTEGRATION;
  return { ...EMPTY_INTEGRATION, ...(store[orgId] || {}) };
}

export function getProviderForOrg(store: OrgIntegrationsStore | null | undefined, orgId: string, provider: string): Record<string, string> | null {
  if (!PROVIDERS.includes(provider as typeof PROVIDERS[number])) return null;
  const rec = getOrgIntegrations(store, orgId);
  return rec[provider] || EMPTY_INTEGRATION[provider];
}

export function setProviderForOrg(store: OrgIntegrationsStore | null | undefined, orgId: string, provider: string, config: Record<string, unknown>): OrgIntegrationsStore | null | undefined {
  if (!orgId || !PROVIDERS.includes(provider as typeof PROVIDERS[number])) return store;
  const next = { ...(store || {}) };
  const orgRec = { ...(next[orgId] || EMPTY_INTEGRATION) };
  orgRec[provider] = { ...(orgRec[provider] || {}), ...(config || {}) } as Record<string, string>;
  next[orgId] = orgRec;
  return next;
}

export function clearProviderForOrg(store: OrgIntegrationsStore | null | undefined, orgId: string, provider: string): OrgIntegrationsStore | null | undefined {
  if (!orgId || !PROVIDERS.includes(provider as typeof PROVIDERS[number])) return store;
  const next = { ...(store || {}) };
  const orgRec = { ...(next[orgId] || EMPTY_INTEGRATION) };
  orgRec[provider] = { ...EMPTY_INTEGRATION[provider] };
  next[orgId] = orgRec;
  return next;
}

export function isProviderConfigured(store: OrgIntegrationsStore | null | undefined, orgId: string, provider: string): boolean {
  const cfg = getProviderForOrg(store, orgId, provider);
  if (!cfg) return false;
  return Object.values(cfg).some(v => typeof v === "string" && v.trim().length > 0);
}

export function migrateLegacyToOrg(store: OrgIntegrationsStore | null | undefined, orgId: string, legacy: Record<string, unknown> = {}): OrgIntegrationsStore | null | undefined {
  if (!orgId) return store;
  let next: OrgIntegrationsStore | null | undefined = store;
  if (legacy.ai) next = setProviderForOrg(next, orgId, "ai", legacy.ai as Record<string, unknown>);
  if (legacy.razorpay) next = setProviderForOrg(next, orgId, "razorpay", legacy.razorpay as Record<string, unknown>);
  if (legacy.whatsapp) next = setProviderForOrg(next, orgId, "whatsapp", legacy.whatsapp as Record<string, unknown>);
  if (legacy.cashfree) next = setProviderForOrg(next, orgId, "cashfree", legacy.cashfree as Record<string, unknown>);
  return next;
}

export function maskSecret(s: string): string {
  if (!s || typeof s !== "string") return "";
  if (s.length <= 8) return "****";
  return `${s.slice(0, 3)}${"*".repeat(Math.max(s.length - 7, 4))}${s.slice(-4)}`;
}

export function integrationsSummary(store: OrgIntegrationsStore | null | undefined, orgId: string): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {};
  for (const p of PROVIDERS) {
    out[p] = isProviderConfigured(store, orgId, p);
  }
  out.count = Object.values(out).filter(Boolean).length;
  out.total = PROVIDERS.length;
  return out;
}

export { PROVIDERS };
