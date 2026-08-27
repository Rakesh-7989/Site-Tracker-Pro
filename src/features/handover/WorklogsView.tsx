// SiteTrack Pro — Worklogs page (/worklogs).
// Daily worklog entries per project. Gated by labour:manage capability.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries/queries";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listWorklogs, createWorklog, deleteWorklog, type Worklog } from "@/app/queries/siteOpsQueries";
import { getClient } from "@/lib/supabase/supabase";
import { useAction } from "@/hooks/useAction";

export function WorklogsView(): JSX.Element {
  const canView = useCan("labour:manage");
  const canEdit = useCan("attendance:mark");
  const { activeOrg } = useOrgSwitcher();
  const liveSession = useSession();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [rows, setRows] = useState<Worklog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [activity, setActivity] = useState("");
  const [hours, setHours] = useState("8");
  const [notes, setNotes] = useState("");

  const loadProjects = useCallback(async () => {
    if (!activeOrg?.orgId) return;
    const client = await getClient();
    if (!client) return;
    const scope = memberProjectScope(liveSession);
    let q = client.from("projects").select("id, name").eq("org_id", activeOrg.orgId);
    if (scope.mode === "member") {
      if (scope.projectIds.length === 0) { setProjects([]); return; }
      q = q.in("id", scope.projectIds);
    }
    const { data } = await q;
    const pList = data ?? [];
    setProjects(pList);
    if (pList.length) setSelProject(pList[0].id);
  }, [activeOrg?.orgId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const reload = useCallback(async () => {
    if (!selProject) { setRows([]); setLoading(false); return; }
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listWorklogs(client, selProject);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [selProject]);

  useEffect(() => { void reload(); }, [reload]);

  const { session } = useAuth();
  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!activity.trim() || !session || !selProject) return;
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0 || h > 24) { setError("Hours must be 0.5–24."); return; }
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createWorklog(c, { projectId: selProject, profileId: session.user.id, date, activity: activity.trim(), hours: h, notes: notes.trim() || undefined }), {
      apply: () => setRows(prev => [{ id: tmpId, date, activity: activity.trim(), hours: h, notes: notes.trim() || null, profileId: session.user.id, taskId: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setActivity(""); setHours("8"); setNotes("");
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Worklogs</h1>
      {!canView && <Alert variant="danger">You do not have permission to view worklogs.</Alert>}
      {canView && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-fg-secondary">Project</label>
            <Select fit compact className="w-56" value={selProject} onChange={e => setSelProject(e.target.value)} options={projects.map(p => ({ value: p.id, label: p.name }))} />
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
          {canEdit && selProject && (
            <Card className="p-3 flex gap-2 flex-wrap items-end">
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Date</span><Input fit className="mt-1 w-36" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Activity</span><Input className="mt-1" placeholder="e.g. Slab pouring" value={activity} onChange={e => setActivity(e.target.value)} /></div>
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Hours</span><Input fit className="mt-1 w-20" type="number" min="0.5" max="24" step="0.5" suffix="h" value={hours} onChange={e => setHours(e.target.value)} /></div>
              <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notes</span><Input className="mt-1" placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} /></div>
              <Button onClick={() => void add()} disabled={busy === "add" || !activity.trim()}>{busy === "add" ? <Spinner size={14} /> : "Log"}</Button>
            </Card>
          )}
          {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
            : rows.length === 0 ? <div className="text-sm text-fg-secondary">No worklogs.</div>
            : <div className="space-y-2">{rows.map(r => (
                <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-fg-primary truncate">{r.date} &mdash; {r.activity} ({r.hours}h)</div>
                    <div className="text-[11px] text-fg-tertiary">{r.notes ?? "-"}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteWorklog(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
                  </div>
                </Card>))}
            </div>
          }
        </>
      )}
    </div>
  );
}