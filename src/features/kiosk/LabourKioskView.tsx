// SiteTrack Pro — Labour Attendance Kiosk (/kiosk/labour).
// Tablet-optimised clock-in/out for site entry. Backed by the real schema:
// workers come from `labour_register`, clock-in/out rows land on `attendance`
// (attendee_kind='labour', one row per worker per day via the partial unique
// index uniq_attendance_labour_day).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { PlanGate } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";


import { getClient } from "@/lib/supabase";
import { clockOutAttendance } from "@/app/attendanceQueries";
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtClock(value: string | null): string {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function nowClock(): string {
  return new Date().toTimeString().split(" ")[0];
}
function hoursBetween(inTime: string | null, outTime: string | null): number {
  if (!inTime || !outTime) return 0;
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  if (![ih, im, oh, om].every(Number.isFinite)) return 0;
  return Math.max(0, Math.round(((oh * 60 + om) - (ih * 60 + im)) / 60 * 100) / 100);
}

interface WorkerRow { id: string; name: string; trade: string | null; }
interface KioskLog {
  id: string;
  labourId: string | null;
  name: string;
  trade: string | null;
  inTime: string | null;
  outTime: string | null;
  hours: number | null;
}

export function LabourKioskView(): JSX.Element {
  return <PlanGate feature="kiosks"><LabourKioskInner /></PlanGate>;
}

function LabourKioskInner(): JSX.Element {
  const session = useSession();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [logs, setLogs] = useState<KioskLog[]>([]);
  const [workerId, setWorkerId] = useState("");
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const todayISO = new Date().toISOString().split("T")[0];
  const pairCode = useMemo(() => {
    if (!selProject) return "------";
    let h = 0; for (const c of selProject) { h = (h * 31 + c.charCodeAt(0)) & 0xffffff; }
    return String(100000 + (h % 900000));
  }, [selProject]);
  const projLog = logs.filter(r => r.inTime && !r.outTime);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const load = useCallback(async () => {
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const uid = (await client.auth.getUser())?.data?.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data: om } = await client.from("org_members").select("org_id").eq("profile_id", uid).limit(1).maybeSingle();
    if (!om?.org_id) { setLoading(false); return; }
    const scope = memberProjectScope(session);
    let q = client.from("projects").select("id, name").eq("org_id", om.org_id).eq("status", "active");
    if (scope.mode === "member") {
      if (scope.projectIds.length === 0) { setProjects([]); setLoading(false); return; }
      q = q.in("id", scope.projectIds);
    }
    const { data: pjs } = await q;
    const pList = pjs ?? [];
    setProjects(pList);
    if (pList.length) setSelProject(pList[0].id);
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const loadProject = useCallback(async () => {
    if (!selProject) return;
    const client = await getClient();
    if (!client) return;
    const [wRes, aRes] = await Promise.all([
      client.from("labour_register").select("id, name, trade").eq("project_id", selProject).order("name", { ascending: true }),
      client.from("attendance").select("id, labour_id, attendee_name, in_time, out_time, hours, labour:labour_id(trade)").eq("project_id", selProject).eq("date", todayISO).eq("attendee_kind", "labour").order("in_time", { ascending: false }).limit(100),
    ]);
    const ws = (wRes.data ?? []) as Array<{ id: string; name: string; trade: string | null }>;
    setWorkers(ws);
    setWorkerId(ws[0]?.id ?? "");
    setLogs(((aRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      labourId: r.labour_id == null ? null : String(r.labour_id),
      name: String(r.attendee_name ?? ""),
      trade: (r.labour as { trade?: string | null } | null | undefined)?.trade ?? null,
      inTime: r.in_time == null ? null : String(r.in_time),
      outTime: r.out_time == null ? null : String(r.out_time),
      hours: r.hours == null ? null : Number(r.hours),
    })));
  }, [selProject, todayISO]);

  useEffect(() => { void loadProject(); }, [loadProject]);

  const clockIn = async () => {
    if (!workerId && !name.trim()) { showToast("Pick a worker or enter a name."); return; }
    const client = await getClient();
    if (!client) return;
    const uid = (await client.auth.getUser())?.data?.user?.id;
    const sel = workers.find(w => w.id === workerId);
    const attendeeName = sel ? sel.name : name.trim();
    const row = {
      project_id: selProject,
      attendee_kind: sel ? "labour" : "visitor",
      labour_id: sel ? sel.id : null,
      attendee_name: attendeeName,
      date: todayISO,
      status: "present",
      in_time: nowClock(),
      source: "kiosk",
      recorded_by: uid ?? null,
    };
    const { error } = await client.from("attendance").insert(row);
    if (error) { showToast(String(error.message ?? "Clock-in failed")); return; }
    setWorkerId(""); setName(""); setTrade("");
    showToast(`✓ ${attendeeName} clocked in`);
    void loadProject();
  };

  const clockOut = async (rowId: string) => {
    const row = logs.find(r => r.id === rowId);
    if (!row || row.outTime) return;
    const out = nowClock();
    const hours = hoursBetween(row.inTime, out);
    const client = await getClient();
    if (!client) return;
    const res = await clockOutAttendance(client, rowId, out, hours);
    if (!res.ok) { showToast(String(res.error ?? "Clock-out failed")); return; }
    setLogs(p => p.map(r => r.id === rowId ? { ...r, outTime: out, hours } : r));
    showToast("✓ Clocked out");
  };

  if (loading) return <div className="grid place-items-center p-12 bg-ink min-h-screen"><Spinner size={24} /></div>;
  if (!projects.length) return <div className="min-h-screen bg-ink text-cream grid place-items-center p-10">No active projects.</div>;

  return (
    <div className="min-h-screen bg-ink text-cream p-4 md:p-8 flex flex-col">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-bold tracking-widest uppercase text-warning">Labour kiosk — {fmtDate(todayISO)}</div>
          <h1 className="text-3xl font-light tracking-tight">Site attendance</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select dark value={selProject} onChange={e => setSelProject(e.target.value)} options={projects.map(p => ({ value: p.id, label: p.name }))} />
          <div className="text-right">
            <div className="text-[10px] tracking-widest uppercase text-cream/50">Pair code</div>
            <div className="font-mono text-2xl font-bold text-warning tracking-wider">{pairCode}</div>
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-ink/40 rounded-3xl p-8 flex flex-col border border-accent/25">
          <h2 className="text-2xl font-semibold mb-6">Clock in</h2>
          {workers.length > 0 && (
            <Select dark value={workerId} onChange={e => setWorkerId(e.target.value)} options={workers.map(w => ({ value: w.id, label: `${w.name}${w.trade ? ` · ${w.trade}` : ""}` }))} />
          )}
          {workers.length > 0 && (
            <div className="text-[11px] text-cream/40 mt-1 mb-3">Registered worker — or add a visitor name below.</div>
          )}
          {!workers.length && (
            <div className="text-[11px] text-cream/40 mb-3">No workers in the labour register yet — add them on the Labour tab, or record visitors below.</div>
          )}
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Visitor name (or register workers first)" className="w-full mb-3 p-4 bg-ink border border-accent/20 text-cream text-lg rounded-xl outline-none focus:border-accent" />
          <input value={trade} onChange={e => setTrade(e.target.value)} placeholder="Trade" className="w-full mb-5 p-4 bg-ink border border-accent/20 text-cream text-lg rounded-xl outline-none focus:border-accent" />
          <button onClick={clockIn} className="w-full py-5 bg-accent-2 text-white font-bold text-lg rounded-2xl hover:bg-accent">Clock in</button>
        </div>
        <div className="bg-ink/40 rounded-3xl p-8 flex flex-col border border-accent/25">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Today on site</h2>
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-accent/20 text-warning">{projLog.length} present</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {logs.length === 0 && <div className="text-center py-12 text-cream/40 text-sm">No clock-ins yet today.</div>}
            {logs.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-ink/60 border border-accent/12">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{r.name}</div>
                  <div className="text-[11px] text-cream/50">{r.trade ?? "General"} — in {fmtClock(r.inTime)}{r.outTime ? ` · out ${fmtClock(r.outTime)} · ${r.hours}h` : ""}</div>
                </div>
                {!r.outTime && <button onClick={() => clockOut(r.id)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-accent/15 text-warning hover:bg-accent/25">Clock out</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-accent text-fg-primary font-bold text-sm rounded-xl">{toast}</div>}
    </div>
  );
}
