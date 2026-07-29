// SiteTrack Pro — Platform Audit Log admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { Card, Spinner, AccessDenied } from "@/components/ui/atoms";
import { listAuditEvents, type AuditEvent } from "@/app/platformAuditQueries";


import { getClient } from "@/lib/supabase";
function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function PlatformAuditView(): JSX.Element {
  const can = useCan("platform:audit:read:cross-org");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const res = await listAuditEvents(client);
    if (res.ok) setEvents(res.data);
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
          <h1 className="text-2xl font-black text-fg-primary">Audit Log</h1>
          <p className="text-fg-tertiary text-sm mt-1">{filtered.length} events</p>
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-default rounded-xl px-3 py-2 text-sm">
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-secondary text-xs font-bold uppercase tracking-wider text-fg-secondary border-b border-default">
            <div className="col-span-4 md:col-span-2">Time</div>
            <div className="hidden md:block md:col-span-2">User</div>
            <div className="col-span-3 md:col-span-2">Type</div>
            <div className="col-span-5 md:col-span-6">Action</div>
          </div>
          <div className="divide-y divide-default max-h-[60vh] overflow-y-auto">
            {filtered.map(e => (
              <div key={e.id} className="grid grid-cols-12 gap-3 px-5 py-3 text-sm hover:bg-secondary">
                <div className="col-span-4 md:col-span-2 text-xs text-fg-secondary font-mono">{fmtTime(e.time)}</div>
                <div className="hidden md:block md:col-span-2 text-xs font-semibold">{e.by}<span className="text-fg-tertiary font-normal ml-1">· {e.role}</span></div>
                <div className="col-span-3 md:col-span-2"><span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-secondary text-fg-secondary">{e.type}</span></div>
                <div className="col-span-5 md:col-span-6 text-xs text-fg-primary truncate"><strong>{e.action}</strong>{e.detail ? ` — ${e.detail}` : ""}</div>
              </div>
            ))}
            {filtered.length === 0 && <div className="p-8 text-center text-fg-secondary italic">No events.</div>}
          </div>
        </div>
      </Card>
    </div>
  );
}
