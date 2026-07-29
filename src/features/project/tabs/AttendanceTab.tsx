// SiteTrack Pro — project Attendance tab (v3 port, Batch 2, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listAttendance, createAttendance, setAttendanceStatus, deleteAttendance, type AttendanceRow, type AttendanceStatus, type AttendeeKind } from "@/app/attendanceQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "present", label: "Present" }, { value: "absent", label: "Absent" }, { value: "half_day", label: "Half day" }, { value: "leave", label: "Leave" }, { value: "on_site_late", label: "Late" }, { value: "off_site", label: "Off-site" }];
const KIND = [{ value: "labour", label: "Labour" }, { value: "staff", label: "Staff" }, { value: "visitor", label: "Visitor" }];

export function AttendanceTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("attendance:mark", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(""); const [kind, setKind] = useState<AttendeeKind>("labour"); const [status, setStatus] = useState<AttendanceStatus>("present"); const [hours, setHours] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listAttendance(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => { if (!name.trim() || !session) return; const h = hours.trim() ? Number(hours) : null; await run("add", c => createAttendance(c, { projectId, attendeeName: name.trim(), kind, status, hours: Number.isFinite(h) ? h : null, recordedBy: session.user.id })); setName(""); setHours(""); };
  const present = rows.filter(r => r.status === "present" || r.status === "on_site_late").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold text-fg-primary">Attendance</h2>{rows.length > 0 && <span className="text-sm text-fg-secondary">{present} present</span>}</div>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Name</span><Input className="mt-1" placeholder="Worker / staff name" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Kind</span><Select className="mt-1 w-auto" value={kind} onChange={e => setKind(e.target.value as AttendeeKind)} options={KIND} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Status</span><Select className="mt-1 w-auto" value={status} onChange={e => setStatus(e.target.value as AttendanceStatus)} options={STT} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Hours</span><Input className="mt-1 w-20" type="number" value={hours} onChange={e => setHours(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !name.trim()}>{busy === "add" ? <Spinner size={14} /> : "Mark"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No attendance marked.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.attendeeName} <span className="text-[11px] text-fg-tertiary font-normal">· {r.kind}</span></div>
                <div className="text-[11px] text-fg-tertiary">{r.date}{r.hours != null ? ` · ${r.hours}h` : ""}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => void run(`s-${r.id}`, c => setAttendanceStatus(c, r.id, e.target.value as AttendanceStatus))} options={STT} />
                  : <span className="text-xs text-fg-secondary">{r.status.replace("_", " ")}</span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteAttendance(c, r.id))}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
