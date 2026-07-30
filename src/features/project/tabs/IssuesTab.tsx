// SiteTrack Pro — project Issues tab (v3 port, Batch 1, DB-wired to `issues`).

import { useCallback, useEffect, useState } from "react";

import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { getClient } from "@/lib/supabase";
import {
  listIssues, createIssue, setIssueResolved, deleteIssue,
  type Issue, type IssueSeverity,
} from "@/app/issueQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useAction } from "@/hooks/useAction";

const SEV_TONE: Record<IssueSeverity, "danger" | "warning" | "neutral"> = { high: "danger", medium: "warning", low: "neutral" };

export function IssuesTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canAdd = useCan("issue:add", ctx);
  const canResolve = useCan("issue:resolve", ctx);

  const [rows, setRows] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [severity, setSeverity] = useState<IssueSeverity>("medium");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listIssues(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!title.trim() || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createIssue(c, { projectId, title: title.trim(), description: desc.trim() || undefined, severity, reportedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, title: title.trim(), description: desc.trim() || undefined, severity, status: "open", reportedDate: new Date().toISOString().slice(0, 10), resolvedDate: null } as Issue, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setTitle(""); setDesc("");
  };

  const open = rows.filter(r => r.status === "open").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink-900">Issues</h2>
        {rows.length > 0 && <span className="text-sm text-ink-500">{open} open</span>}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      {canAdd && (
        <Card className="p-3 space-y-2">
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Issue</span>
              <Input className="mt-1" placeholder="e.g. Water seepage in basement" value={title} onChange={e => setTitle(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Severity</span>
              <Select className="mt-1 w-auto" value={severity} onChange={e => setSeverity(e.target.value as IssueSeverity)}
                options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} /></div>
            <Button onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Raise"}</Button>
          </div>
          <Input placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
        </Card>
      )}

      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No issues logged.</div>
        : <div className="space-y-2">
            {rows.map(i => (
              <Card key={i.id} className={`p-3 ${i.status === "resolved" ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-800 truncate flex items-center gap-2">
                      <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>{i.title}
                    </div>
                    {i.description && <div className="text-[12px] text-ink-500 mt-0.5">{i.description}</div>}
                    <div className="text-[11px] text-ink-400 mt-0.5">
                      {i.reportedDate ? `Raised ${i.reportedDate}` : ""}{i.resolvedDate ? ` · Resolved ${i.resolvedDate}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canResolve && (
                      <Button size="sm" variant={i.status === "open" ? "secondary" : "ghost"} disabled={busy === `r-${i.id}`}
                        onClick={() => session && void run(`r-${i.id}`, c => setIssueResolved(c, i.id, i.status === "open", session.user.id), {
                          apply: () => setRows(prev => prev.map(x => x.id === i.id ? { ...x, status: (i.status === "open" ? "resolved" : "open"), resolvedDate: i.status === "open" ? new Date().toISOString().slice(0, 10) : null } : x)),
                          rollback: () => setRows(prev => prev.map(x => x.id === i.id ? { ...x, status: i.status, resolvedDate: i.resolvedDate } : x)),
                        })}>
                        {i.status === "open" ? "Resolve" : "Reopen"}
                      </Button>
                    )}
                    {canAdd && <Button size="sm" variant="ghost" onClick={() => void run(`d-${i.id}`, c => deleteIssue(c, i.id), { apply: () => setRows(prev => prev.filter(x => x.id !== i.id)), rollback: () => setRows(prev => [...prev, i]) })}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
                  </div>
                </div>
              </Card>
            ))}
          </div>}
    </div>
  );
}
