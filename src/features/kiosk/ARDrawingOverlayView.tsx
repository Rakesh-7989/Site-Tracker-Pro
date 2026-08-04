// SiteTrack Pro — Drawing Comparison Tool (/kiosk/ar).
// v4 D2: reuses the shared DiffView canvas overlay to compare two revisions
// of the same drawing (old/superseded + newer/current). Replaces the dead
// stub that referenced non-existent drawings columns/buckets. Staff-gated by
// StubGuard (featureFlags STUB_VIEWS) + PlanGate feature="ar_overlay".

import { useCallback, useEffect, useState } from "react";
import { Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { PlanGate } from "@/auth";
import { DiffView, type DiffImageSource } from "@/features/shared/DiffView";
import { listDrawings, type Drawing } from "@/app/designQueries";
import { diffPairs } from "@/lib/drawingDiffPair";
import { resolveDiffPair } from "@/app/drawingDiffSources";

import { getClient } from "@/lib/supabase";

export function ARDrawingOverlayView(): JSX.Element {
  return <PlanGate feature="ar_overlay"><ARDrawingOverlayInner /></PlanGate>;
}

function ARDrawingOverlayInner(): JSX.Element {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [rows, setRows] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairIndex, setPairIndex] = useState(0);
  const [compareImages, setCompareImages] = useState<{ oldImage: DiffImageSource | null; newImage: DiffImageSource | null }>({ oldImage: null, newImage: null });
  const [compareBusy, setCompareBusy] = useState(false);

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
    let cancelled = false;
    (async () => {
      setError(null);
      const client = await getClient();
      if (!client || cancelled) return;
      const res = await listDrawings(client, selProject);
      if (cancelled) return;
      if (res.ok) { setRows(res.data); setPairIndex(0); setCompareImages({ oldImage: null, newImage: null }); }
      else setError(res.error);
    })();
    return () => { cancelled = true; };
  }, [selProject]);

  const pairs = diffPairs(rows);

  useEffect(() => {
    if (!selProject || pairs.length === 0) return;
    let cancelled = false;
    (async () => {
      const pair = pairs[pairIndex];
      if (!pair) return;
      setCompareBusy(true);
      const client = await getClient();
      if (!client || cancelled) { setCompareBusy(false); return; }
      const src = await resolveDiffPair(client, selProject, pair.old, pair.newer);
      if (cancelled) { setCompareBusy(false); return; }
      setCompareImages({ oldImage: src.oldImage, newImage: src.newImage });
      setCompareBusy(false);
    })();
    return () => { cancelled = true; };
  }, [selProject, pairIndex, pairs]);

  if (loading) return <div className="grid place-items-center p-12 min-h-screen bg-bg-primary"><Spinner size={24} /></div>;

  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="font-display text-3xl font-bold text-fg-primary">Drawing Comparison</h1>
        <Select value={selProject} onChange={e => setSelProject(e.target.value)} className="w-auto text-sm" options={projects.map(p => ({ value: p.id, label: p.name }))} />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {pairs.length === 0 ? (
        <div className="rounded-3xl border border-default bg-card p-8 text-center">
          <div className="text-4xl mb-3 opacity-30"><Icon name="image" size={36} /></div>
          <p className="text-fg-secondary text-sm">No two-revision drawing pairs for this project yet. Release a revised drawing (same title + type, different revision) to compare.</p>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl rounded-3xl border border-default bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Select value={String(pairIndex)} onChange={e => setPairIndex(Number(e.target.value))} className="w-full sm:w-auto text-sm" options={pairs.map((p, i) => ({ value: String(i), label: `${p.old.revision} → ${p.newer.revision} · ${p.old.title}` }))} />
            {compareBusy && <Spinner size={14} />}
          </div>
          {compareImages.oldImage && compareImages.newImage ? (
            <DiffView
              title={`${pairs[pairIndex].old.title} (${pairs[pairIndex].old.type})`}
              oldImage={compareImages.oldImage}
              newImage={compareImages.newImage}
              onClose={() => { /* inline panel */ }}
              onDownload={s => { if (s.url) window.open(s.url, "_blank", "noopener,noreferrer"); }}
            />
          ) : (
            <div className="grid place-items-center py-16 text-fg-tertiary text-sm">Loading comparison…</div>
          )}
        </div>
      )}
    </div>
  );
}