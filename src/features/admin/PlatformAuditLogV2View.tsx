import { useEffect, useState, useCallback } from "react";
import { useAuth, useOrgSwitcher, useCan } from "@/auth";
import { Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { exportAuditCsv } from "@/lib/audit";
import { getClient } from "@/lib/supabase";
import { downloadCsv as triggerCsv, csvDateStamp } from "@/lib/genericCsv";
import {
  listAuditLog, getAuditActors, getAuditStats,
  type AuditLogRow, type AuditStats,
} from "@/app/auditLogQueries";

function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const COLUMNS: Column<AuditLogRow>[] = [
  {
    key: "ts", header: "Time", className: "flex-shrink-0",
    render: r => <span className="text-[11px] text-fg-secondary font-mono">{fmtTime(r.ts)}</span>,
  },
  {
    key: "actor", header: "Actor", hideOnMobile: true, className: "flex-shrink-0",
    render: r => <div><span className="font-semibold text-fg-primary text-xs">{r.actorName}</span><div className="text-[10px] text-fg-secondary">{r.actorRole}</div></div>,
  },
  {
    key: "action", header: "Action", className: "flex-shrink-0",
    render: r => {
      const tone = r.action === "APPROVE" ? "bg-success-tint text-success" : r.action === "REJECT" || r.action === "DELETE" ? "bg-error-tint text-error" : "bg-warning-tint text-warning";
      return <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${tone}`}>{r.action}</span>;
    },
  },
  {
    key: "resource", header: "Resource", hideOnMobile: true, className: "flex-shrink-0",
    render: r => <span className="text-xs text-fg-primary">{r.resource}{r.resourceId ? ` #${String(r.resourceId).slice(0, 12)}` : ""}</span>,
  },
  {
    key: "message", header: "Message", className: "flex-1 min-w-0",
    render: r => <span className="text-xs text-fg-secondary truncate">{r.message || (r.projectId ? `Project ${r.projectId}` : "\u2014")}</span>,
  },
];

export function PlatformAuditLogV2View(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const can = useCan("platform:audit:read:cross-org");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
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
    triggerCsv(`audit_${csvDateStamp()}.csv`, exportAuditCsv(filtered));
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3 border-b-st-line">
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Compliance</div>
          <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Audit Log</h1>
          <p className="text-fg-secondary text-sm mt-2">Immutable append-only record · {stats.total} entries · {stats.recent} in last 7 days.</p>
        </div>
        <button onClick={downloadCsv} disabled={filtered.length === 0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-cream font-bold rounded-xl text-sm tracking-wide disabled:opacity-50"><Icon name="download" size={14} />Export CSV</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-bg-primary rounded-2xl p-4 shadow-editorial border-default"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-secondary mb-1">Total</div><div className="font-display text-2xl font-bold text-fg-primary">{stats.total}</div></div>
        <div className="bg-bg-primary rounded-2xl p-4 shadow-editorial border-default"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-secondary mb-1">Last 7 days</div><div className="font-display text-2xl font-bold text-warning">{stats.recent}</div></div>
        <div className="bg-bg-primary rounded-2xl p-4 shadow-editorial border-default"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-secondary mb-1">Approvals</div><div className="font-display text-2xl font-bold text-success">{stats.byAction?.APPROVE || 0}</div></div>
        <div className="bg-bg-primary rounded-2xl p-4 shadow-editorial border-default"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-secondary mb-1">Rejections</div><div className="font-display text-2xl font-bold text-error">{stats.byAction?.REJECT || 0}</div></div>
      </div>
      <div className="bg-bg-primary rounded-2xl p-4 mb-5 grid sm:grid-cols-4 gap-3 border-default">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search actor / message / id..." />
        <Select value={actorFilter} onChange={e => setActorFilter(e.target.value)} options={[{ value: "", label: "All actors" }, ...actors.map(u => ({ value: u.id, label: u.name }))]} />
        <Select value={actionFilter} onChange={e => setActionFilter(e.target.value)} options={[{ value: "", label: "All actions" }, ...["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "RELEASE", "UPLOAD", "LOGIN", "IMPERSONATE", "EXPORT", "PAYMENT", "DELEGATE"].map(a => ({ value: a, label: a }))]} />
        <Select value={resourceFilter} onChange={e => setResourceFilter(e.target.value)} options={[{ value: "", label: "All resources" }, ...["project", "drawing", "boq", "ra_bill", "mb", "po", "invoice", "issue", "rfi", "change_order", "user", "org", "subscription", "comment", "unit", "block", "floor"].map(r => ({ value: r, label: r }))]} />
      </div>
      <div className="bg-bg-primary rounded-2xl overflow-hidden shadow-editorial border-default">
        <DataTable columns={COLUMNS} rows={filtered.slice(0, 200)} rowKey={r => r.id} emptyMessage={auditLog.length === 0 ? "No audit entries yet." : "No entries match the filters."} />
        {filtered.length > 200 && <div className="px-5 py-3 text-[11px] text-fg-secondary text-center italic">Showing first 200 — refine filters or export CSV for the full set.</div>}
      </div>
    </div>
  );
}
