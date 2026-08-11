// SiteTrack Pro — project Inspections tab (v3 port, Batch 2, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listInspections, createInspection, setInspectionResult, deleteInspection, type Inspection, type InspectionResult } from "@/app/siteOpsQueries";
import { listCorrectiveActions, createCorrectiveAction, setCorrectiveStatus, deleteCorrectiveAction, correctiveRollup, CORRECTIVE_NEXT, CORRECTIVE_STATUS_LABEL, CORRECTIVE_PRIORITY_LABEL, type CorrectiveAction, type CorrectiveStatus } from "@/app/qualityQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const RES = [{ value: "pending", label: "Pending" }, { value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "conditional", label: "Conditional" }];
const resTone = (r: InspectionResult): "neutral" | "success" | "danger" | "warning" => (r === "pass" ? "success" : r === "fail" ? "danger" : r === "conditional" ? "warning" : "neutral");
const PRIOS = [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" }];
const prioTone = (p: CorrectiveAction["priority"]): "neutral" | "warning" | "danger" => (p === "critical" ? "danger" : p === "high" ? "warning" : "neutral");
const actionTone = (s: CorrectiveStatus): "neutral" | "warning" | "success" => (s === "verified" ? "success" : s === "open" ? "warning" : "neutral");

export function InspectionsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("inspection:create", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Inspection[]>([]);
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("quality"); const [scope, setScope] = useState(""); const [sd, setSd] = useState("");
  const [caDesc, setCaDesc] = useState(""); const [caPrio, setCaPrio] = useState("high"); const [caAssigned, setCaAssigned] = useState(""); const [caDue, setCaDue] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listInspections(client, projectId); if (res.ok) setRows(res.data); else setError(res.error);
    const ca = await listCorrectiveActions(client, projectId); if (ca.ok) setActions(ca.data); else setError(ca.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createInspection(c, { projectId, type, scope: scope.trim() || undefined, scheduledDate: sd || null, inspectorId: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, type, scope: scope.trim() || undefined, scheduledDate: sd || null, result: "pending" as InspectionResult, inspectorName: null }, ...prev] as Inspection[]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setScope(""); setSd("");
  };

  const addAction = async () => {
    if (!caDesc.trim()) return;
    const tmpId = "tmp-" + Date.now();
    await run("ca", c => createCorrectiveAction(c, { projectId, description: caDesc.trim(), priority: caPrio as CorrectiveAction["priority"], assignedTo: caAssigned.trim() || undefined, dueDate: caDue || null }), {
      apply: () => setActions(prev => [{ id: tmpId, projectId, inspectionId: null, description: caDesc.trim(), priority: caPrio as CorrectiveAction["priority"], status: "open" as CorrectiveStatus, assignedTo: caAssigned.trim() || null, dueDate: caDue || null, openedByName: null, openedAt: "" }, ...prev]),
      rollback: () => setActions(prev => prev.filter(x => x.id !== tmpId)),
    });
    setCaDesc(""); setCaPrio("high"); setCaAssigned(""); setCaDue("");
  };

  const advanceAction = async (a: CorrectiveAction) => {
    const next = CORRECTIVE_NEXT[a.status]; if (!next) return;
    await run(`as-${a.id}`, c => setCorrectiveStatus(c, a.id, next, { verifiedBy: next === "verified" ? session?.user.id ?? null : undefined }), {
      apply: () => setActions(prev => prev.map(x => x.id === a.id ? { ...x, status: next } : x)),
      rollback: () => setActions(prev => prev.map(x => x.id === a.id ? { ...x, status: a.status } : x)),
    });
  };

  const rollup = correctiveRollup(actions);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Inspections</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Type</span>
            <Select fit className="mt-1 w-auto" value={type} onChange={e => setType(e.target.value)} options={[{ value: "quality", label: "Quality" }, { value: "structural", label: "Structural" }, { value: "safety", label: "Safety" }, { value: "handover", label: "Handover" }]} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Scope</span><Input className="mt-1" placeholder="e.g. 3rd floor slab" value={scope} onChange={e => setScope(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Scheduled</span><Input className="mt-1" type="date" value={sd} onChange={e => setSd(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add"}>{busy === "add" ? <Spinner size={14} /> : "Schedule"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No inspections scheduled.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate capitalize">{r.type}{r.scope ? ` — ${r.scope}` : ""}</div>
                <div className="text-[11px] text-fg-tertiary">{r.scheduledDate ? `Scheduled ${r.scheduledDate}` : "Unscheduled"}{r.inspectorName ? ` · ${r.inspectorName}` : ""}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select fit className="w-auto text-xs" value={r.result} onChange={e => { const v = e.target.value as InspectionResult; void run(`s-${r.id}`, c => setInspectionResult(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, result: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, result: r.result } : x)) }); }} options={RES} />
                  : <Badge tone={resTone(r.result)}>{r.result}</Badge>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteInspection(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}

      <Card padding="md" className="border border-default bg-elevated" title={<div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Corrective actions</div>
        <div className="text-sm font-semibold text-fg-primary">{rollup.open + rollup.inProgress} open · {rollup.verified} verified</div>
      </div>} action={<div className="flex gap-4 text-[11px] text-fg-secondary">
        <span>Critical {rollup.critical}</span><span>High {rollup.high}</span><span>Resolved {rollup.resolved}</span>
      </div>}>
        <div className="space-y-3">
        {canEdit && (
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Description</span><Input className="mt-1" placeholder="e.g. re-level 3rd floor slab rebar" value={caDesc} onChange={e => setCaDesc(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Priority</span><Select fit className="mt-1 w-auto" value={caPrio} onChange={e => setCaPrio(e.target.value)} options={PRIOS} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Assignee</span><Input fit className="mt-1 w-32" placeholder="Name / trade" value={caAssigned} onChange={e => setCaAssigned(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Due</span><Input fit className="mt-1 w-36" type="date" value={caDue} onChange={e => setCaDue(e.target.value)} /></div>
            <Button onClick={() => void addAction()} disabled={busy === "ca" || !caDesc.trim()}>{busy === "ca" ? <Spinner size={14} /> : "Add"}</Button>
          </div>
        )}
        {actions.length === 0 ? (
          <div className="text-sm text-fg-tertiary">No corrective actions. Failed / conditional inspections auto-open here.</div>
        ) : (
          <div className="space-y-1.5">
            {actions.map(a => (
              <div key={a.id} className="rounded-lg bg-card border border-default px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-fg-primary truncate">{a.description}</div>
                  <div className="text-[11px] text-fg-tertiary truncate">{[a.assignedTo && `→ ${a.assignedTo}`, a.dueDate && `due ${a.dueDate}`, a.openedByName && `opened by ${a.openedByName}`, CORRECTIVE_PRIORITY_LABEL[a.priority]].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge tone={prioTone(a.priority)}>{CORRECTIVE_PRIORITY_LABEL[a.priority]}</Badge>
                  {canEdit && a.status !== "verified" ? (
                    <Button size="sm" disabled={busy === `as-${a.id}`} onClick={() => void advanceAction(a)}>
                      {busy === `as-${a.id}` ? <Spinner size={12} /> : `Mark ${CORRECTIVE_NEXT[a.status]!.replace("_", " ")}`}
                    </Button>
                  ) : (
                    <Badge tone={actionTone(a.status)}>{CORRECTIVE_STATUS_LABEL[a.status]}</Badge>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => void run(`ad-${a.id}`, c => deleteCorrectiveAction(c, a.id), { apply: () => setActions(prev => prev.filter(x => x.id !== a.id)), rollback: () => setActions(prev => [...prev, a]) })}>
                      <Icon name="trash" size={14} className="text-error" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </Card>
    </div>
  );
}
