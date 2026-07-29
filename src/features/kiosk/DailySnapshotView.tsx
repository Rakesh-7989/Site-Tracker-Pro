// SiteTrack Pro — Daily Snapshot (/kiosk/snapshot).
// Single-page project status summary with export and action buttons.

import { useCallback, useEffect, useState } from "react";
import { Spinner, Button } from "@/components/ui/atoms";
import { PlanGate } from "@/auth";


import { getClient } from "@/lib/supabase";
export function DailySnapshotView(): JSX.Element {
  return <PlanGate feature="kiosks"><DailySnapshotInner /></PlanGate>;
}

function DailySnapshotInner(): JSX.Element {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [loading, setLoading] = useState(true);
  const [snap, setSnap] = useState<{ labour: number; updates: number; issues: number; raBills: number }>({ labour: 0, updates: 0, issues: 0, raBills: 0 });

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
    getClient().then(async client => {
      if (!client) return;
      const today = new Date().toISOString().split("T")[0];
      const [lRes, uRes, iRes, rRes] = await Promise.all([
        client.from("labour").select("id", { count: "exact", head: true }).eq("project_id", selProject).gte("date", today),
        client.from("updates").select("id", { count: "exact", head: true }).eq("project_id", selProject).gte("update_date", today),
        client.from("issues").select("id", { count: "exact", head: true }).eq("project_id", selProject).eq("status", "open"),
        client.from("ra_bills").select("id", { count: "exact", head: true }).eq("project_id", selProject),
      ]);
      setSnap({ labour: lRes.count ?? 0, updates: uRes.count ?? 0, issues: iRes.count ?? 0, raBills: rRes.count ?? 0 });
    });
  }, [selProject]);

  const exportCSV = () => {
    const rows = [
      ["Metric", "Count"],
      ["Labour entries today", snap.labour],
      ["Updates today", snap.updates],
      ["Open issues", snap.issues],
      ["RA bills", snap.raBills],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-snapshot-${selProject}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-ink-900">Daily Snapshot</h1>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="secondary" onClick={exportCSV}>Export CSV</Button>
          <select value={selProject} onChange={e => setSelProject(e.target.value)} className="border border-stone-300 rounded-xl px-3 py-2 text-sm">
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-200">
          <div className="text-xs font-bold tracking-wider text-emerald-600 uppercase mb-1">Labour today</div>
          <div className="text-4xl font-light text-emerald-800">{snap.labour}</div>
        </div>
        <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200">
          <div className="text-xs font-bold tracking-wider text-blue-600 uppercase mb-1">Updates today</div>
          <div className="text-4xl font-light text-blue-800">{snap.updates}</div>
        </div>
        <div className="bg-red-50 rounded-2xl p-6 border border-red-200">
          <div className="text-xs font-bold tracking-wider text-red-600 uppercase mb-1">Open issues</div>
          <div className="text-4xl font-light text-red-800">{snap.issues}</div>
        </div>
        <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200">
          <div className="text-xs font-bold tracking-wider text-amber-600 uppercase mb-1">RA bills</div>
          <div className="text-4xl font-light text-amber-800">{snap.raBills}</div>
        </div>
      </div>
      <div className="bg-cream-200 rounded-2xl p-4 border-l-4 border-cream-500 text-sm text-ink-700">
        <strong>Snapshot summary</strong> for <strong>{projects.find(p => p.id === selProject)?.name ?? "—"}</strong> — fetched in real time from the project's labour register, updates, issues, and RA bills. CSV export downloads instantly.
      </div>
    </div>
  );
}
