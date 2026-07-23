// SiteTrack Pro â€” Site Wall Kiosk (/kiosk/site).
// Wall-mounted situational awareness display.

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/atoms";
import { PlanGate } from "@/auth";


import { getClient } from "@/lib/supabase";
export function SiteWallKioskView(): JSX.Element {
  return <PlanGate feature="kiosks"><SiteWallKioskInner /></PlanGate>;
}

function SiteWallKioskInner(): JSX.Element {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [updates, setUpdates] = useState<Array<{ id: string; update_date: string; text: string }>>([]);
  const [loading, setLoading] = useState(true);

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
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selProject) return;
    getClient().then(client => {
      if (!client) return;
      client.from("updates").select("id, update_date, text").eq("project_id", selProject).order("update_date", { ascending: false }).limit(20).then((r: { data: any }) => setUpdates(r.data ?? []));
    });
  }, [selProject]);

  if (loading) return <div className="grid place-items-center p-12 min-h-screen bg-ink-900"><Spinner size={24} /></div>;

  return (
    <div className="min-h-screen bg-ink-900 text-cream p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-light tracking-tight">Site Wall</h1>
        <select value={selProject} onChange={e => setSelProject(e.target.value)} className="px-4 py-2 bg-ink-700 border border-amber-600/30 text-cream rounded-xl text-sm outline-none">
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-ink-700/40 rounded-3xl p-6 border border-amber-600/25">
          <div className="text-[10px] font-bold tracking-widest uppercase text-amber-500 mb-2">Latest updates</div>
          {updates.slice(0, 5).map(u => (
            <div key={u.id} className="mb-3 pb-3 border-b border-ink-600/30">
              <div className="text-xs text-cream/50">{u.update_date}</div>
              <div className="text-sm">{u.text}</div>
            </div>
          ))}
          {updates.length === 0 && <div className="text-cream/40 text-sm italic">No updates yet.</div>}
        </div>
        <div className="bg-ink-700/40 rounded-3xl p-6 border border-amber-600/25 col-span-2 flex items-center justify-center text-cream/40">
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-30">&#9670;</div>
            <p className="text-sm">Site wall dashboard â€” safety notices, milestones, weather, and live feeds appear here in production.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
