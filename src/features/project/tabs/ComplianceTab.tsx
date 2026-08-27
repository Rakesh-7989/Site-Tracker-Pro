// SiteTrack Pro — project Compliance tab (v3 port, DB-wired). Project-level
// RERA / GST / EPFO / PAN filings. Visible to compliance:view; editing needs a
// filing capability (rera/gstn/epfo).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listCompliance, createCompliance, setComplianceStatus, deleteCompliance, type ComplianceItem, type ComplianceKind, type ComplianceStatus } from "@/app/queries/siteAdminQueries";

 
import { getClient } from "@/lib/supabase/supabase";
import { useAction } from "@/hooks/useAction";
const KIND_OPTS = [{ value: "rera", label: "RERA" }, { value: "gst", label: "GST" }, { value: "epfo", label: "EPFO" }, { value: "pan", label: "PAN" }, { value: "other", label: "Other" }];
const STATUS_OPTS = [{ value: "pending", label: "Pending" }, { value: "filed", label: "Filed" }, { value: "accepted", label: "Accepted" }, { value: "rejected", label: "Rejected" }, { value: "expired", label: "Expired" }, { value: "renewal_due", label: "Renewal due" }];
const tone = (s: ComplianceStatus): "neutral" | "info" | "success" | "danger" | "warning" => (s === "accepted" ? "success" : s === "filed" ? "info" : s === "rejected" || s === "expired" ? "danger" : s === "renewal_due" ? "warning" : "neutral");

export function ComplianceTab({ projectId, orgId }: { projectId: string; orgId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canEditRera = useCan("rera:file", ctx);
  const canEditGstn = useCan("gstn:file", ctx);
  const canEditEpfo = useCan("epfo:file", ctx);
  const canEdit = canEditRera || canEditGstn || canEditEpfo;
  const [rows, setRows] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ComplianceKind>("rera"); const [ref, setRef] = useState(""); const [stage, setStage] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listCompliance(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createCompliance(c, { orgId, projectId, kind, refNo: ref.trim() || undefined, stage: stage.trim() || undefined, filedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, kind, refNo: ref.trim() || null, stage: stage.trim() || null, status: "pending" as ComplianceStatus, expiresAt: null, notes: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setRef(""); setStage("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Compliance &amp; filings</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Type</span><Select fit className="mt-1 w-28" value={kind} onChange={e => setKind(e.target.value as ComplianceKind)} options={KIND_OPTS} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Reference no.</span><Input className="mt-1" placeholder="e.g. P02400003456" value={ref} onChange={e => setRef(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Stage</span><Input fit className="mt-1 w-32" placeholder="foundation" value={stage} onChange={e => setStage(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add"}>{busy === "add" ? <Spinner size={14} /> : "Add filing"}</Button>
        </Card>
      )}
      {loading ? <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No filings tracked.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate uppercase">{r.kind}{r.refNo ? <span className="text-fg-secondary font-normal normal-case"> · {r.refNo}</span> : null}</div>
                <div className="text-[11px] text-fg-tertiary">{[r.stage, r.expiresAt && `expires ${r.expiresAt.slice(0, 10)}`].filter(Boolean).join(" · ") || "—"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select fit className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as ComplianceStatus; void run(`s-${r.id}`, c => setComplianceStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STATUS_OPTS} />
                  : <Badge tone={tone(r.status)}>{r.status}</Badge>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteCompliance(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><span className="text-error">✕</span></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
