// SiteTrack Pro — project Tasks tab (v3 port, Batch 1, DB-wired to `tasks`).

import { useCallback, useEffect, useState } from "react";

import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import {
  listTasks, createTask, setTaskStatus, deleteTask, nextTaskStatus,
  type Task, type TaskStatus, type TaskPriority,
} from "@/app/taskQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  const mod = await import("../../../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

const ST_TONE: Record<TaskStatus, "neutral" | "info" | "success"> = { pending: "neutral", in_progress: "info", completed: "success" };
const ST_LABEL: Record<TaskStatus, string> = { pending: "Pending", in_progress: "In progress", completed: "Done" };
const PR_TONE: Record<TaskPriority, "danger" | "warning" | "neutral"> = { high: "danger", medium: "warning", low: "neutral" };

export function TasksTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("update:add", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [due, setDue] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listTasks(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (key: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client);
    if (!res.ok) setError(res.error ?? "Action failed.");
    await reload(); setBusy(null);
  }, [reload]);

  const add = async () => {
    if (!title.trim()) return;
    await run("add", c => createTask(c, { projectId, title: title.trim(), assigneeName: assignee.trim() || undefined, priority, dueDate: due || null }));
    setTitle(""); setAssignee(""); setDue("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Tasks</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Task</span>
            <Input className="mt-1" placeholder="e.g. Order TMT steel" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Assignee</span>
            <Input className="mt-1 w-32" placeholder="Name" value={assignee} onChange={e => setAssignee(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Priority</span>
            <Select className="mt-1 w-auto" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
              options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Due</span>
            <Input className="mt-1" type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}

      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No tasks yet.</div>
        : <div className="space-y-2">
            {rows.map(t => (
              <Card key={t.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-800 truncate">{t.title}</div>
                  <div className="text-[11px] text-ink-400">{t.assigneeName ?? "Unassigned"}{t.dueDate ? ` · Due ${t.dueDate}` : ""}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge tone={PR_TONE[t.priority]}>{t.priority}</Badge>
                  {canEdit ? (
                    <button type="button" disabled={busy === `s-${t.id}`} onClick={() => void run(`s-${t.id}`, c => setTaskStatus(c, t.id, nextTaskStatus(t.status)))}>
                      <Badge tone={ST_TONE[t.status]}>{ST_LABEL[t.status]}</Badge>
                    </button>
                  ) : <Badge tone={ST_TONE[t.status]}>{ST_LABEL[t.status]}</Badge>}
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${t.id}`, c => deleteTask(c, t.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
                </div>
              </Card>
            ))}
          </div>}
    </div>
  );
}
