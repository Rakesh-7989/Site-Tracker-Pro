// SiteTrack Pro — org quota snapshot (usage vs plan caps).
//
// Consumes the `org_quota_snapshot` RPC (migrations 35/97).
// Returns typed rows for users + projects with progress + at-limit flags.
// Pure helpers for rollup + gating logic.

import type { QueryResult } from "./queries";

export interface QuotaRow {
  resource: "users" | "projects";
  currentCount: number;
  maxAllowed: number | null;
  atQuota: boolean;
}

export async function fetchOrgQuota(client: any, orgId: string): Promise<QueryResult<QuotaRow[]>> {
  try {
    const { data, error } = await (client as any).rpc("org_quota_snapshot", { p_org_id: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows: QuotaRow[] = (data ?? []).map((r: any) => ({
      resource: String(r.resource),
      currentCount: Number(r.current_count ?? 0),
      maxAllowed: r.max_allowed === null ? null : Number(r.max_allowed),
      atQuota: Boolean(r.at_quota),
    }));
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

/** Aggregate rollup: users + projects current/max/pct/atQuota. */
export interface QuotaRollup {
  users: { current: number; max: number | null; pct: number | null; atQuota: boolean };
  projects: { current: number; max: number | null; pct: number | null; atQuota: boolean };
}

export function usageRollup(rows: QuotaRow[]): QuotaRollup {
  const users = rows.find(r => r.resource === "users");
  const projects = rows.find(r => r.resource === "projects");
  return {
    users: users
      ? { current: users.currentCount, max: users.maxAllowed, pct: quotaPct(users), atQuota: users.atQuota }
      : { current: 0, max: null, pct: null, atQuota: false },
    projects: projects
      ? { current: projects.currentCount, max: projects.maxAllowed, pct: quotaPct(projects), atQuota: projects.atQuota }
      : { current: 0, max: null, pct: null, atQuota: false },
  };
}

/** True if any resource is at quota. */
export function anyAtQuota(rollup: QuotaRollup): boolean {
  return rollup.users.atQuota || rollup.projects.atQuota;
}

/** True if a specific resource is at quota. */
export function resourceAtQuota(rollup: QuotaRollup, resource: "users" | "projects"): boolean {
  return rollup[resource].atQuota;
}