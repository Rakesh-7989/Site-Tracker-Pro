// SiteTrack Pro — forecast data queries for the v3 shell.
// Tables: boq_items, ra_bills, inventory_transactions (ledger), site_updates, projects.

import type { QueryResult } from "@/app/queries";

export interface ProjectForecastDetail {
  id: string;
  name: string;
  budget: number;
  progress: number;
  start_date: string | null;
  expected_end_date: string | null;
  [key: string]: unknown;
}

export interface BoqItem {
  id: string;
  code: string | null;
  description: string;
  unit: string | null;
  qty: number | null;
  rate: number | null;
  amount: number | null;
  category: string | null;
  [key: string]: unknown;
}

export interface RaBill {
  id: string;
  no: string;
  subcontractor: string | null;
  scope: string | null;
  bill_amount: number;
  cumulative: number | null;
  status: string;
  bill_date: string | null;
  [key: string]: unknown;
}

export interface LedgerEntry {
  id: string;
  material: string;
  unit: string | null;
  qty: number;
  direction: string;
  txn_date: string | null;
  [key: string]: unknown;
}

export interface SiteUpdate {
  id: string;
  notes: string;
  weather: string | null;
  workers_count: number | null;
  update_date: string | null;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProjectForecastDetail(client: any, projectId: string): Promise<QueryResult<ProjectForecastDetail | null>> {
  try {
    const { data, error } = await client
      .from("projects")
      .select("id, name, budget, progress, start_date, expected_end_date")
      .eq("id", projectId)
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: true, data: null };
    const r = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        id: String(r.id),
        name: String(r.name),
        budget: Number(r.budget) || 0,
        progress: Number(r.progress) || 0,
        start_date: r.start_date == null ? null : String(r.start_date),
        expected_end_date: r.expected_end_date == null ? null : String(r.expected_end_date),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBoqForProject(client: any, projectId: string): Promise<QueryResult<BoqItem[]>> {
  try {
    const { data, error } = await client
      .from("boq_items")
      .select("id, code, description, unit, qty, rate, amount, category")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => ({
        id: String(r.id),
        code: r.code == null ? null : String(r.code),
        description: String(r.description ?? ""),
        unit: r.unit == null ? null : String(r.unit),
        qty: r.qty == null ? null : Number(r.qty),
        rate: r.rate == null ? null : Number(r.rate),
        amount: r.amount == null ? null : Number(r.amount),
        category: r.category == null ? null : String(r.category),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRaBillsForProject(client: any, projectId: string): Promise<QueryResult<RaBill[]>> {
  try {
    const { data, error } = await client
      .from("ra_bills")
      .select("id, no, subcontractor, scope, bill_amount, cumulative, status, bill_date")
      .eq("project_id", projectId)
      .order("bill_date", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => ({
        id: String(r.id),
        no: String(r.no ?? ""),
        subcontractor: r.subcontractor == null ? null : String(r.subcontractor),
        scope: r.scope == null ? null : String(r.scope),
        bill_amount: Number(r.bill_amount) || 0,
        cumulative: r.cumulative == null ? null : Number(r.cumulative),
        status: String(r.status ?? ""),
        bill_date: r.bill_date == null ? null : String(r.bill_date),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLedgerForProject(client: any, projectId: string): Promise<QueryResult<LedgerEntry[]>> {
  try {
    const { data, error } = await client
      .from("inventory_transactions")
      .select("id, material, unit, qty, direction, txn_date")
      .eq("project_id", projectId)
      .order("txn_date", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => ({
        id: String(r.id),
        material: String(r.material ?? ""),
        unit: r.unit == null ? null : String(r.unit),
        qty: Number(r.qty) || 0,
        direction: String(r.direction ?? ""),
        txn_date: r.txn_date == null ? null : String(r.txn_date),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getUpdatesForProject(client: any, projectId: string): Promise<QueryResult<SiteUpdate[]>> {
  try {
    const { data, error } = await client
      .from("site_updates")
      .select("id, notes, weather, workers_count, update_date")
      .eq("project_id", projectId)
      .order("update_date", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => ({
        id: String(r.id),
        notes: String(r.notes ?? ""),
        weather: r.weather == null ? null : String(r.weather),
        workers_count: r.workers_count == null ? null : Number(r.workers_count),
        update_date: r.update_date == null ? null : String(r.update_date),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
