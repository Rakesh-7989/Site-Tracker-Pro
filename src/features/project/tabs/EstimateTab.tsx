// SiteTrack Pro — project Estimate tab (v3 port, Batch 4, DB-wired).
// ST BOQ/Estimate depth: create a client-facing quote derived from BOQ totals
// + markup/overhead/contingency/GST build-up, persisted in estimate.payload.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listBoq } from "@/app/siteAdminQueries";
import { listEstimates, createEstimate, setEstimateStatus, deleteEstimate, estimateBuildUp, estimatePayload, nextEstimateVersion, type Estimate, type EstimateStatus, type EstimateBuildUp } from "@/app/designQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const NEXT: Record<EstimateStatus, EstimateStatus> = { draft: "submitted", submitted: "approved", approved: "superseded", superseded: "draft", rejected: "draft" };
const tone = (s: EstimateStatus): "neutral" | "info" | "success" | "danger" => (s === "approved" ? "success" : s === "submitted" ? "info" : s === "rejected" ? "danger" : "neutral");

const pct = (v: string): number => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/** Compact breakdown line for a build-up estimate row. */
export function buildUpLine(up: EstimateBuildUp): string {
  return `base ${fmtRupees(up.baseAmount)} · +${up.markupPct}% · +${up.overheadPct}% OH · +${up.contingencyPct}% · GST ${up.gstPct}%`;
}

function BuildUpPreview({ up }: { up: EstimateBuildUp }): JSX.Element {
  const rows: Array<[string, string, boolean]> = [
    ["BOQ base", fmtRupees(up.baseAmount), false],
    [`Markup (${up.markupPct}%)`, fmtRupees(up.markup), true],
    [`Overhead (${up.overheadPct}%)`, fmtRupees(up.overhead), true],
    [`Contingency (${up.contingencyPct}%)`, fmtRupees(up.contingency), true],
    [`Subtotal`, fmtRupees(up.subtotal), false],
    [`GST (${up.gstPct}%)`, fmtRupees(up.gst), true],
    [`Grand total`, fmtRupees(up.total), false],
  ];
  return (
    <div className="mt-2 w-full max-w-sm rounded-lg bg-bg-secondary/60 px-3 py-2 text-[11px]">
      {rows.map(([label, val, dim]) => (
        <div key={label} className={`flex items-center justify-between gap-3 ${dim ? "text-fg-tertiary" : label === "Grand total" ? "font-bold text-fg-primary" : "text-fg-secondary"}`}>
          <span>{label}</span><span>{val}</span>
        </div>
      ))}
    </div>
  );
}

export function EstimateTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("estimate:edit", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Estimate[]>([]);
  const [boqTotal, setBoqTotal] = useState(0);
  const [boqLoading, setBoqLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [markupPct, setMarkupPct] = useState("10");
  const [overheadPct, setOverheadPct] = useState("5");
  const [contingencyPct, setContingencyPct] = useState("5");
  const [gstPct, setGstPct] = useState("18");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [est, boq] = await Promise.all([listEstimates(client, projectId), listBoq(client, projectId)]);
    if (est.ok) setRows(est.data); else setError(est.error);
    if (boq.ok) { setBoqTotal(boq.data.reduce((s, it) => s + (it.amount ?? 0), 0)); setBoqLoading(false); } else setError(boq.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);

  const up = useMemo<EstimateBuildUp>(() => estimateBuildUp({ baseAmount: boqTotal, markupPct: pct(markupPct), overheadPct: pct(overheadPct), contingencyPct: pct(contingencyPct), gstPct: pct(gstPct) }), [boqTotal, markupPct, overheadPct, contingencyPct, gstPct]);

  const add = async () => {
    if (!name.trim() || boqTotal <= 0 || !session) return;
    const version = nextEstimateVersion(rows, name.trim());
    const payload = estimatePayload(up);
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createEstimate(c, { projectId, name: name.trim(), totalAmount: Math.round(up.total), version, payload, createdBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, name: name.trim(), totalAmount: Math.round(up.total), version, status: "draft" as EstimateStatus, baseAmount: payload.baseAmount as number, markupPct: payload.markupPct as number, overheadPct: payload.overheadPct as number, contingencyPct: payload.contingencyPct as number, gstPct: payload.gstPct as number }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setName("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Estimates</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex flex-wrap items-end gap-x-3 gap-y-2">
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Name</span><Input className="mt-1" placeholder="e.g. Client quote v1" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Markup %</span><Input fit className="mt-1 w-20" type="number" min={0} value={markupPct} onChange={e => setMarkupPct(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Overhead %</span><Input fit className="mt-1 w-20" type="number" min={0} value={overheadPct} onChange={e => setOverheadPct(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Contingency %</span><Input fit className="mt-1 w-20" type="number" min={0} value={contingencyPct} onChange={e => setContingencyPct(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">GST %</span><Input fit className="mt-1 w-20" type="number" min={0} value={gstPct} onChange={e => setGstPct(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !name.trim() || boqTotal <= 0}>{busy === "add" ? <Spinner size={14} /> : "Create estimate"}</Button>
          <div className="w-full">
            {boqLoading ? <span className="text-[11px] text-fg-tertiary">Loading BOQ base…</span>
              : boqTotal <= 0 ? <span className="text-[11px] text-warning">Add BOQ line items first — the estimate base is the BOQ total.</span>
              : <span className="text-[11px] text-fg-secondary">Base (BOQ total): <b className="text-fg-primary">{fmtRupees(boqTotal)}</b></span>}
            <BuildUpPreview up={up} />
          </div>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No estimates.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.name} <span className="text-[11px] text-fg-tertiary font-normal">v{r.version}</span></div>
                <div className="text-[11px] text-fg-secondary">{fmtRupees(r.totalAmount)}</div>
                {r.baseAmount != null && <div className="mt-0.5 text-[11px] text-fg-tertiary truncate">{buildUpLine({ baseAmount: r.baseAmount, markupPct: r.markupPct, overheadPct: r.overheadPct, contingencyPct: r.contingencyPct, gstPct: r.gstPct, markup: 0, overhead: 0, contingency: 0, subtotal: 0, gst: 0, total: r.totalAmount })}</div>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <button type="button" disabled={busy === `s-${r.id}`} onClick={() => { const ns = NEXT[r.status]; void run(`s-${r.id}`, c => setEstimateStatus(c, r.id, ns), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: ns } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }}><Badge tone={tone(r.status)}>{r.status}</Badge></button>
                  : <Badge tone={tone(r.status)}>{r.status}</Badge>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteEstimate(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
