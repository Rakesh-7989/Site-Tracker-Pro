import { useState, useEffect, useCallback } from "react";
import { useAuth, useOrgSwitcher, PlanGate } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { Spinner, Alert, Icon, Button } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { ChartCard } from "@/components/ui/ChartCard";
import { LineChart, type ChartDatum } from "@/components/ui/Charts";
import { listProjectsForOrg, memberProjectScope, type ProjectSummary } from "@/app/queries";
import { getClient } from "@/lib/supabase";
import {
  getProjectForecastDetail, getBoqForProject, getRaBillsForProject,
  getLedgerForProject, getUpdatesForProject,
  type ProjectForecastDetail, type BoqItem, type RaBill, type LedgerEntry, type SiteUpdate,
} from "@/app/forecastQueries";
import { forecastWithLlm } from "@/lib/aiForecast";
import { getProviderConfig } from "@/lib/ai";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtCur = (n: any) => { if (n == null || n === "") return "—"; const num = Number(n); if (!Number.isFinite(num)) return "—"; return "₹" + num.toLocaleString("en-IN"); };



function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** Short month label for a bill date (fallback to the raw string when invalid). */
export function monthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { month: "short" });
}

/** Cumulative RA-billed burn-up series, oldest bill first, undated / zero bills skipped. */
export function burnUpSeries(raBills: RaBill[]): ChartDatum[] {
  const dated = raBills
    .filter(r => r.bill_date && r.bill_amount > 0)
    .slice()
    .sort((a, b) => String(a.bill_date).localeCompare(String(b.bill_date)));
  let acc = 0;
  return dated.map(r => {
    acc += r.bill_amount;
    return { label: monthLabel(String(r.bill_date)), value: acc };
  });
}

export function ForecastView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <PlanGate feature="ai_forecast"><Inner orgId={activeOrg.orgId} /></PlanGate>;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const session = useSession();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selProject, setSelProject] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [forecast, setForecast] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [projectDetail, setProjectDetail] = useState<ProjectForecastDetail | null>(null);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [raBills, setRaBills] = useState<RaBill[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [siteUpdates, setSiteUpdates] = useState<SiteUpdate[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const client = await getClient();
      if (!client) { setLoading(false); return; }
      const res = await listProjectsForOrg(client, orgId, memberProjectScope(session));
      if (cancelled) return;
      if (res.ok) {
        setProjects(res.data);
        if (res.data.length > 0) setSelProject(res.data[0].id);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  useEffect(() => {
    if (!selProject) return;
    let cancelled = false;
    void (async () => {
      setDataLoading(true);
      const client = await getClient();
      if (!client || cancelled) { setDataLoading(false); return; }
      const [dRes, bRes, rRes, lRes, uRes] = await Promise.all([
        getProjectForecastDetail(client, selProject),
        getBoqForProject(client, selProject),
        getRaBillsForProject(client, selProject),
        getLedgerForProject(client, selProject),
        getUpdatesForProject(client, selProject),
      ]);
      if (cancelled) return;
      if (dRes.ok) setProjectDetail(dRes.data);
      if (bRes.ok) setBoqItems(bRes.data);
      if (rRes.ok) setRaBills(rRes.data);
      if (lRes.ok) setLedgerEntries(lRes.data);
      if (uRes.ok) setSiteUpdates(uRes.data);
      setDataLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selProject]);

  const proj = projects.find(p => p.id === selProject);
  const cached = forecast[selProject];
  const burn = burnUpSeries(raBills);

  const runForecast = useCallback(async () => {
    if (!proj) return;
    setBusy(true);
    const project = projectDetail ?? { id: proj.id, name: proj.name, budget: 0, progress: 0, start_date: null, expected_end_date: null };
    const state = { project, boq: boqItems, ra: raBills, ledger: ledgerEntries, updates: siteUpdates };
    const cfg = getProviderConfig();
    const result = await forecastWithLlm(state, cfg);
    setForecast(p => ({ ...p, [selProject]: { ...result, generated_at: new Date().toISOString() } }));
    setBusy(false);
  }, [proj, selProject, projectDetail, boqItems, raBills, ledgerEntries, siteUpdates]);

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (projects.length === 0) return <div className="p-10 text-center text-fg-secondary">No projects to forecast.</div>;
  if (dataLoading) return <div className="grid place-items-center p-12"><Spinner size={24} /><span className="mt-3 text-sm text-fg-secondary">Loading project data...</span></div>;

  return (
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3 border-b border-default">
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— AI advisor</div>
          <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Cost Forecast</h1>
          <p className="text-fg-secondary text-sm mt-2">Burn-rate analysis + AI narrative. Predicts probable overrun and schedule slip.</p>
        </div>
        <Select fit className="w-56" value={selProject || ""} onChange={e => setSelProject(e.target.value)} options={projects.map(p => ({ value: p.id, label: p.name }))} />
      </div>
      <div className="mb-5 flex items-center gap-3 flex-wrap">
            <Button variant="gold" onClick={runForecast} disabled={busy} leftIcon={<Icon name="zap" size={14} />}>{busy ? "Forecasting..." : cached ? "Re-forecast" : "Run forecast"}</Button>
            {cached && <span className="text-[11px] text-fg-secondary">Last run {fmtTime(cached.generated_at)}</span>}
          </div>
          {cached ? (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="bg-panel rounded-2xl p-4 shadow-editorial border-default"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-secondary mb-1">Budget</div><div className="font-display text-xl font-bold text-fg-primary">{fmtCur(cached.budget)}</div></div>
              <div className="bg-panel rounded-2xl p-4 shadow-editorial border-default"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-secondary mb-1">Billed so far</div><div className="font-display text-xl font-bold text-fg-primary">{fmtCur(cached.billed_so_far)}</div></div>
              <div className="bg-panel rounded-2xl p-4 shadow-editorial border-default"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-secondary mb-1">Projected total</div><div className="font-display text-xl font-bold text-fg-primary">{fmtCur(cached.projected_total)}</div></div>
              <div className={`rounded-2xl p-4 shadow-editorial border-default ${cached.overrun_amount > 0 ? "bg-error-tint" : "bg-success-tint"}`}><div className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-1 ${cached.overrun_amount > 0 ? "text-error" : "text-success"}`}>Likely overrun</div><div className={`font-display text-xl font-bold ${cached.overrun_amount > 0 ? "text-error" : "text-success"}`}>{cached.overrun_amount > 0 ? `+${fmtCur(cached.overrun_amount)} (${cached.overrun_pct}%)` : "On track"}</div></div>
            </div>
            <ChartCard
              title="Cumulative RA billings"
              subtitle={`Budget ${fmtCur(cached.budget)} · ${raBills.length} RA bills`}
              empty={burn.length === 0}
              emptyMessage="No dated RA bills yet"
              emptyIcon="trend"
              className="mb-5"
            >
              <LineChart data={burn} color="var(--st-accent)" showPoints />
            </ChartCard>
            {cached.narrative && <div className="bg-panel rounded-2xl p-5 mb-5 shadow-editorial border-default"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-warning mb-2">— Advisor narrative ({cached.mode === "llm" ? "LLM-enriched" : "deterministic"})</div><p className="text-fg-primary text-sm leading-relaxed">{cached.narrative}</p></div>}
            {cached.over_consumed_materials?.length > 0 && <div className="bg-panel rounded-2xl p-5 mb-5 shadow-editorial border-default"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-warning mb-3">— Materials trending over plan</div><div className="space-y-2">{cached.over_consumed_materials.map((m: any) => (<div key={m.name} className="flex items-center justify-between text-sm"><span className="font-semibold text-fg-primary capitalize">{m.name}</span><span className="text-error font-mono">{m.planned} → {m.consumed} (<strong>+{m.over_pct}%</strong>)</span></div>))}</div></div>}
            <div className="text-[11px] text-fg-secondary text-center">Schedule slip: <strong>{cached.schedule_slip_days} days</strong> · Confidence: <strong>{cached.confidence}</strong></div>
          </>) : (<div className="bg-panel rounded-2xl p-12 text-center" style={{ border: "1px dashed var(--st-line)" }}><div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-warning-tint flex items-center justify-center"><Icon name="zap" size={24} className="text-warning" /></div><div className="font-display text-lg font-semibold text-fg-primary tracking-editorial mb-2">Forecast not yet run</div><p className="text-fg-secondary text-sm max-w-md mx-auto">Click "Run forecast" to analyse BOQ + RA bills + ledger consumption + timeline. Configure an AI key in Settings for narrative enrichment.</p></div>)}
    </div>
  );
}
