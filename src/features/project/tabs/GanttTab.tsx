// SiteTrack Pro â€” project Gantt / schedule tab (v3 port, display-only). Derives
// a lightweight timeline from the milestones table (no separate schedule table).

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { listMilestones, type Milestone, type MilestoneStatus } from "@/app/milestoneQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const BAR: Record<MilestoneStatus, { w: string; cls: string; label: string }> = {
  completed: { w: "100%", cls: "bg-emerald-400", label: "Completed" },
  in_progress: { w: "55%", cls: "bg-amber-400", label: "In progress" },
  pending: { w: "12%", cls: "bg-cream-300", label: "Pending" },
};

export function GanttTab({ projectId }: { projectId: string }): JSX.Element {
  const [rows, setRows] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listMilestones(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  // Order by due date (nulls last), then sort order.
  const ordered = [...rows].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1; if (b.dueDate) return 1; return a.sortOrder - b.sortOrder;
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Schedule</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : ordered.length === 0 ? <div className="text-sm text-ink-500">No milestones to schedule yet. Add them in the Milestones tab.</div>
        : <Card className="p-4 space-y-3">
            {ordered.map(m => { const b = BAR[m.status]; return (
              <div key={m.id} className="flex items-center gap-3">
                <div className="w-40 flex-shrink-0 min-w-0">
                  <div className="text-sm font-semibold text-ink-800 truncate">{m.title}</div>
                  <div className="text-[11px] text-ink-400 flex items-center gap-1">{m.dueDate ? <><Icon name="calendar" size={11} /> {m.dueDate.slice(0, 10)}</> : "no date"}</div>
                </div>
                <div className="flex-1 h-5 rounded-full bg-cream-100 overflow-hidden">
                  <div className={`h-full rounded-full ${b.cls}`} style={{ width: b.w }} title={b.label} />
                </div>
                <span className="text-[11px] text-ink-500 w-24 text-right flex-shrink-0">{b.label}</span>
              </div>
            ); })}
          </Card>}
    </div>
  );
}
