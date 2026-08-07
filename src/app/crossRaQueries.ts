// SiteTrack Pro — cross-project RA bills rollup (v4 Phase D backlog close-out).
//
// Org-wide view of running-account (RA) bills across the caller's member
// projects: billed amounts, net payable after retention, and settlement by
// status. Mirrors the CrossProjectPOsView / RevenueView org-rollup pattern
// (project list once, then a single .in(project_id) fetch). RLS on ra_bills is
// project-scoped, so only projects the caller can already see surface.

import { listProjectsByType } from "./utilizationQueries";
import { raNetPayable, type RaBillStatus } from "./financeQueries";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const errbox = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const asStatus = (v: unknown): RaBillStatus => {
  const s = String(v ?? "submitted");
  return (["submitted", "approved", "paid", "rejected"] as RaBillStatus[]).includes(s as RaBillStatus) ? (s as RaBillStatus) : "submitted";
};

export interface CrossRaBill {
  id: string;
  no: string;
  subcontractor: string | null;
  scope: string | null;
  billAmount: number;
  retentionPct: number;
  paidAmount: number;
  status: RaBillStatus;
  billDate: string | null;
  projectId: string;
  projectName: string;
  projectType: string | null;
  netPayable: number;
}

export interface CrossRaTotals {
  count: number;
  billed: number;
  netPayable: number;
  paid: number;
  byStatus: Record<RaBillStatus, number>;
}

/** Pure rollup of cross-project RA bills (net payable per bill included). */
export function crossRaRollup(rows: CrossRaBill[]): CrossRaTotals {
  const byStatus: Record<RaBillStatus, number> = { submitted: 0, approved: 0, paid: 0, rejected: 0 };
  let count = 0, billed = 0, netPayable = 0, paid = 0;
  for (const r of rows) {
    count += 1;
    billed += r.billAmount;
    netPayable += r.netPayable;
    byStatus[r.status] += r.billAmount;
    if (r.status === "paid") paid += r.paidAmount;
  }
  return { count, billed, netPayable, paid, byStatus };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgRaBills(client: any, orgId: string): Promise<Result<CrossRaBill[]>> {
  try {
    const projectsRes = await listProjectsByType(client, orgId);
    if (!projectsRes.ok) return projectsRes;
    if (projectsRes.data.length === 0) return { ok: true, data: [] };
    const ids = projectsRes.data.map(p => p.id);

    const { data, error } = await client.from("ra_bills")
      .select("id, no, subcontractor, scope, bill_amount, retention_pct, paid_amount, status, bill_date, project_id")
      .in("project_id", ids)
      .order("bill_date", { ascending: false });
    if (error) return dbe(error);

    const nameById = new Map(projectsRes.data.map(p => [p.id, p]));
    const rows: CrossRaBill[] = ((data ?? []) as Array<Record<string, unknown>>).map(r => {
      const pid = String(r.project_id ?? "");
      const proj = nameById.get(pid);
      const billAmount = Number(r.bill_amount ?? 0);
      const retentionPct = Number(r.retention_pct ?? 0);
      return {
        id: String(r.id),
        no: String(r.no ?? ""),
        subcontractor: r.subcontractor == null ? null : String(r.subcontractor),
        scope: r.scope == null ? null : String(r.scope),
        billAmount,
        retentionPct,
        paidAmount: Number(r.paid_amount ?? 0),
        status: asStatus(r.status),
        billDate: r.bill_date == null ? null : String(r.bill_date),
        projectId: pid,
        projectName: proj?.name ?? "—",
        projectType: proj?.type ?? null,
        netPayable: raNetPayable({ billAmount, retentionPct }),
      };
    });
    return { ok: true, data: rows };
  } catch (e) { return errbox(e); }
}