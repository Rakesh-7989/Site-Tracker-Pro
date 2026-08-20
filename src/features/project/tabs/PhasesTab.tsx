// SiteTrack Pro — consultancy fee-phase tab (v4 C1).
// Lists a consultancy/design project's fixed-fee phases; add + status
// cycle + delete gated on phase:manage. Fee amounts in whole ₹.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import {
  listFeePhases, createFeePhase, setFeePhaseStatus, deleteFeePhase, committedFee,
  type FeePhase, type PhaseStatus,
} from "@/app/phaseQueries";

const STATUS_TONE: Record<PhaseStatus, "neutral" | "info" | "success" | "warning"> = {
  draft: "neutral", approved: "info", in_progress: "info", completed: "success", cancelled: "warning",
};
const STATUS_LABEL: Record<PhaseStatus, string> = {
  draft: "Draft", approved: "Approved", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};
const NEXT: Record<PhaseStatus, PhaseStatus> = {
  draft: "approved", approved: "in_progress", in_progress: "completed", completed: "cancelled", cancelled: "draft",
};

export function PhasesTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("phase:manage", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<FeePhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [fee, setFee] = useState("");
  const [due, setDue] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listFeePhases(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!title.trim()) return;
    const tmpId = "tmp-" + Date.now();
    const amount = Number(fee) || 0;
    await run("add", c => createFeePhase(c, { projectId, title: title.trim(), scope: scope.trim() || null, feeAmount: amount, dueDate: due || null, sortOrder: rows.length }), {
      apply: () => setRows(prev => [{ id: tmpId, title: title.trim(), scope: scope.trim() || null, feeAmount: amount, status: "draft" as PhaseStatus, dueDate: due || null, completedDate: null, sortOrder: rows.length, createdAt: "" }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setTitle(""); setScope(""); setFee(""); setDue("");
  };

  const total = committedFee(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Fee Phases</h2>
        {rows.length > 0 && <span className="text-sm text-fg-secondary">Committed {fmtRupees(total)}</span>}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {canManage && (
        <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span>
            <Input className="mt-1" placeholder="e.g. Schematic Design" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Fee (₹)</span>
            <Input className="mt-1" type="number" min={0} placeholder="250000" value={fee} onChange={e => setFee(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Due</span>
            <Input className="mt-1" type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-1 flex gap-2 items-end">
            <Button className="flex-1" onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Scope</span>
            <Input className="mt-1" placeholder="Deliverables in this phase (optional)" value={scope} onChange={e => setScope(e.target.value)} />
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-fg-secondary">No phases yet.{canManage ? " Add the first one above." : ""}</div>
      ) : (
        <div className="space-y-2">
          {rows.map(p => (
            <Card key={p.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-fg-primary truncate">{p.title}</span>
                  <span className="text-xs font-semibold text-fg-secondary">{fmtRupees(p.feeAmount)}</span>
                </div>
                {p.scope && <div className="text-[11px] text-fg-tertiary truncate">{p.scope}</div>}
                <div className="text-[11px] text-fg-tertiary">
                  {p.dueDate ? `Due ${p.dueDate}` : "No due date"}
                  {p.completedDate && ` · Done ${p.completedDate}`}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy === `s-${p.id}`}
                    onClick={() => { const ns = NEXT[p.status]; void run(`s-${p.id}`, c => setFeePhaseStatus(c, p.id, ns), { apply: () => setRows(prev => prev.map(x => x.id === p.id ? { ...x, status: ns, completedDate: ns === "completed" ? new Date().toISOString().slice(0, 10) : null } : x)), rollback: () => setRows(prev => prev.map(x => x.id === p.id ? { ...x, status: p.status, completedDate: p.completedDate } : x)) }); }}
                    title="Cycle status"
                  >
                    <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </button>
                ) : (
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => void run(`d-${p.id}`, c => deleteFeePhase(c, p.id), { apply: () => setRows(prev => prev.filter(x => x.id !== p.id)), rollback: () => setRows(prev => [...prev, p]) })}>
                    <span className="text-error">✕</span>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
