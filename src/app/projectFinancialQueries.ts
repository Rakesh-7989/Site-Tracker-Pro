// SiteTrack Pro — Project Financial Depth queries (v6 Phase 6).
// Earned value, P&L, WIP aging, cost-to-complete, budget reallocation.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

// ── Earned Value ──────────────────────────────────────────────────────────

export interface EarnedValue {
  projectId: string;
  contractValue: number;
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;      // EV - AC
  scheduleVariance: number;  // EV - PV
  cpi: number;               // Cost Performance Index
  spi: number;               // Schedule Performance Index
  eac: number;               // Estimate at Completion
  etc: number;               // Estimate to Complete
  vac: number;               // Variance at Completion
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function calculateEarnedValue(client: any, projectId: string): Promise<Result<EarnedValue>> {
  try {
    const { data, error } = await client.rpc("calculate_earned_value", { p_project_id: projectId });
    if (error) return dbe(error);
    const row = (data ?? [])[0] as EarnedValue | undefined;
    return row ? ok(row) : er("No data returned");
  } catch (e) { return er(e); }
}

// ── Project P&L ───────────────────────────────────────────────────────────

export interface ProjectPnL {
  projectId: string;
  projectName: string;
  // Revenue
  contractValue: number;
  billedRevenue: number;      // invoices sent
  recognizedRevenue: number;  // earned value
  // Costs
  actualCost: number;         // expenses + PO + RA paid
  committedCost: number;      // PO issued not yet paid
  laborCost: number;          // from time entries / attendance
  materialCost: number;       // from ledger / MB
  subcontractorCost: number;  // RA bills
  overheadCost: number;       // allocated
  totalCost: number;          // actual + committed
  // Profit
  grossProfit: number;
  grossMarginPct: number;
  // Forecast
  forecastFinalCost: number;
  costToComplete: number;
  forecastProfit: number;
  forecastMarginPct: number;
  // EVM
  earnedValue: number;
  cpi: number;
  spi: number;
  eac: number;
  etc: number;
  vac: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProjectPnL(client: any, projectId: string): Promise<Result<ProjectPnL>> {
  try {
    const [evRes, invRes, expRes, poRes, raRes, laborRes] = await Promise.all([
      client.rpc("calculate_earned_value", { p_project_id: projectId }),
      client.from("invoices").select("amount, gst, tds, status").eq("project_id", projectId).neq("status", "cancelled"),
      client.from("expenses").select("amount, category").eq("project_id", projectId).not("status", "in", "('rejected','cancelled')"),
      client.from("purchase_orders").select("amount, status").eq("project_id", projectId).not("status", "in", "('cancelled','rejected')"),
      client.from("ra_bills").select("bill_amount, retention_pct, paid_amount, status").eq("project_id", projectId).in("status", ["approved", "paid"]),
      client.from("time_entries").select("hours, rate").eq("project_id", projectId).eq("billable", true).eq("approval_status", "approved"),
    ]);

    if (evRes.error) return dbe(evRes.error);
    const ev = (evRes.data ?? [])[0] as EarnedValue | undefined;

    const billedRevenue = ((invRes.data ?? []) as any[]).reduce((s, r) => s + (Number(r.amount ?? 0) + Number(r.gst ?? 0) - Number(r.tds ?? 0)), 0);

    const expensesByCat = ((expRes.data ?? []) as any[]).reduce((acc, r) => {
      const cat = String(r.category ?? "other");
      acc[cat] = (acc[cat] ?? 0) + Number(r.amount ?? 0);
      return acc;
    }, {} as Record<string, number>);

    const poTotal = ((poRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const poApproved = ((poRes.data ?? []) as any[]).filter(r => r.status === "approved").reduce((s, r) => s + Number(r.amount ?? 0), 0);

const raBilled = ((raRes.data ?? []) as any[]).reduce((s, r) => {
      const net = Number(r.bill_amount ?? 0) * (1 - (Number(r.retention_pct ?? 0) / 100));
      return s + net;
    }, 0);

    const laborCost = ((laborRes.data ?? []) as any[]).reduce((s, r) => s + (Number(r.hours ?? 0) * Number(r.rate ?? 0)), 0);

    const contractValue = ev?.contractValue ?? 0;
    const actualCost = (ev?.actualCost ?? 0) + poTotal;
    const committedCost = poApproved;
    const totalCost = actualCost + committedCost;
    const grossProfit = ev?.earnedValue ?? 0 - actualCost;
    const grossMarginPct = (ev?.earnedValue ?? 0) > 0 ? Math.round((grossProfit / (ev?.earnedValue ?? 1)) * 100) : 0;

    const forecastFinalCost = ev?.eac ?? contractValue;
    const costToComplete = ev?.etc ?? 0;
    const forecastProfit = contractValue - forecastFinalCost;
    const forecastMarginPct = contractValue > 0 ? Math.round((forecastProfit / contractValue) * 100) : 0;

    return ok({
      projectId,
      projectName: "", // will be filled by caller if needed
      contractValue,
      billedRevenue,
      recognizedRevenue: ev?.earnedValue ?? 0,
      actualCost,
      committedCost,
      laborCost: expensesByCat.labor ?? 0 + laborCost,
      materialCost: expensesByCat.material ?? 0,
      subcontractorCost: raBilled,
      overheadCost: expensesByCat.overhead ?? 0,
      totalCost,
      grossProfit,
      grossMarginPct,
      forecastFinalCost,
      costToComplete,
      forecastProfit,
      forecastMarginPct,
      earnedValue: ev?.earnedValue ?? 0,
      cpi: ev?.cpi ?? 0,
      spi: ev?.spi ?? 0,
      eac: ev?.eac ?? 0,
      etc: ev?.etc ?? 0,
      vac: ev?.vac ?? 0,
    });
  } catch (e) { return er(e); }
}

// ── WIP Aging ─────────────────────────────────────────────────────────────

export type WipStatus = "open" | "partially_billed" | "billed" | "write_off";
export type WipCategory = "labor" | "material" | "equipment" | "subcontractor";

export interface WipAgingEntry {
  id: string;
  projectId: string;
  category: WipCategory;
  description: string | null;
  amount: number;
  agingDays: number;
  incurredDate: string;
  billedAmount: number;
  status: WipStatus;
  createdAt: string;
}

function mapWip(r: Record<string, unknown>): WipAgingEntry {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    category: String(r.category) as WipCategory,
    description: r.description == null ? null : String(r.description),
    amount: Number(r.amount ?? 0),
    agingDays: Number(r.aging_days ?? 0),
    incurredDate: String(r.incurred_date ?? ""),
    billedAmount: Number(r.billed_amount ?? 0),
    status: String(r.status) as WipStatus,
    createdAt: String(r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listWipAging(client: any, projectId: string): Promise<Result<WipAgingEntry[]>> {
  try {
    const { data, error } = await client.from("wip_aging")
      .select("id, project_id, category, description, amount, aging_days, incurred_date, billed_amount, status, created_at")
      .eq("project_id", projectId)
      .order("aging_days", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as any[]).map(mapWip));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createWipEntry(client: any, input: { projectId: string; category: WipCategory; description?: string; amount: number; incurredDate?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("wip_aging").insert({
      project_id: input.projectId,
      category: input.category,
      description: input.description ?? null,
      amount: input.amount,
      incurred_date: input.incurredDate ?? new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateWipEntry(client: any, id: string, patch: Partial<WipAgingEntry>): Promise<Result<{ ok: true }>> {
  try {
    const dbPatch: Record<string, unknown> = {};
    if (patch.category) dbPatch.category = patch.category;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.amount) dbPatch.amount = patch.amount;
    if (patch.agingDays !== undefined) dbPatch.aging_days = patch.agingDays;
    if (patch.incurredDate) dbPatch.incurred_date = patch.incurredDate;
    if (patch.billedAmount !== undefined) dbPatch.billed_amount = patch.billedAmount;
    if (patch.status) dbPatch.status = patch.status;
    const { error } = await client.from("wip_aging").update(dbPatch).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// Pure: WIP aging buckets
export interface WipAgingBuckets {
  current: number;    // 0-30 days
  days31_60: number;
  days61_90: number;
  days91_120: number;
  over120: number;
  total: number;
}

export function computeWipAgingBuckets(entries: WipAgingEntry[]): WipAgingBuckets {
  const buckets: WipAgingBuckets = { current: 0, days31_60: 0, days61_90: 0, days91_120: 0, over120: 0, total: 0 };
  for (const e of entries) {
    const unbilled = e.amount - e.billedAmount;
    if (unbilled <= 0) continue;
    buckets.total += unbilled;
    if (e.agingDays <= 30) buckets.current += unbilled;
    else if (e.agingDays <= 60) buckets.days31_60 += unbilled;
    else if (e.agingDays <= 90) buckets.days61_90 += unbilled;
    else if (e.agingDays <= 120) buckets.days91_120 += unbilled;
    else buckets.over120 += unbilled;
  }
  return buckets;
}

// ── Cost Forecasts / Cost-to-Complete ─────────────────────────────────────

export type ForecastCategory = "labor" | "material" | "equipment" | "subcontractor" | "overhead";

export interface CostForecast {
  id: string;
  projectId: string;
  category: ForecastCategory;
  originalBudget: number;
  revisedBudget: number;
  actualToDate: number;
  committed: number;
  estimatedToComplete: number;
  forecastFinal: number;
  variance: number;
  variancePct: number;
  notes: string | null;
  forecastBy: string | null;
  forecastAt: string;
  version: number;
}

function mapForecast(r: Record<string, unknown>): CostForecast {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    category: String(r.category) as ForecastCategory,
    originalBudget: Number(r.original_budget ?? 0),
    revisedBudget: Number(r.revised_budget ?? 0),
    actualToDate: Number(r.actual_to_date ?? 0),
    committed: Number(r.committed ?? 0),
    estimatedToComplete: Number(r.estimated_to_complete ?? 0),
    forecastFinal: Number(r.forecast_final ?? 0),
    variance: Number(r.variance ?? 0),
    variancePct: Number(r.variance_pct ?? 0),
    notes: r.notes == null ? null : String(r.notes),
    forecastBy: r.forecast_by == null ? null : String(r.forecast_by),
    forecastAt: String(r.forecast_at ?? ""),
    version: Number(r.version ?? 1),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listCostForecasts(client: any, projectId: string): Promise<Result<CostForecast[]>> {
  try {
    const { data, error } = await client.from("cost_forecasts")
      .select("id, project_id, category, original_budget, revised_budget, actual_to_date, committed, estimated_to_complete, forecast_final, variance, variance_pct, notes, forecast_by, forecast_at, version")
      .eq("project_id", projectId)
      .order("forecast_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as any[]).map(mapForecast));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertCostForecast(client: any, input: { projectId: string; category: ForecastCategory; originalBudget?: number; revisedBudget?: number; actualToDate?: number; committed?: number; estimatedToComplete?: number; notes?: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("cost_forecasts").upsert({
      project_id: input.projectId,
      category: input.category,
      original_budget: input.originalBudget ?? 0,
      revised_budget: input.revisedBudget ?? input.originalBudget ?? 0,
      actual_to_date: input.actualToDate ?? 0,
      committed: input.committed ?? 0,
      estimated_to_complete: input.estimatedToComplete ?? 0,
      notes: input.notes ?? null,
      forecast_by: "user", // will be set by RLS/auth
    }, { onConflict: "project_id,category" }).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// Pure: project-level cost forecast rollup
export interface ProjectCostRollup {
  totalOriginalBudget: number;
  totalRevisedBudget: number;
  totalActualToDate: number;
  totalCommitted: number;
  totalEstimatedToComplete: number;
  totalForecastFinal: number;
  totalVariance: number;
  totalVariancePct: number;
  byCategory: Record<ForecastCategory, { budget: number; actual: number; forecast: number; variance: number }>;
}

export function rollupCostForecasts(forecasts: CostForecast[]): ProjectCostRollup {
  const rollup: ProjectCostRollup = {
    totalOriginalBudget: 0,
    totalRevisedBudget: 0,
    totalActualToDate: 0,
    totalCommitted: 0,
    totalEstimatedToComplete: 0,
    totalForecastFinal: 0,
    totalVariance: 0,
    totalVariancePct: 0,
    byCategory: {
      labor: { budget: 0, actual: 0, forecast: 0, variance: 0 },
      material: { budget: 0, actual: 0, forecast: 0, variance: 0 },
      equipment: { budget: 0, actual: 0, forecast: 0, variance: 0 },
      subcontractor: { budget: 0, actual: 0, forecast: 0, variance: 0 },
      overhead: { budget: 0, actual: 0, forecast: 0, variance: 0 },
    },
  };
  for (const f of forecasts) {
    rollup.totalOriginalBudget += f.originalBudget;
    rollup.totalRevisedBudget += f.revisedBudget;
    rollup.totalActualToDate += f.actualToDate;
    rollup.totalCommitted += f.committed;
    rollup.totalEstimatedToComplete += f.estimatedToComplete;
    rollup.totalForecastFinal += f.forecastFinal;
    rollup.totalVariance += f.variance;
    const cat = rollup.byCategory[f.category];
    cat.budget += f.revisedBudget;
    cat.actual += f.actualToDate + f.committed;
    cat.forecast += f.forecastFinal;
    cat.variance += f.variance;
  }
  rollup.totalVariancePct = rollup.totalRevisedBudget > 0 ? Math.round((rollup.totalVariance / rollup.totalRevisedBudget) * 100) : 0;
  return rollup;
}

// ── Budget Changes / Reallocation ─────────────────────────────────────────

export type BudgetChangeType = "increase" | "decrease" | "reallocate" | "contingency_use";
export type BudgetCategory = "labor" | "material" | "equipment" | "subcontractor" | "overhead" | "contingency";

export interface BudgetChange {
  id: string;
  projectId: string;
  changeType: BudgetChangeType;
  category: BudgetCategory;
  amount: number;
  fromCategory: string | null;
  reason: string;
  approvedBy: string | null;
  approvedAt: string | null;
  status: "pending" | "approved" | "rejected";
  createdBy: string | null;
  createdAt: string;
}

function mapBudgetChange(r: Record<string, unknown>): BudgetChange {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    changeType: String(r.change_type) as BudgetChangeType,
    category: String(r.category) as BudgetCategory,
    amount: Number(r.amount ?? 0),
    fromCategory: r.from_category == null ? null : String(r.from_category),
    reason: String(r.reason ?? ""),
    approvedBy: r.approved_by == null ? null : String(r.approved_by),
    approvedAt: r.approved_at == null ? null : String(r.approved_at),
    status: String(r.status ?? "pending") as "pending" | "approved" | "rejected",
    createdBy: r.created_by == null ? null : String(r.created_by),
    createdAt: String(r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listBudgetChanges(client: any, projectId: string): Promise<Result<BudgetChange[]>> {
  try {
    const { data, error } = await client.from("budget_changes")
      .select("id, project_id, change_type, category, amount, from_category, reason, approved_by, approved_at, status, created_by, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as any[]).map(mapBudgetChange));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createBudgetChange(client: any, input: { projectId: string; changeType: BudgetChangeType; category: BudgetCategory; amount: number; fromCategory?: string; reason: string }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("budget_changes").insert({
      project_id: input.projectId,
      change_type: input.changeType,
      category: input.category,
      amount: input.amount,
      from_category: input.fromCategory ?? null,
      reason: input.reason,
    }).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function approveBudgetChange(client: any, id: string, approved: boolean): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("budget_changes").update({
      status: approved ? "approved" : "rejected",
      approved_by: "user", // set by auth
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// Pure: compute budget impact
export interface BudgetImpact {
  category: BudgetCategory;
  currentBudget: number;
  proposedChange: number;
  newBudget: number;
}

export function computeBudgetImpact(changes: BudgetChange[]): BudgetImpact[] {
  const map = new Map<BudgetCategory, { current: number; change: number }>();
  for (const c of changes) {
    if (c.status !== "approved") continue;
    const existing = map.get(c.category) ?? { current: 0, change: 0 };
    existing.change += c.amount;
    map.set(c.category, existing);
  }
  return Array.from(map.entries()).map(([category, v]) => ({
    category,
    currentBudget: v.current,
    proposedChange: v.change,
    newBudget: v.current + v.change,
  }));
}

// ── RPC Wrappers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recomputeProjectFinancials(client: any, projectId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.rpc("recompute_project_financials", { p_project_id: projectId });
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}