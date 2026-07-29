import { useEffect, useState, useCallback } from "react";
import { useAuth, useOrgSwitcher } from "@/auth";
import { Alert, Spinner } from "@/components/ui/atoms";
import { listProjectsForOrg, type ProjectSummary } from "@/app/queries";
import { getClient } from "@/lib/supabase";
import {
  checkReraStatus, checkGstinStatus, checkEpfoStatus, projectComplianceStatus,
} from "@/lib/compliance";


export function ComplianceView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selProject, setSelProject] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [compliance, setCompliance] = useState<Record<string, any>>({});
  const [reraInput, setReraInput] = useState("");
  const [gstInput, setGstInput] = useState("");
  const [epfoInput, setEpfoInput] = useState("");

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
        if (res.data.length > 0) { setSelProject(res.data[0].id); }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  useEffect(() => {
    setReraInput(compliance[selProject]?.rera?.number ?? "");
    setGstInput(compliance[selProject]?.gst?.number ?? "");
    setEpfoInput(compliance[selProject]?.epfo?.number ?? "");
  }, [selProject, compliance]);

  const projChecks = compliance[selProject] ?? {};
  const status = projectComplianceStatus(projChecks);
  const visible = projects;

  const runCheck = useCallback(async (type: "rera" | "gst" | "epfo") => {
    setBusy(true);
    let res: any;
    let number: string;
    if (type === "rera") { number = reraInput; res = await checkReraStatus(reraInput); }
    else if (type === "gst") { number = gstInput; res = await checkGstinStatus(gstInput); }
    else { number = epfoInput; res = await checkEpfoStatus(epfoInput); }
    setCompliance(p => ({ ...p, [selProject]: { ...(p[selProject] ?? {}), [type]: { ...res, number } } }));
    setBusy(false);
  }, [reraInput, gstInput, epfoInput, selProject]);

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (visible.length === 0) return <div className="p-10 text-center text-fg-secondary">No projects to verify. Create one first.</div>;

  const dotColor = { emerald: "bg-success", amber: "bg-accent", red: "bg-error", stone: "bg-secondary" }[status.color];

  return (
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3 border-b border-default">
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-accent-2 mb-2">— Compliance</div>
          <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Statutory Checks</h1>
          <p className="text-fg-secondary text-sm mt-2">RERA · GSTIN · EPFO — format validation + async portal verification.</p>
        </div>
        <select value={selProject || ""} onChange={e => setSelProject(e.target.value)} className="px-4 py-2.5 bg-panel border border-default rounded-xl text-sm font-semibold outline-none focus:border-accent">{visible.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div className="mb-6 bg-panel rounded-2xl p-5 flex items-center gap-4 shadow-editorial border-default">
        <span className={`w-3 h-3 rounded-full ${dotColor}`} /><div className="flex-1"><div className="font-display text-lg font-semibold text-fg-primary tracking-editorial">{status.label}</div><div className="text-[11px] text-fg-secondary">Project: {projects.find(p => p.id === selProject)?.name}</div></div>
      </div>
      <div className="space-y-4">
        {[
          { key: "rera" as const, label: "RERA Registration", placeholder: "e.g. TS/RERA/PROJECT/12345", val: reraInput, setVal: setReraInput as (v: string) => void, result: projChecks.rera, extra: projChecks.rera?.registered_until ? `Registered until ${projChecks.rera.registered_until}` : projChecks.rera?.project_name ?? "" },
          { key: "gst" as const, label: "GSTIN (vendor / payee)", placeholder: "15-char e.g. 36AAACT2727Q1ZZ", val: gstInput, setVal: setGstInput as (v: string) => void, result: projChecks.gst, extra: projChecks.gst?.legal_name ? `${projChecks.gst.legal_name} (${projChecks.gst.state ?? ""})` : "" },
          { key: "epfo" as const, label: "EPFO (contractor)", placeholder: "e.g. TS/HYD/0123456", val: epfoInput, setVal: setEpfoInput as (v: string) => void, result: projChecks.epfo, extra: projChecks.epfo?.employer_name ?? "" },
        ].map(row => {
          const verified = row.result?.verified;
          const ok = verified && (row.result.status === "REGISTERED_ACTIVE" || row.result.status === "ACTIVE" || row.result.status === "COMPLIANT");
          return (<div key={row.key} className="bg-panel rounded-2xl p-5 shadow-editorial border-default">
            <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
              <div><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary">{row.label}</div>{row.result && <div className={`mt-1 text-[11px] font-bold ${ok ? "text-success" : verified ? "text-accent-2" : "text-error"}`}>{ok ? `✓ ${row.result.status}` : verified ? `âš  ${row.result.status}` : `✗ ${row.result.reason || "Verification failed"}`}{row.extra && ` — ${row.extra}`}</div>}</div>
            </div>
            <div className="flex gap-2">
              <input value={row.val} onChange={e => row.setVal(e.target.value)} placeholder={row.placeholder} className="flex-1 p-3 border border-default rounded-xl text-sm outline-none focus:border-accent" />
              <button onClick={() => runCheck(row.key)} disabled={busy || !row.val.trim()} className="px-4 py-3 bg-ink text-cream font-bold rounded-xl text-sm tracking-wide disabled:opacity-50">{busy ? "Checking..." : "Verify"}</button>
            </div>
          </div>);
        })}
      </div>
      <p className="text-[11px] text-fg-secondary mt-6 leading-relaxed">External checks are mocked in this build. Production wires Department of Stamps / GST portal / EPFO portal — see <span className="font-semibold">docs/GOLIVE.md</span>.</p>
    </div>
  );
}
