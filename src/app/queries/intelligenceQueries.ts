// SiteTrack Pro — intelligence queries (Pillar 1.2 / 1.3 / 1.4, migration 263).
// Read-only analytics surfaces computed server-side: the monthly cost-overrun
// forecast (cost_forecast), the weekly labour-productivity snapshots
// (labour_metrics) and the member-gated material stock-out prediction RPCs.
// Matches the financeQueries Result<T> style.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

export interface CostForecastRow {
  projectId: string;
  forecastMonth: string; // YYYY-MM-DD (first of the forecast month)
  projectedSpend: number;
  projectedOverrun: number;
  confidence: number; // 0.2 / 0.4 / 0.6 / 0.8
}

export interface LabourMetricsRow {
  projectId: string;
  weekStart: string; // ISO week start (Monday)
  attendanceRate: number; // 0..1, present / scheduled, clamped
  overtimeRatio: number; // Σ OT / Σ hours
  labourHours: number;
  labourCost: number;
  outputUnits: number | null;
  unitsPerLabourDay: number | null;
  costPerUnit: number | null;
}

export interface MaterialStockoutRow {
  material: string;
  unit: string;
  currentStock: number;
  monthlyConsumption: number;
  leadDays: number;
  daysRemaining: number | null; // null = no recent consumption
  stockoutCritical: boolean;
}

export interface OrgMaterialStockoutRow extends MaterialStockoutRow {
  projectId: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const integer = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);

const mapCostForecast = (r: Record<string, unknown>): CostForecastRow => ({
  projectId: str(r.project_id),
  forecastMonth: str(r.forecast_month),
  projectedSpend: num(r.projected_spend),
  projectedOverrun: num(r.projected_overrun),
  confidence: num(r.confidence),
});

const mapLabourMetrics = (r: Record<string, unknown>): LabourMetricsRow => ({
  projectId: str(r.project_id),
  weekStart: str(r.week_start),
  attendanceRate: num(r.attendance_rate),
  overtimeRatio: num(r.overtime_ratio),
  labourHours: num(r.labour_hours),
  labourCost: num(r.labour_cost),
  outputUnits: numOrNull(r.output_units),
  unitsPerLabourDay: numOrNull(r.units_per_labour_day),
  costPerUnit: numOrNull(r.cost_per_unit),
});

const mapMaterialStockout = (r: Record<string, unknown>): MaterialStockoutRow => ({
  material: str(r.material),
  unit: str(r.unit),
  currentStock: num(r.current_stock),
  monthlyConsumption: num(r.monthly_consumption),
  leadDays: integer(r.lead_days),
  daysRemaining: numOrNull(r.days_remaining),
  stockoutCritical: r.stockout_critical === true,
});

// ── Cost forecast (1.2) ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listCostForecast(client: any, projectId: string): Promise<Result<CostForecastRow[]>> {
  try {
    const { data, error } = await client.from("cost_forecast")
      .select("project_id, forecast_month, projected_spend, projected_overrun, confidence")
      .eq("project_id", projectId)
      .order("forecast_month", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapCostForecast));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeCostForecast(client: any, projectId: string): Promise<Result<CostForecastRow[]>> {
  try {
    const { data, error } = await client.rpc("compute_cost_forecast", { p_project_id: projectId });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapCostForecast));
  } catch (e) { return er(e); }
}

// ── Labour metrics (1.4) ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listLabourMetrics(client: any, projectId: string): Promise<Result<LabourMetricsRow[]>> {
  try {
    const { data, error } = await client.from("labour_metrics")
      .select("project_id, week_start, attendance_rate, overtime_ratio, labour_hours, labour_cost, output_units, units_per_labour_day, cost_per_unit")
      .eq("project_id", projectId)
      .order("week_start", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapLabourMetrics));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeLabourMetrics(client: any, projectId: string): Promise<Result<LabourMetricsRow[]>> {
  try {
    const { data, error } = await client.rpc("compute_labour_metrics", { p_project_id: projectId });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapLabourMetrics));
  } catch (e) { return er(e); }
}

// ── Material stock-out (1.3) ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeMaterialStockout(client: any, projectId: string): Promise<Result<MaterialStockoutRow[]>> {
  try {
    const { data, error } = await client.rpc("compute_material_stockout", { p_project_id: projectId });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapMaterialStockout));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeOrgMaterialStockout(client: any, orgId: string): Promise<Result<OrgMaterialStockoutRow[]>> {
  try {
    const { data, error } = await client.rpc("compute_org_material_stockout", { p_org_id: orgId });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      ...mapMaterialStockout(r),
      projectId: str(r.project_id),
    })));
  } catch (e) { return er(e); }
}

/** Human stock-out label for a stockout row's days_remaining. */
export function stockoutLabel(days: number | null): string {
  if (days == null) return "No recent consumption";
  if (days <= 0) return "Out of stock";
  return `${days} days left`;
}