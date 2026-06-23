import { useEffect, useState, useCallback } from "react";
import { useAuth, useOrgSwitcher } from "@/auth";
import { Spinner, Alert, Icon } from "@/components/ui/atoms";
import { exportAuditCsv } from "@/lib/audit";
import {
  listAuditLog, getAuditActors, getAuditStats,
  type AuditLogRow, type AuditStats,
} from "@/app/auditLogQueries";

function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

async function getClient() {
  const mod = await import("../../lib/supabase.js");
  return await (mod as any).getSupabaseClient();
}

export function PlatformAuditLogV2View(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const [auditLog, setAuditLog] = useState<AuditLogRow[]>([]);
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState<AuditStats>({ total: 0, recent: 0, byAction: {} });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");

  const fetchData = useCallback(async (searchQ?: string, actorId?: string, action?: string, resource?: string) => {
    const client = await getClient();
    if (!client) return;
    const [logRes, actorRes, statsRes] = await Promise.all([
      listAuditLog(client, orgId, {
        q: searchQ ?? q,
        actorId: actorId ?? actorFilter,
        action: action ?? actionFilter,
        resource: resource ?? resourceFilter,
        limit: 200,
      }),
      getAuditActors(client, orgId),
      getAuditStats(client, orgId, 7),
    ]);
    if (logRes.ok) setAuditLog(logRes.data);
    if (actorRes.ok) setActors(actorRes.data);
    if (statsRes.ok) setStats(statsRes.data);
  }, [orgId, q, actorFilter, actionFilter, resourceFilter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await fetchData();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchData]);

  const filtered = auditLog;
  const downloadCsv = () => {
    const csv = exportAuditCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `audit_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{ borderBottom: "1px solid var(--st-line)" }}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Compliance</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Audit Log</h1>
          <p className="text-ink-500 text-sm mt-2">Immutable append-only record · {stats.total} entries · {stats.recent} in last 7 days.</p>
        </div>
        <button onClick={downloadCsv} disabled={filtered.length === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-cream font-bold rounded-xl text-sm tracking-wide disabled:opacity-50"><Icon name="download" size={14} />Export CSV</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Total</div><div className="font-display text-2xl font-bold text-ink-900">{stats.total}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Last 7 days</div><div className="font-display text-2xl font-bold text-amber-700">{stats.recent}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Approvals</div><div className="font-display text-2xl font-bold text-emerald-700">{stats.byAction?.APPROVE || 0}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Rejections</div><div className="font-display text-2xl font-bold text-red-700">{stats.byAction?.REJECT || 0}</div></div>
      </div>
      <div className="bg-white rounded-2xl p-4 mb-5 grid sm:grid-cols-4 gap-3" style={{ border: "1px solid var(--st-line)" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search actor / message / id…" className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600" />
        <select value={actorFilter} onChange={e => setActorFilter(e.target.value)} className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">All actors</option>{actors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">All actions</option>{["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "RELEASE", "UPLOAD", "LOGIN", "IMPERSONATE", "EXPORT", "PAYMENT", "DELEGATE"].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={resourceFilter} onChange={e => setResourceFilter(e.target.value)} className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">All resources</option>{["project", "drawing", "boq", "ra_bill", "mb", "po", "invoice", "issue", "rfi", "change_order", "user", "org", "subscription", "comment", "unit", "block", "floor"].map(r => <option key={r} value={r}>{r}</option>)}</select>
      </div>
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
        {filtered.length === 0 ? <div className="p-12 text-center text-ink-500"><Icon name="search" size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">{auditLog.length === 0 ? "No audit entries yet. As users approve / reject / release, entries appear here." : "No entries match the filters."}</p></div> :
          <div className="divide-y divide-stone-100">{filtered.slice(0, 200).map((r: AuditLogRow) => (<div key={r.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center text-xs">
            <div className="col-span-2 text-[11px] text-ink-500 font-mono">{fmtTime(r.ts)}</div>
            <div className="col-span-3"><span className="font-semibold text-ink-900">{r.actorName}</span><div className="text-[10px] text-ink-500">{r.actorRole}</div></div>
            <div className="col-span-1"><span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${r.action === "APPROVE" ? "bg-emerald-50 text-emerald-700" : r.action === "REJECT" || r.action === "DELETE" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{r.action}</span></div>
            <div className="col-span-2 text-ink-700">{r.resource}{r.resourceId ? ` #${String(r.resourceId).slice(0, 12)}` : ""}</div>
            <div className="col-span-4 text-ink-600 truncate">{r.message || (r.projectId ? `Project ${r.projectId}` : "—")}</div>
          </div>))}{filtered.length > 200 && <div className="px-5 py-3 text-[11px] text-ink-500 text-center italic">Showing first 200 — refine filters or export CSV for the full set.</div>}</div>
        }
      </div>
    </div>
  );
}
