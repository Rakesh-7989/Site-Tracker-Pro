// SiteTrack Pro — project Drawings tab (v3 port, Batch 4, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listDrawings, createDrawing, setDrawingStatus, deleteDrawing, type Drawing, type DrawingStatus } from "@/app/designQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "current", label: "Current" }, { value: "superseded", label: "Superseded" }];

export function DrawingsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("drawings:upload", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(""); const [type, setType] = useState("architectural"); const [rev, setRev] = useState("Rev A");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listDrawings(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!title.trim() || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createDrawing(c, { projectId, title: title.trim(), type, revision: rev.trim() || "Rev A", releasedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, title: title.trim(), type, revision: rev.trim() || "Rev A", status: "current" as DrawingStatus, releaseDate: new Date().toISOString().slice(0, 10) }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setTitle(""); setRev("Rev A");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Drawings</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span><Input className="mt-1" placeholder="e.g. Ground floor plan" value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Type</span><Select className="mt-1 w-auto" value={type} onChange={e => setType(e.target.value)} options={[{ value: "architectural", label: "Architectural" }, { value: "structural", label: "Structural" }, { value: "mep", label: "MEP" }, { value: "interior", label: "Interior" }]} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Revision</span><Input className="mt-1 w-24" value={rev} onChange={e => setRev(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Release"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No drawings released.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className={`p-3 flex items-center justify-between gap-3 ${r.status === "superseded" ? "opacity-60" : ""}`}>
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.title} <Badge tone="neutral">{r.revision}</Badge></div>
                <div className="text-[11px] text-fg-tertiary capitalize">{r.type}{r.releaseDate ? ` · ${r.releaseDate}` : ""}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as DrawingStatus; void run(`s-${r.id}`, c => setDrawingStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
                  : <Badge tone={r.status === "current" ? "success" : "neutral"}>{r.status}</Badge>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteDrawing(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
