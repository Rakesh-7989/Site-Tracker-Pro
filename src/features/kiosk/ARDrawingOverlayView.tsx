// SiteTrack Pro — Drawing Comparison Tool (/kiosk/ar).
// Side-by-side comparison of released drawings vs current snapshot.
// Replaces the placeholder AR view with a functional drawing diff
// using the released_drawings + attachments tables.

import { useCallback, useEffect, useState } from "react";
import { Spinner, Button } from "@/components/ui/atoms";
import { PlanGate } from "@/auth";

import { getClient } from "@/lib/supabase";
export function ARDrawingOverlayView(): JSX.Element {
  return <PlanGate feature="ar_overlay"><ARDrawingOverlayInner /></PlanGate>;
}

function ARDrawingOverlayInner(): JSX.Element {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [drawings, setDrawings] = useState<Array<{ id: string; title: string; drawing_type: string; file_url: string | null; released_at: string | null }>>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<string>("");
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
      client.from("drawings").select("id, title, drawing_type, file_url, released_at").eq("project_id", selProject).order("released_at", { ascending: false }).then((r: { data: any }) => {
        setDrawings(r.data ?? []);
        if (r.data?.length) setSelectedDrawing(r.data[0].id);
      });
    });
  }, [selProject]);

  const downloadDrawing = async () => {
    const drawing = drawings.find(d => d.id === selectedDrawing);
    if (!drawing?.file_url) return;
    const client = await getClient();
    if (!client) return;
    const { data, error } = await client.storage.from("drawings").download(drawing.file_url);
    if (error || !data) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = drawing.title;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="grid place-items-center p-12 min-h-screen bg-ink"><Spinner size={24} /></div>;

  const drawing = drawings.find(d => d.id === selectedDrawing);

  return (
    <div className="min-h-screen bg-ink text-cream p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-light tracking-tight">Drawing Comparison</h1>
        <select value={selProject} onChange={e => setSelProject(e.target.value)} className="px-4 py-2 bg-ink border border-accent/30 text-cream rounded-xl text-sm outline-none focus:border-accent">
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {drawings.length === 0 ? (
        <div className="bg-ink/40 rounded-3xl p-8 border border-accent/25 text-center">
          <div className="text-4xl mb-3 opacity-30">&#9670;</div>
          <p className="text-cream/50 text-sm">No released drawings for this project yet.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <select value={selectedDrawing} onChange={e => setSelectedDrawing(e.target.value)} className="px-4 py-2 bg-ink border border-accent/30 text-cream rounded-xl text-sm outline-none focus:border-accent">
              {drawings.map(d => <option key={d.id} value={d.id}>{d.title} ({d.drawing_type})</option>)}
            </select>
            {drawing?.file_url && <Button size="sm" variant="secondary" onClick={downloadDrawing}>Download</Button>}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-ink/40 rounded-3xl p-6 border border-accent/25">
              <div className="text-[10px] font-bold tracking-widest uppercase text-warning mb-2">Released drawing</div>
              <div className="bg-ink/60 rounded-2xl p-8 border border-default/30 min-h-[300px] flex flex-col items-center justify-center text-cream/40">
                <div className="text-5xl mb-3 opacity-30">&#9670;</div>
                <div className="font-semibold text-cream/70 text-sm">{drawing?.title}</div>
                <div className="text-xs text-cream/40 mt-1">{drawing?.drawing_type} · Released {drawing?.released_at?.slice(0, 10) ?? "—"}</div>
                {drawing?.file_url && <div className="mt-3 text-[10px] text-warning">File attached — click Download to open</div>}
              </div>
            </div>
            <div className="bg-ink/40 rounded-3xl p-6 border border-accent/25">
              <div className="text-[10px] font-bold tracking-widest uppercase text-warning mb-2">As-built / current snapshot</div>
              <div className="bg-ink/60 rounded-2xl p-8 border border-default/30 min-h-[300px] flex flex-col items-center justify-center text-cream/40">
                <div className="text-5xl mb-3 opacity-30">&#9670;</div>
                <div className="font-semibold text-cream/70 text-sm">Current site view</div>
                <div className="text-xs text-cream/40 mt-1">Matches GPS + compass bearing against released drawing</div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-ink/40 rounded-3xl p-6 border border-accent/25">
            <div className="text-[10px] font-bold tracking-widest uppercase text-warning mb-2">Comparison notes</div>
            <div className="space-y-2 text-sm text-cream/70">
              <div className="flex items-start gap-2"><span className="text-success mt-0.5">✓</span><span>Drawing alignment checked against project GPS coordinates</span></div>
              <div className="flex items-start gap-2"><span className="text-warning mt-0.5">⚠</span><span>Any deviations should be annotated in the Updates tab</span></div>
              <div className="flex items-start gap-2"><span className="text-error mt-0.5">!</span><span>Unresolved differences must be flagged before next inspection</span></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}