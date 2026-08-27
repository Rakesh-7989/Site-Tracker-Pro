// SiteTrack Pro — monthly retainers (v4 C2).
// DB: retainers (migration 142). RLS: read = project member, write = managers
// + org admin. UI gating via retainer:manage; plan gate via 'retainer_billing'.
// Invoices are generated manually per month through the security-definer
// generate_retainer_invoice RPC (billing:generate).

import { workflowNextMap } from "../engines/workflowEngine";
import { RETAINER_WORKFLOW } from "../engines/workflowDefinitions";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type RetainerStatus = "active" | "paused" | "cancelled";
export const RETAINER_STATUSES: readonly RetainerStatus[] = ["active", "paused", "cancelled"];
const asRetainerStatus = oneOf<RetainerStatus>(RETAINER_STATUSES, "active");

/** Legal status transitions for the UI cycle button (derived from the workflow register). null = terminal. */
export const RETAINER_NEXT: Record<RetainerStatus, RetainerStatus | null> = workflowNextMap(RETAINER_WORKFLOW);

/** Auto-billing hint for active retainers (v4 C3.4 cron). */
export function autoBillingHint(billingDay: number): string | null {
  const b = Math.trunc(Number(billingDay) || 0);
  if (b < 1 || b > 28) return null;
  return `Auto-bills on day ${b} each month`;
}

export interface Retainer {
  id: string;
  projectId: string;
  title: string;
  monthlyAmount: number;
  status: RetainerStatus;
  startDate: string;
  endDate: string | null;
  billingDay: number;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listRetainers(client: any, projectId: string): Promise<Result<Retainer[]>> {
  try {
    const { data, error } = await client
      .from("retainers")
      .select("id, project_id, title, monthly_amount, status, start_date, end_date, billing_day, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      projectId: String(r.project_id ?? ""),
      title: String(r.title ?? ""),
      monthlyAmount: Number(r.monthly_amount ?? 0),
      status: asRetainerStatus(r.status),
      startDate: String(r.start_date ?? ""),
      endDate: r.end_date == null ? null : String(r.end_date),
      billingDay: Number(r.billing_day ?? 1),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createRetainer(client: any, input: {
  projectId: string; title: string; monthlyAmount: number;
  startDate?: string; endDate?: string | null; billingDay?: number;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("retainers")
      .insert({
        project_id: input.projectId, title: input.title, monthly_amount: input.monthlyAmount,
        start_date: input.startDate || new Date().toISOString().slice(0, 10),
        end_date: input.endDate || null, billing_day: input.billingDay ?? 1,
      })
      .select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateRetainer(client: any, id: string, patch: {
  title?: string; monthlyAmount?: number; startDate?: string; endDate?: string | null; billingDay?: number;
  status?: RetainerStatus;
}): Promise<Result<{ ok: true }>> {
  try {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.monthlyAmount !== undefined) row.monthly_amount = patch.monthlyAmount;
    if (patch.startDate !== undefined) row.start_date = patch.startDate;
    if (patch.endDate !== undefined) row.end_date = patch.endDate;
    if (patch.billingDay !== undefined) row.billing_day = patch.billingDay;
    if (patch.status !== undefined) row.status = patch.status;
    const { error } = await client.from("retainers").update(row).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setRetainerStatus(client: any, id: string, status: RetainerStatus): Promise<Result<{ ok: true }>> {
  return updateRetainer(client, id, { status });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteRetainer(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("retainers").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}
