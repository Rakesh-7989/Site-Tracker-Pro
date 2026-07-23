// SiteTrack Pro â€” project Field Ops tab (v3 port, DB-wired). A site diary of
// daily worklogs (activity + hours + notes), backed by the worklogs table.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { listWorklogs, createWorklog, deleteWorklog, type WorkLog } from "@/app/siteAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import { getClient } from "@/lib/supabase";
export function FieldOpsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("progress:edit", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activity, setActivity] = useState(""); const [hours, setHours] = useState(""); const [notes, setNotes] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listWorklogs(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { const h = Number(hours); if (!activity.trim() || !(h > 0 && h <= 24) || !session) return; await run("add", c => createWorklog(c, { projectId, profileId: session.user.id, activity: activity.trim(), hours: h, notes: notes.trim() || undefined })); setActivity(""); setHours(""); setNotes(""); };

  // Group logs by date for the diary layout.
  const byDate = rows.reduce<Record<string, WorkLog[]>>((acc, r) => { (acc[r.date] ??= []).push(r); return acc; }, {});
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Field ops Â· site diary</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Activity done today</span><Input className="mt-1" placeholder="e.g. Slab shuttering â€” 2nd floor" value={activity} onChange={e => setActivity(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Hours</span><Input className="mt-1 w-20" type="number" value={hours} onChange={e => setHours(e.target.value)} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Notes</span><Input className="mt-1" placeholder="optional" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !activity.trim() || !hours}>{busy === "add" ? <Spinner size={14} /> : "Log"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : dates.length === 0 ? <div className="text-sm text-ink-500">No site activity logged yet.</div>
        : <div className="space-y-4">{dates.map(d => (
            <div key={d}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-1.5 flex items-center gap-1"><Icon name="calendar" size={12} /> {d}</div>
              <div className="space-y-2">{byDate[d].map(r => (
                <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate">{r.activity}</div>
                    {r.notes && <div className="text-[11px] text-ink-400 truncate">{r.notes}</div>}</div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {r.hours != null && <span className="text-sm font-semibold text-ink-900">{r.hours}<span className="text-[11px] text-ink-400 font-normal"> hrs</span></span>}
                    {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteWorklog(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
                  </div>
                </Card>))}</div>
            </div>))}</div>}
    </div>
  );
}
