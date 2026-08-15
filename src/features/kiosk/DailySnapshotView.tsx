// SiteTrack Pro � Daily Snapshot (/kiosk/snapshot).
// Single-page project status summary with export and action buttons.

import { useCallback, useEffect, useState } from "react";
import { Spinner, Button } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { PlanGate } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";


import { getClient } from "@/lib/supabase";
import { buildCsvRows, downloadCsv, csvDateStamp } from "@/lib/genericCsv";
export function DailySnapshotView(): JSX.Element {
  return <PlanGate feature="kiosks"><DailySnapshotInner /></PlanGate>;
}

function DailySnapshotInner(): JSX.Element {
  const session = useSession();
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
    getClient().then(async client => {
      if (!client) return;
      const today = new Date().toISOString().split("T")[0];
      const [lRes, uRes, iRes, rRes] = await Promise.all([
        client.from("labour").select("id", { count: "exact", head: true }).eq("project_id", selProject).gte("date", today),
        client.from("site_updates").select("id", { count: "exact", head: true }).eq("project_id", selProject).gte("update_date", today),
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
    downloadCsv(`daily-snapshot-${selProject}-${csvDateStamp()}.csv`, buildCsvRows(rows));
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-fg-primary">Daily Snapshot</h1>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="secondary" onClick={exportCSV}>Export CSV</Button>
          <Select fit className="w-48" value={selProject} onChange={e => setSelProject(e.target.value)} options={projects.map(p => ({ value: p.id, label: p.name }))} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-success-tint rounded-2xl p-6 border border-success">
          <div className="text-xs font-bold tracking-wider text-success uppercase mb-1">Labour today</div>
          <div className="text-4xl font-light text-success">{snap.labour}</div>
        </div>
        <div className="bg-info-tint rounded-2xl p-6 border border-info">
          <div className="text-xs font-bold tracking-wider text-info uppercase mb-1">Updates today</div>
          <div className="text-4xl font-light text-info">{snap.updates}</div>
        </div>
        <div className="bg-error-tint rounded-2xl p-6 border border-error">
          <div className="text-xs font-bold tracking-wider text-error uppercase mb-1">Open issues</div>
          <div className="text-4xl font-light text-error">{snap.issues}</div>
        </div>
        <div className="bg-warning-tint rounded-2xl p-6 border border-warning">
          <div className="text-xs font-bold tracking-wider text-warning uppercase mb-1">RA bills</div>
          <div className="text-4xl font-light text-warning">{snap.raBills}</div>
        </div>
      </div>
      <div className="bg-secondary rounded-2xl p-4 border-l-4 border-default text-sm text-fg-primary">
        <strong>Snapshot summary</strong> for <strong>{projects.find(p => p.id === selProject)?.name ?? "�"}</strong> � fetched in real time from the project's labour register, updates, issues, and RA bills. CSV export downloads instantly.
      </div>
    </div>
  );
}
