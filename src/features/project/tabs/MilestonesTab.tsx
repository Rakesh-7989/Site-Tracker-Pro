// SiteTrack Pro — project Milestones tab (v3 port, Batch 1, DB-wired).
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
//
// Lists the project's milestones from the `milestones` table; add + status
// cycle gated on milestone:add. First DB-wired ported tab — the pattern for
// the rest of Batch 1.

import { useCallback, useEffect, useState } from "react";

import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import {
  listMilestones, createMilestone, setMilestoneStatus, deleteMilestone, nextStatus,
  type Milestone, type MilestoneStatus,
} from "@/app/milestoneQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const STATUS_TONE: Record<MilestoneStatus, "neutral" | "info" | "success"> = {
  pending: "neutral", in_progress: "info", completed: "success",
};
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: "Pending", in_progress: "In progress", completed: "Completed",
};

export function MilestonesTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("milestone:add", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listMilestones(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!title.trim()) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createMilestone(c, { projectId, title: title.trim(), dueDate: due || null, sortOrder: rows.length }), {
      apply: () => setRows(prev => [{ id: tmpId, title: title.trim(), dueDate: due || null, sortOrder: rows.length, status: "pending" as MilestoneStatus, completedDate: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setTitle(""); setDue("");
  };

  const done = rows.filter(r => r.status === "completed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink-900">Milestones</h2>
        {rows.length > 0 && <span className="text-sm text-ink-500">{done}/{rows.length} completed</span>}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[180px]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">New milestone</span>
            <Input className="mt-1" placeholder="e.g. Foundation complete" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Due</span>
            <Input className="mt-1" type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
          <Button onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-ink-500">No milestones yet.{canEdit ? " Add the first one above." : ""}</div>
      ) : (
        <div className="space-y-2">
          {rows.map(m => (
            <Card key={m.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-800 truncate">{m.title}</div>
                <div className="text-[11px] text-ink-400">
                  {m.dueDate ? `Due ${m.dueDate}` : "No due date"}
                  {m.completedDate && ` · Done ${m.completedDate}`}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy === `s-${m.id}`}
                    onClick={() => { const ns = nextStatus(m.status); void run(`s-${m.id}`, c => setMilestoneStatus(c, m.id, ns), { apply: () => setRows(prev => prev.map(x => x.id === m.id ? { ...x, status: ns, completedDate: ns === "completed" ? new Date().toISOString().slice(0, 10) : null } : x)), rollback: () => setRows(prev => prev.map(x => x.id === m.id ? { ...x, status: m.status, completedDate: m.completedDate } : x)) }); }}
                    title="Cycle status"
                  >
                    <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                  </button>
                ) : (
                  <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => void run(`d-${m.id}`, c => deleteMilestone(c, m.id), { apply: () => setRows(prev => prev.filter(x => x.id !== m.id)), rollback: () => setRows(prev => [...prev, m]) })}>
                    <Icon name="trash" size={14} className="text-rose-500" />
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
