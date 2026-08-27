// SiteTrack Pro - project Gantt / schedule tab (v3 port, display-only). Derives
// a lightweight timeline from the milestones table (no separate schedule table).

import { useCallback, useEffect, useState } from "react";
import { Card, Alert, Icon } from "@/components/ui/atoms";
import { listMilestones, type Milestone, type MilestoneStatus } from "@/app/queries/milestoneQueries";

 
import { getClient } from "@/lib/supabase/supabase";
const BAR: Record<MilestoneStatus, { w: string; cls: string; label: string }> = {
  completed: { w: "100%", cls: "bg-success", label: "Completed" },
  in_progress: { w: "55%", cls: "bg-accent", label: "In progress" },
  pending: { w: "12%", cls: "bg-secondary", label: "Pending" } };

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
      <h2 className="font-display text-lg font-bold text-fg-primary">Schedule</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>
        : ordered.length === 0 ? <div className="text-sm text-fg-secondary">No milestones to schedule yet. Add them in the Milestones tab.</div>
        : <Card className="p-4 space-y-3">
            {ordered.map(m => { const b = BAR[m.status]; return (
              <div key={m.id} className="flex items-center gap-3">
                <div className="w-40 flex-shrink-0 min-w-0">
                  <div className="text-sm font-semibold text-fg-primary truncate">{m.title}</div>
                  <div className="text-[11px] text-fg-tertiary flex items-center gap-1">{m.dueDate ? <><Icon name="calendar" size={11} /> {m.dueDate.slice(0, 10)}</> : "no date"}</div>
                </div>
                <div className="flex-1 h-5 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full rounded-full ${b.cls}`} style={{ width: b.w }} title={b.label} />
                </div>
                <span className="text-[11px] text-fg-secondary w-24 text-right flex-shrink-0">{b.label}</span>
              </div>
            ); })}
          </Card>}
    </div>
  );
}
