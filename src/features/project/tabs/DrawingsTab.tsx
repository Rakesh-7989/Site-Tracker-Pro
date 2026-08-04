// SiteTrack Pro — project Drawings tab (v3 port, Batch 4, DB-wired).
// v4 D1: storage-backed file register — attach/download/delete drawing files
// via the shared `deliverables` bucket (path <project_id>/<drawing_id>/<file>).

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listDrawings, createDrawing, setDrawingStatus, deleteDrawing, type Drawing, type DrawingStatus } from "@/app/designQueries";
import {
  listDrawingFiles, uploadDrawingFile, deleteDrawingFiles, drawingFileUrl,
  drawingObjectPath, formatBytes, type DrawingFileRef,
} from "@/app/drawingFileQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "current", label: "Current" }, { value: "superseded", label: "Superseded" }];

export function DrawingsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("drawings:upload", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Drawing[]>([]);
  const [files, setFiles] = useState<Record<string, DrawingFileRef[]>>({});
  const [fileLoading, setFileLoading] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(""); const [type, setType] = useState("architectural"); const [rev, setRev] = useState("Rev A");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [targetDrawing, setTargetDrawing] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listDrawings(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);

  const reloadFiles = useCallback(async (drawingId: string) => {
    setFileLoading(drawingId); setFileError(null);
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); setFileLoading(null); return; }
    const res = await listDrawingFiles(client, projectId, drawingId);
    if (res.ok) setFiles(prev => ({ ...prev, [drawingId]: res.data }));
    else setFileError(res.error);
    setFileLoading(null);
  }, [projectId]);

  const add = async () => {
    if (!title.trim() || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createDrawing(c, { projectId, title: title.trim(), type, revision: rev.trim() || "Rev A", releasedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, title: title.trim(), type, revision: rev.trim() || "Rev A", status: "current" as DrawingStatus, releaseDate: new Date().toISOString().slice(0, 10) }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setTitle(""); setRev("Rev A");
  };

  const openPicker = (drawingId: string) => {
    setTargetDrawing(drawingId);
    setFileError(null);
    if (inputRef.current) { inputRef.current.value = ""; inputRef.current.click(); }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetDrawing) return;
    const drawingId = targetDrawing;
    setTargetDrawing(null);
    setUploading(drawingId); setFileError(null);
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); setUploading(null); return; }
    const res = await uploadDrawingFile(client, projectId, drawingId, file, file.name, { upsert: true });
    if (res.ok) await reloadFiles(drawingId);
    else setFileError(res.error);
    setUploading(null);
  };

  const download = async (d: Drawing, name: string) => {
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); return; }
    const path = drawingObjectPath(projectId, d.id, name);
    const res = await drawingFileUrl(client, path, 300);
    if (res.ok) window.open(res.data, "_blank", "noopener,noreferrer");
    else setFileError(res.error);
  };

  const removeFile = async (d: Drawing, name: string) => {
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); return; }
    const path = drawingObjectPath(projectId, d.id, name);
    const res = await deleteDrawingFiles(client, [path]);
    if (res.ok) await reloadFiles(d.id);
    else setFileError(res.error);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Drawings</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {fileError && <Alert variant="danger">{fileError}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span><Input className="mt-1" placeholder="e.g. Ground floor plan" value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Type</span><Select className="mt-1 w-auto" value={type} onChange={e => setType(e.target.value)} options={[{ value: "architectural", label: "Architectural" }, { value: "structural", label: "Structural" }, { value: "mep", label: "MEP" }, { value: "interior", label: "Interior" }]} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Revision</span><Input className="mt-1 w-24" value={rev} onChange={e => setRev(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Release"}</Button>
        </Card>
      )}
      <input
        ref={inputRef} type="file" className="hidden"
        onChange={(e) => void onPickFile(e)}
      />
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No drawings released.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className={`p-3 ${r.status === "superseded" ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.title} <Badge tone="neutral">{r.revision}</Badge></div>
                  <div className="text-[11px] text-fg-tertiary capitalize">{r.type}{r.releaseDate ? ` · ${r.releaseDate}` : ""}</div></div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as DrawingStatus; void run(`s-${r.id}`, c => setDrawingStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
                    : <Badge tone={r.status === "current" ? "success" : "neutral"}>{r.status}</Badge>}
                  {canEdit && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => openPicker(r.id)} disabled={uploading === r.id}>
                        {uploading === r.id ? <Spinner size={14} /> : <Icon name="upload" size={14} />}
                        <span className="ml-1 hidden sm:inline">Attach</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteDrawing(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {fileLoading === r.id ? (
                  <div className="flex items-center gap-2 text-[11px] text-fg-tertiary"><Spinner size={12} /> Loading files…</div>
                ) : (files[r.id] ?? []).length === 0 ? (
                  <div className="text-[11px] text-fg-tertiary">No files attached.</div>
                ) : (
                  (files[r.id] ?? []).map(f => (
                    <div key={f.name} className="flex items-center justify-between gap-2 rounded bg-bg-secondary px-2 py-1 text-[12px]">
                      <span className="truncate text-fg-primary" title={f.name}>
                        <Icon name="doc" size={13} className="mr-1.5 inline text-fg-tertiary" />
                        {f.name}
                        <span className="ml-1.5 text-fg-tertiary">{formatBytes(f.size)}</span>
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => void download(r, f.name)} title="Download">
                          <Icon name="download" size={14} />
                        </Button>
                        {canEdit && (
                          <Button size="sm" variant="ghost" onClick={() => void removeFile(r, f.name)} title="Delete file">
                            <Icon name="trash" size={13} className="text-error" />
                          </Button>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>))}</div>}
    </div>
  );
}