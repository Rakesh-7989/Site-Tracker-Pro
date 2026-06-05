// SiteTrack Pro — project Compliance tab (v3 port, DB-wired). Project-level
// RERA / GST / EPFO / PAN filings. Visible to compliance:view; editing needs a
// filing capability (rera/gstn/epfo).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listCompliance, createCompliance, setComplianceStatus, deleteCompliance, type ComplianceItem, type ComplianceKind, type ComplianceStatus } from "@/app/siteAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const KIND_OPTS = [{ value: "rera", label: "RERA" }, { value: "gst", label: "GST" }, { value: "epfo", label: "EPFO" }, { value: "pan", label: "PAN" }, { value: "other", label: "Other" }];
const STATUS_OPTS = [{ value: "pending", label: "Pending" }, { value: "filed", label: "Filed" }, { value: "accepted", label: "Accepted" }, { value: "rejected", label: "Rejected" }, { value: "expired", label: "Expired" }, { value: "renewal_due", label: "Renewal due" }];
const tone = (s: ComplianceStatus): "neutral" | "info" | "success" | "danger" | "warning" => (s === "accepted" ? "success" : s === "filed" ? "info" : s === "rejected" || s === "expired" ? "danger" : s === "renewal_due" ? "warning" : "neutral");

export function ComplianceTab({ projectId, orgId }: { projectId: string; orgId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canEdit = useCan("rera:file", ctx) || useCan("gstn:file", ctx) || useCan("epfo:file", ctx);
  const [rows, setRows] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<ComplianceKind>("rera"); const [ref, setRef] = useState(""); const [stage, setStage] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listCompliance(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { if (!session) return; await run("add", c => createCompliance(c, { orgId, projectId, kind, refNo: ref.trim() || undefined, stage: stage.trim() || undefined, filedBy: session.user.id })); setRef(""); setStage(""); };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Compliance &amp; filings</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Type</span><Select className="mt-1 w-28" value={kind} onChange={e => setKind(e.target.value as ComplianceKind)} options={KIND_OPTS} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Reference no.</span><Input className="mt-1" placeholder="e.g. P02400003456" value={ref} onChange={e => setRef(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Stage</span><Input className="mt-1 w-32" placeholder="foundation" value={stage} onChange={e => setStage(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add"}>{busy === "add" ? <Spinner size={14} /> : "Add filing"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No filings tracked.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate uppercase">{r.kind}{r.refNo ? <span className="text-ink-500 font-normal normal-case"> · {r.refNo}</span> : null}</div>
                <div className="text-[11px] text-ink-400">{[r.stage, r.expiresAt && `expires ${r.expiresAt.slice(0, 10)}`].filter(Boolean).join(" · ") || "—"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => void run(`s-${r.id}`, c => setComplianceStatus(c, r.id, e.target.value as ComplianceStatus))} options={STATUS_OPTS} />
                  : <Badge tone={tone(r.status)}>{r.status}</Badge>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteCompliance(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
