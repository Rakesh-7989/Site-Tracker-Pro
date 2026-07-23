// SiteTrack Pro â€” project Tasks tab (v3 port, Batch 1, DB-wired to `tasks`).

import { useCallback, useEffect, useState } from "react";

import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { useT } from "@/i18n/I18nProvider";
import { getClient } from "@/lib/supabase";
import {
  listTasks, createTask, setTaskStatus, deleteTask, nextTaskStatus,
  type Task, type TaskStatus, type TaskPriority,
} from "@/app/taskQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const ST_TONE: Record<TaskStatus, "neutral" | "info" | "success"> = { pending: "neutral", in_progress: "info", completed: "success" };
const ST_KEY: Record<TaskStatus, string> = { pending: "pending", in_progress: "inProgress", completed: "done" };
const PR_TONE: Record<TaskPriority, "danger" | "warning" | "neutral"> = { high: "danger", medium: "warning", low: "neutral" };

export function TasksTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const t = useT();
  const stLabel = (s: TaskStatus): string => t(`tasksTab.${ST_KEY[s]}`);
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
    if (!client) { setError(t("tasksTab.backendError")); setLoading(false); return; }
    const res = await listTasks(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (key: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key); setError(null);
    const client = await getClient();
    if (!client) { setError(t("tasksTab.backendError")); setBusy(null); return; }
    const res = await fn(client);
    if (!res.ok) setError(res.error ?? t("tasksTab.actionFailed"));
    await reload(); setBusy(null);
  }, [reload, t]);

  const add = async () => {
    if (!title.trim()) return;
    await run("add", c => createTask(c, { projectId, title: title.trim(), assigneeName: assignee.trim() || undefined, priority, dueDate: due || null }));
    setTitle(""); setAssignee(""); setDue("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">{t("projTab.tasks")}</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{t("tasksTab.task")}</span>
            <Input className="mt-1" placeholder={t("tasksTab.taskPlaceholder")} value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{t("tasksTab.assignee")}</span>
            <Input className="mt-1 w-32" placeholder={t("tasksTab.assigneeName")} value={assignee} onChange={e => setAssignee(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{t("tasksTab.priority")}</span>
            <Select className="mt-1 w-auto" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
              options={[{ value: "high", label: t("tasksTab.high") }, { value: "medium", label: t("tasksTab.medium") }, { value: "low", label: t("tasksTab.low") }]} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{t("tasksTab.due")}</span>
            <Input className="mt-1" type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : t("tasksTab.add")}</Button>
        </Card>
      )}

      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">{t("tasksTab.noTasks")}</div>
        : <div className="space-y-2">
            {rows.map(tk => (
              <Card key={tk.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-800 truncate">{tk.title}</div>
                  <div className="text-[11px] text-ink-400">{tk.assigneeName ?? t("tasksTab.unassigned")}{tk.dueDate ? ` Â· ${t("tasksTab.dueLabel")} ${tk.dueDate}` : ""}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge tone={PR_TONE[tk.priority]}>{t(`tasksTab.${tk.priority}`)}</Badge>
                  {canEdit ? (
                    <button type="button" disabled={busy === `s-${tk.id}`} onClick={() => void run(`s-${tk.id}`, c => setTaskStatus(c, tk.id, nextTaskStatus(tk.status)))}>
                      <Badge tone={ST_TONE[tk.status]}>{stLabel(tk.status)}</Badge>
                    </button>
                  ) : <Badge tone={ST_TONE[tk.status]}>{stLabel(tk.status)}</Badge>}
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${tk.id}`, c => deleteTask(c, tk.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
                </div>
              </Card>
            ))}
          </div>}
    </div>
  );
}
