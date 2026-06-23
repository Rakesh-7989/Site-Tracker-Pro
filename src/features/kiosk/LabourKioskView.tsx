// SiteTrack Pro — Labour Attendance Kiosk (/kiosk/labour).
// Tablet-optimised clock-in/out for site entry.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/atoms";

async function getClient() {
  const mod = await import("../../lib/supabase.js");
  return await (mod as any).getSupabaseClient();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function LabourKioskView(): JSX.Element {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [logs, setLogs] = useState<Array<{ id: string; date: string; badge: string; name: string; trade: string; in_time: string; out_time: string | null; hours: number }>>([]);
  const [badge, setBadge] = useState("");
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
  const projLog = logs.filter(r => r.date === todayISO);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const load = useCallback(async () => {
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const uid = (await client.auth.getUser())?.data?.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data: om } = await client.from("org_members").select("org_id").eq("profile_id", uid).limit(1).maybeSingle();
    if (!om?.org_id) { setLoading(false); return; }
    const { data: pjs } = await client.from("projects").select("id, name").eq("org_id", om.org_id).eq("status", "active");
    const pList = pjs ?? [];
    setProjects(pList);
    if (pList.length) setSelProject(pList[0].id);
    const { data: l } = await client.from("labour").select("*").order("in_time", { ascending: false }).limit(100);
    setLogs(l ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const clockIn = async () => {
    if (!badge.trim() || !name.trim()) { showToast("Badge ID + name required."); return; }
    const row = { id: "l_" + Date.now(), date: todayISO, badge: badge.trim(), name: name.trim(), trade: trade.trim() || "General", in_time: new Date().toISOString(), out_time: null, hours: 0, project_id: selProject };
    const client = await getClient();
    if (client) await client.from("labour").insert(row);
    setLogs(p => [row, ...p]);
    setBadge(""); setName(""); setTrade(""); showToast(`✓ ${row.name} clocked in`);
  };

  const clockOut = async (rowId: string) => {
    const out = new Date();
    const row = logs.find(r => r.id === rowId);
    if (!row || row.out_time) return;
    const hours = Math.max(0, Math.round(((out.getTime() - new Date(row.in_time).getTime()) / 3600000) * 100) / 100);
    const client = await getClient();
    if (client) await client.from("labour").update({ out_time: out.toISOString(), hours }).eq("id", rowId);
    setLogs(p => p.map(r => r.id === rowId ? { ...r, out_time: out.toISOString(), hours } : r));
    showToast("✓ Clocked out");
  };

  if (loading) return <div className="grid place-items-center p-12 bg-ink-900 min-h-screen"><Spinner size={24} /></div>;
  if (!projects.length) return <div className="min-h-screen bg-ink-900 text-cream grid place-items-center p-10">No active projects.</div>;

  return (
    <div className="min-h-screen bg-ink-900 text-cream p-4 md:p-8 flex flex-col">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-bold tracking-widest uppercase text-amber-500">Labour kiosk · {fmtDate(todayISO)}</div>
          <h1 className="text-3xl font-light tracking-tight">Site attendance</h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={selProject} onChange={e => setSelProject(e.target.value)} className="px-4 py-2.5 bg-ink-700 border border-amber-600/30 text-cream rounded-xl text-sm outline-none">
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="text-right">
            <div className="text-[10px] tracking-widest uppercase text-cream/50">Pair code</div>
            <div className="font-mono text-2xl font-bold text-amber-400 tracking-wider">{pairCode}</div>
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-ink-700/40 rounded-3xl p-8 flex flex-col border border-amber-600/25">
          <h2 className="text-2xl font-semibold mb-6">Clock in</h2>
          <input value={badge} onChange={e => setBadge(e.target.value.toUpperCase())} placeholder="Badge ID (e.g. SP-0042)" className="w-full mb-3 p-4 bg-ink-900 border border-amber-600/20 text-cream text-lg rounded-xl outline-none focus:border-amber-500 font-mono" />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Worker name" className="w-full mb-3 p-4 bg-ink-900 border border-amber-600/20 text-cream text-lg rounded-xl outline-none focus:border-amber-500" />
          <input value={trade} onChange={e => setTrade(e.target.value)} placeholder="Trade" className="w-full mb-5 p-4 bg-ink-900 border border-amber-600/20 text-cream text-lg rounded-xl outline-none focus:border-amber-500" />
          <button onClick={clockIn} className="w-full py-5 bg-amber-600 text-white font-bold text-lg rounded-2xl hover:bg-amber-500">Clock in</button>
        </div>
        <div className="bg-ink-700/40 rounded-3xl p-8 flex flex-col border border-amber-600/25">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Today on site</h2>
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400">{projLog.length} present</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {projLog.length === 0 && <div className="text-center py-12 text-cream/40 text-sm">No clock-ins yet today.</div>}
            {projLog.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-ink-900/60 border border-amber-600/12">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{r.name} <span className="text-cream/40 font-mono text-[10px] ml-1">{r.badge}</span></div>
                  <div className="text-[11px] text-cream/50">{r.trade} · in {fmtTime(r.in_time)}{r.out_time ? ` · out ${fmtTime(r.out_time)} · ${r.hours}h` : ""}</div>
                </div>
                {!r.out_time && <button onClick={() => clockOut(r.id)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25">Clock out</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-amber-500 text-ink-900 font-bold text-sm rounded-xl">{toast}</div>}
    </div>
  );
}
