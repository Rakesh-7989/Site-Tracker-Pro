// SiteTrack Pro — org quota snapshot (usage vs plan caps).
//
// Consumes the `org_quota_snapshot` RPC (migrations 35/97).
// Returns typed rows for users + projects with progress + at-limit flags.
// Pure helpers for rollup + gating logic.

import type { QueryResult } from "./queries";

export interface QuotaRow {
  resource: "users" | "projects" | "storage" | "deliverables" | "crm_leads";
  currentCount: number;
  maxAllowed: number | null;
  atQuota: boolean;
}

export async function fetchOrgQuota(client: any, orgId: string): Promise<QueryResult<QuotaRow[]>> {
  try {
    const { data, error } = await (client as any).rpc("org_quota_snapshot", { p_org_id: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows: QuotaRow[] = (data ?? []).map((r: any) => {
      const resource = String(r.resource);
      return {
        resource,
        currentCount: Number(r.current_count ?? 0),
        maxAllowed: r.max_allowed === null ? null : Number(r.max_allowed),
        atQuota: Boolean(r.at_quota),
      };
    });
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Percent used (0-100). null if unlimited / unknown max. */
export function quotaPct(row: QuotaRow): number | null {
  if (row.maxAllowed === null || row.maxAllowed === 0) return null;
  return Math.min(100, Math.round((row.currentCount / row.maxAllowed) * 100));
}

/** True when the row is at or over its cap. */
export function atQuota(row: QuotaRow): boolean {
  return row.atQuota;
}

/** Aggregate rollup for all known quota resources. */
export interface QuotaRollup {
  users: { current: number; max: number | null; pct: number | null; atQuota: boolean };
  projects: { current: number; max: number | null; pct: number | null; atQuota: boolean };
  storage: { current: number; max: number | null; pct: number | null; atQuota: boolean };
  deliverables: { current: number; max: number | null; pct: number | null; atQuota: boolean };
  crm_leads: { current: number; max: number | null; pct: number | null; atQuota: boolean };
}

export function usageRollup(rows: QuotaRow[]): QuotaRollup {
  const users = rows.find(r => r.resource === "users");
  const projects = rows.find(r => r.resource === "projects");
  const storage = rows.find(r => r.resource === "storage");
  const deliverables = rows.find(r => r.resource === "deliverables");
  const crmLeads = rows.find(r => r.resource === "crm_leads");

  return {
    users: users
      ? { current: users.currentCount, max: users.maxAllowed, pct: quotaPct(users), atQuota: users.atQuota }
      : { current: 0, max: null, pct: null, atQuota: false },
    projects: projects
      ? { current: projects.currentCount, max: projects.maxAllowed, pct: quotaPct(projects), atQuota: projects.atQuota }
      : { current: 0, max: null, pct: null, atQuota: false },
    storage: storage
      ? { current: storage.currentCount, max: storage.maxAllowed, pct: quotaPct(storage), atQuota: storage.atQuota }
      : { current: 0, max: null, pct: null, atQuota: false },
    deliverables: deliverables
      ? { current: deliverables.currentCount, max: deliverables.maxAllowed, pct: quotaPct(deliverables), atQuota: deliverables.atQuota }
      : { current: 0, max: null, pct: null, atQuota: false },
    crm_leads: crmLeads
      ? { current: crmLeads.currentCount, max: crmLeads.maxAllowed, pct: quotaPct(crmLeads), atQuota: crmLeads.atQuota }
      : { current: 0, max: null, pct: null, atQuota: false },
  };
}

/** True if any resource is at quota. */
export function anyAtQuota(rollup: QuotaRollup): boolean {
  return rollup.users.atQuota || rollup.projects.atQuota || rollup.storage.atQuota || rollup.deliverables.atQuota || rollup.crm_leads.atQuota;
}

/** True if a specific resource is at quota. */
export function resourceAtQuota(rollup: QuotaRollup, resource: "users" | "projects" | "storage" | "deliverables" | "crm_leads"): boolean {
  return rollup[resource].atQuota;
}