// SiteTrack Pro - Site Wall Kiosk (/kiosk/site).
// Wall-mounted situational awareness display. Shows latest project
// updates, open safety incidents, and active milestones side-by-side.

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { PlanGate } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries/queries";


import { getClient } from "@/lib/supabase/supabase";
export function SiteWallKioskView(): JSX.Element {
  return <PlanGate feature="kiosks"><SiteWallKioskInner /></PlanGate>;
}

function SiteWallKioskInner(): JSX.Element {
  const session = useSession();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [updates, setUpdates] = useState<Array<{ id: string; update_date: string; notes: string }>>([]);
  const [safety, setSafety] = useState<Array<{ id: string; description: string; status: string; severity: string }>>([]);
  const [milestones, setMilestones] = useState<Array<{ id: string; title: string; status: string; due_date: string | null }>>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!selProject) return;
    getClient().then(client => {
      if (!client) return;
      client.from("site_updates").select("id, update_date, notes").eq("project_id", selProject).order("update_date", { ascending: false }).limit(5).then(r => setUpdates(r.data ?? []));
      client.from("safety").select("id, description, status, severity").eq("project_id", selProject).order("created_at", { ascending: false }).limit(5).then(r => setSafety(r.data ?? []));
      client.from("milestones").select("id, title, status, due_date").eq("project_id", selProject).order("due_date", { ascending: true }).limit(5).then(r => setMilestones(r.data ?? []));
    });
  }, [selProject]);

  if (loading) return <div className="grid place-items-center p-12 min-h-screen bg-ink"><Spinner size={24} /></div>;

  return (
    <div className="min-h-screen bg-ink text-cream p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-light tracking-tight">Site Wall</h1>
        <Select dark value={selProject || ""} onChange={e => setSelProject(e.target.value)} options={projects.map(p => ({ value: p.id, label: p.name }))} />
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-ink/40 rounded-3xl p-6 border border-accent/25">
          <div className="text-[10px] font-bold tracking-widest uppercase text-warning mb-2">Latest updates</div>
          {updates.length === 0 && <div className="text-cream/40 text-sm italic">No updates yet.</div>}
          {updates.map(u => (
            <div key={u.id} className="mb-3 pb-3 border-b border-default/30">
              <div className="text-xs text-cream/50">{u.update_date}</div>
              <div className="text-sm">{u.notes}</div>
            </div>
          ))}
        </div>
        <div className="bg-ink/40 rounded-3xl p-6 border border-accent/25">
          <div className="text-[10px] font-bold tracking-widest uppercase text-warning mb-2">Safety incidents</div>
          {safety.length === 0 && <div className="text-cream/40 text-sm italic">No incidents recorded.</div>}
          {safety.map(s => {
            const sevColor = s.severity === "high" ? "text-error" : s.severity === "medium" ? "text-warning" : "text-success";
            const statusColor = s.status === "open" ? "bg-error-tint/20 text-error" : "bg-success/20 text-success";
            return (
              <div key={s.id} className="mb-3 pb-3 border-b border-default/30">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusColor}`}>{s.status}</span>
                  <span className={`text-[10px] font-bold ${sevColor}`}>{s.severity}</span>
                </div>
                <div className="text-sm font-semibold text-cream">{s.description}</div>
              </div>
            );
          })}
        </div>
        <div className="bg-ink/40 rounded-3xl p-6 border border-accent/25">
          <div className="text-[10px] font-bold tracking-widest uppercase text-warning mb-2">Milestones</div>
          {milestones.length === 0 && <div className="text-cream/40 text-sm italic">No milestones yet.</div>}
          {milestones.map(m => {
            const done = m.status === "completed";
            return (
              <div key={m.id} className="mb-3 pb-3 border-b border-default/30 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${done ? "bg-success" : "bg-warning"}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${done ? "text-cream/50 line-through" : "text-cream"}`}>{m.title}</div>
                  {m.due_date && <div className="text-[10px] text-cream/40">Due {m.due_date.slice(0, 10)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}