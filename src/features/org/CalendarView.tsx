// SiteTrack Pro — org Calendar (/calendar). An agenda of every dated milestone
// + task across the org's projects, bucketed Overdue / Today / Upcoming.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOrgSwitcher } from "@/auth";
import { Card, Badge, Alert, Icon } from "@/components/ui/atoms";
import { getOrgCalendar, bucketByDate, type CalItem } from "@/app/queries/calendarQueries";

 
import { getClient } from "@/lib/supabase/supabase";
const todayISO = (): string => new Date().toISOString().slice(0, 10);
const fmtDay = (iso: string): string => { const d = new Date(iso + "T00:00:00"); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); };
const tabUrl = (it: CalItem): string => `/projects/${it.projectId}/${it.kind === "milestone" ? "milestones" : it.kind === "noc" ? "statutory" : "tasks"}`;
const statusTone = (s: string): "neutral" | "info" | "success" => (s === "completed" ? "success" : s === "in_progress" ? "info" : "neutral");

function Row({ it }: { it: CalItem }): JSX.Element {
  return (
    <Link to={tabUrl(it)}>
      <Card className="p-3 flex items-center justify-between gap-3 hover:border-accent transition">
        <div className="min-w-0 flex items-center gap-2">
          <Badge tone={it.kind === "milestone" ? "warning" : it.kind === "noc" ? "danger" : "neutral"}>{it.kind === "milestone" ? "Milestone" : it.kind === "noc" ? "NOC" : "Task"}</Badge>
          <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{it.title}</div>
            <div className="text-[11px] text-fg-tertiary truncate">{it.projectName}</div></div>
        </div>
        <Badge tone={it.kind === "noc" ? "danger" : statusTone(it.status)}>{it.kind === "noc" ? "Expiring" : it.status}</Badge>
      </Card>
    </Link>
  );
}

export function CalendarView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const [rows, setRows] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getOrgCalendar(client, orgId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const { overdue, today, upcoming } = bucketByDate(rows, todayISO());
  const upcomingDays = Array.from(upcoming.keys()).sort();

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Calendar</h1>
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
        : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-fg-secondary"><Icon name="calendar" size={24} className="mx-auto text-fg-tertiary mb-2" />No dated milestones or tasks yet.</Card>
        ) : (
          <>
            {overdue.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-error mb-2">Overdue ({overdue.length})</h2>
                <div className="space-y-2">{overdue.map(it => <Row key={`${it.kind}-${it.id}`} it={it} />)}</div>
              </section>
            )}
            {today.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-accent mb-2">Today</h2>
                <div className="space-y-2">{today.map(it => <Row key={`${it.kind}-${it.id}`} it={it} />)}</div>
              </section>
            )}
            {upcomingDays.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">Upcoming</h2>
                <div className="space-y-4">{upcomingDays.map(day => (
                  <div key={day}>
                    <div className="text-[11px] font-semibold text-fg-secondary mb-1.5 flex items-center gap-1"><Icon name="calendar" size={12} /> {fmtDay(day)}</div>
                    <div className="space-y-2">{(upcoming.get(day) ?? []).map(it => <Row key={`${it.kind}-${it.id}`} it={it} />)}</div>
                  </div>
                ))}</div>
              </section>
            )}
            {overdue.length === 0 && today.length === 0 && upcomingDays.length === 0 && (
              <Card className="p-8 text-center text-sm text-fg-secondary">Nothing scheduled. 🎉</Card>
            )}
          </>
        )}
    </div>
  );
}
