// SiteTrack Pro — Platform Audit Log admin view.

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner } from "@/components/ui/atoms";

interface AuditEvent { id: string; time: string; type: string; by: string; role: string; action: string; detail?: string; org_id?: string; project_id?: string; }

async function getClient() {
  const mod = await import("../../lib/supabase.js");
  return await (mod as any).getSupabaseClient();
}

function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function PlatformAuditView(): JSX.Element {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const evRes = await client.from("activity_log").select("*").order("time", { ascending: false }).limit(200);
    setEvents(evRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  const types = Array.from(new Set(events.map(e => e.type))).filter(Boolean);
  const filtered = filterType === "all" ? events : events.filter(e => e.type === filterType);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-ink-900">Audit Log</h1>
          <p className="text-ink-400 text-sm mt-1">{filtered.length} events</p>
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-stone-300 rounded-xl px-3 py-2 text-sm">
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-stone-100 text-xs font-bold uppercase tracking-wider text-ink-500 border-b border-stone-200">
          <div className="col-span-2">Time</div>
          <div className="col-span-2">User</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-6">Action</div>
        </div>
        <div className="divide-y divide-stone-100 max-h-[60vh] overflow-y-auto">
          {filtered.map(e => (
            <div key={e.id} className="grid grid-cols-12 gap-3 px-5 py-3 text-sm hover:bg-stone-50">
              <div className="col-span-2 text-xs text-ink-500 font-mono">{fmtTime(e.time)}</div>
              <div className="col-span-2 text-xs font-semibold">{e.by}<span className="text-ink-400 font-normal ml-1">· {e.role}</span></div>
              <div className="col-span-2"><span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-stone-100 text-ink-600">{e.type}</span></div>
              <div className="col-span-6 text-xs text-ink-700 truncate"><strong>{e.action}</strong>{e.detail ? ` — ${e.detail}` : ""}</div>
            </div>
          ))}
          {filtered.length === 0 && <div className="p-8 text-center text-ink-500 italic">No events.</div>}
        </div>
      </Card>
    </div>
  );
}
