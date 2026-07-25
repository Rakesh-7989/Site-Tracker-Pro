import { useState, useEffect, useCallback } from "react";
import { useAuth, useOrgSwitcher, PlanGate } from "@/auth";
import { Spinner, Alert, Icon } from "@/components/ui/atoms";
import { listProjectsForOrg, type ProjectSummary } from "@/app/queries";
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

export function ForecastView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <PlanGate feature="ai_forecast"><Inner orgId={activeOrg.orgId} /></PlanGate>;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
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
      const res = await listProjectsForOrg(client, orgId);
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
  if (projects.length === 0) return <div className="p-10 text-center text-ink-500">No projects to forecast.</div>;
  if (dataLoading) return <div className="grid place-items-center p-12"><Spinner size={24} /><span className="mt-3 text-sm text-ink-500">Loading project data...</span></div>;

  return (
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{ borderBottom: "1px solid var(--st-line)" }}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— AI advisor</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Cost Forecast</h1>
          <p className="text-ink-500 text-sm mt-2">Burn-rate analysis + AI narrative. Predicts probable overrun and schedule slip.</p>
        </div>
        <select value={selProject || ""} onChange={e => setSelProject(e.target.value)} className="px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-600">{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div className="mb-5 flex items-center gap-3 flex-wrap">
            <button onClick={runForecast} disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep disabled:opacity-60"><Icon name="zap" size={14} />{busy ? "Forecasting..." : cached ? "Re-forecast" : "Run forecast"}</button>
            {cached && <span className="text-[11px] text-ink-500">Last run {fmtTime(cached.generated_at)}</span>}
          </div>
          {cached ? (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Budget</div><div className="font-display text-xl font-bold text-ink-900">{fmtCur(cached.budget)}</div></div>
              <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Billed so far</div><div className="font-display text-xl font-bold text-ink-900">{fmtCur(cached.billed_so_far)}</div></div>
              <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Projected total</div><div className="font-display text-xl font-bold text-ink-900">{fmtCur(cached.projected_total)}</div></div>
              <div className={`rounded-2xl p-4 shadow-editorial ${cached.overrun_amount > 0 ? "bg-red-50" : "bg-emerald-50"}`} style={{ border: "1px solid var(--st-line)" }}><div className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-1 ${cached.overrun_amount > 0 ? "text-red-700" : "text-emerald-700"}`}>Likely overrun</div><div className={`font-display text-xl font-bold ${cached.overrun_amount > 0 ? "text-red-700" : "text-emerald-700"}`}>{cached.overrun_amount > 0 ? `+${fmtCur(cached.overrun_amount)} (${cached.overrun_pct}%)` : "On track"}</div></div>
            </div>
            {cached.narrative && <div className="bg-white rounded-2xl p-5 mb-5 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-2">— Advisor narrative ({cached.mode === "llm" ? "LLM-enriched" : "deterministic"})</div><p className="text-ink-800 text-sm leading-relaxed">{cached.narrative}</p></div>}
            {cached.over_consumed_materials?.length > 0 && <div className="bg-white rounded-2xl p-5 mb-5 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-3">— Materials trending over plan</div><div className="space-y-2">{cached.over_consumed_materials.map((m: any) => (<div key={m.name} className="flex items-center justify-between text-sm"><span className="font-semibold text-ink-900 capitalize">{m.name}</span><span className="text-red-700 font-mono">{m.planned} → {m.consumed} (<strong>+{m.over_pct}%</strong>)</span></div>))}</div></div>}
            <div className="text-[11px] text-ink-500 text-center">Schedule slip: <strong>{cached.schedule_slip_days} days</strong> · Confidence: <strong>{cached.confidence}</strong></div>
          </>) : (<div className="bg-white rounded-2xl p-12 text-center" style={{ border: "1px dashed var(--st-line)" }}><div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Icon name="zap" size={24} className="text-amber-700" /></div><div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-2">Forecast not yet run</div><p className="text-ink-500 text-sm max-w-md mx-auto">Click "Run forecast" to analyse BOQ + RA bills + ledger consumption + timeline. Configure an AI key in Settings for narrative enrichment.</p></div>)}
    </div>
  );
}
