// SiteTrack Pro — project Drawings tab (v3 port, Batch 4, DB-wired).
// v4 D1: storage-backed file register — attach/download/delete drawing files
// via the shared `deliverables` bucket (path <project_id>/<drawing_id>/<file>).

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/forms";
import { listDrawings, createDrawing, setDrawingStatus, setDrawingStage, setDrawingPreviewUrl, deleteDrawing, applyAutoSupersede, type Drawing, type DrawingStatus } from "@/app/queries/designQueries";
import {
  listDrawingFiles, uploadDrawingFile, deleteDrawingFiles, drawingFileUrl,
  drawingObjectPath, formatBytes, type DrawingFileRef,
} from "@/app/queries/drawingFileQueries";
import { logDownloadEvent } from "@/app/queries/downloadAuditQueries";
import { diffPairs, isRasterFileName } from "@/lib/drawingDiffPair";
import { resolveDiffPair } from "@/app/queries/drawingDiffSources";
import { DiffView, type DiffImageSource } from "@/features/shared/DiffView";
import { CadPreviewModal } from "@/features/shared/CadPreviewModal";
import { DxfThumbnail } from "@/features/shared/DxfThumbnail";
import { isCadFileName, isDxfFileName } from "@/lib/dxfPreview";
import { useStorageUploadGate, StorageQuotaWarning } from "@/features/shared/StorageUploadGate";
import { DESIGN_STAGES, DESIGN_STAGE_LABEL, type DesignStageId } from "@/app/engines/designWorkflow";
import { getDesignWorkflow, advanceDesignWorkflow, approveDesignWorkflow } from "@/app/queries/designWorkflowQueries";

import { getClient } from "@/lib/supabase/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "current", label: "Current" }, { value: "superseded", label: "Superseded" }];

export function DrawingsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("drawings:upload", { orgId: activeOrg?.orgId, projectId });
  const uploadGate = useStorageUploadGate(activeOrg?.orgId);
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
  const [compareOpen, setCompareOpen] = useState(false);
  const [pairIndex, setPairIndex] = useState(0);
  const [compareImages, setCompareImages] = useState<{ oldImage: DiffImageSource | null; newImage: DiffImageSource | null }>({ oldImage: null, newImage: null });
  const [previewTarget, setPreviewTarget] = useState<{ id: string; name: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listDrawings(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);

  // Phase E Opt2: persisted workflow stage stepper.
  const [flow, setFlow] = useState<DesignStageId | null>(null);
  const loadFlow = useCallback(async () => {
    const client = await getClient(); if (!client) return;
    const res = await getDesignWorkflow(client, projectId);
    if (res.ok) setFlow(res.data?.stage ?? null);
  }, [projectId]);
  useEffect(() => { void loadFlow(); }, [loadFlow]);

  const pairs = diffPairs(rows);

  useEffect(() => {
    if (!compareOpen || pairs.length === 0) return;
    let cancelled = false;
    (async () => {
      const pair = pairs[pairIndex];
      if (!pair) return;
      const client = await getClient();
      if (!client || cancelled) return;
      const src = await resolveDiffPair(client, projectId, pair.old, pair.newer);
      if (cancelled) return;
      setCompareImages({ oldImage: src.oldImage, newImage: src.newImage });
    })();
    return () => { cancelled = true; };
  }, [compareOpen, pairIndex, pairs, projectId]);

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
    const added: Drawing = { id: tmpId, projectId, title: title.trim(), type: type.trim(), revision: rev.trim() || "Rev A", status: "current" as DrawingStatus, releaseDate: new Date().toISOString().slice(0, 10), storagePath: null, previewUrl: null, designStage: "concept", supersededBy: null };
    await run("add", c => createDrawing(c, { projectId, title: title.trim(), type: type.trim(), revision: rev.trim() || "Rev A", releasedBy: session.user.id }), {
      apply: () => setRows(prev => [added, ...applyAutoSupersede(prev, added)]),
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
    if (res.ok) {
      await reloadFiles(drawingId);
      if (isRasterFileName(file.name)) {
        const path = drawingObjectPath(projectId, drawingId, file.name);
        await setDrawingPreviewUrl(client, drawingId, path);
        setRows(prev => prev.map(x => x.id === drawingId ? { ...x, previewUrl: path } : x));
      }
    }
    else setFileError(res.error);
    setUploading(null);
  };

  const download = async (d: Drawing, name: string) => {
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); return; }
    const path = drawingObjectPath(projectId, d.id, name);
    const res = await drawingFileUrl(client, path, 300);
    if (res.ok) {
      const size = files[d.id]?.find(f => f.name === name)?.size ?? 0;
      void logDownloadEvent(client, { projectId, register: "drawing", refId: d.id, fileName: name, filePath: path, sizeBytes: size });
      window.open(res.data, "_blank", "noopener,noreferrer");
    } else setFileError(res.error);
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
      <StorageQuotaWarning quota={uploadGate.quota} />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Drawings</h2>
        {pairs.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => { setPairIndex(0); setCompareImages({ oldImage: null, newImage: null }); setCompareOpen(true); }}>
            <Icon name="image" size={14} /><span className="ml-1">Compare revisions</span>
          </Button>
        )}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {fileError && <Alert variant="danger">{fileError}</Alert>}
      {flow && (
        <Card padding="md" title={<div>
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Design workflow</h3>
          <div className="mt-0.5 text-sm text-fg-secondary">Stage: <span className="font-semibold text-fg-primary">{DESIGN_STAGE_LABEL[flow]}</span></div>
        </div>} action={canEdit && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void run("adv-flow", c => advanceDesignWorkflow(c, projectId), { apply: () => setFlow(prev => prev ? DESIGN_STAGES[Math.min(DESIGN_STAGES.indexOf(prev) + 1, DESIGN_STAGES.length - 1)] : "requirements"), rollback: () => void loadFlow() })} disabled={busy === "adv-flow" || flow === "approved"}>
              {busy === "adv-flow" ? <Spinner size={14} /> : "Advance"}
                </Button>
                <Button size="sm" onClick={() => void run("appr-flow", c => approveDesignWorkflow(c, projectId, session?.user.id ?? ""), { apply: () => setFlow("approved"), rollback: () => void loadFlow() })} disabled={busy === "appr-flow" || flow === "approved"}>
                  {busy === "appr-flow" ? <Spinner size={14} /> : "Approve"}
                </Button>
          </div>
        )}>
          <ol className="flex items-center gap-1 overflow-x-auto">
            {DESIGN_STAGES.map((s, i) => {
              const reached = DESIGN_STAGES.indexOf(flow) >= i;
              return (
                <li key={s} className="flex items-center gap-1 flex-shrink-0">
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${reached ? "bg-accent-tint text-accent" : "bg-bg-secondary text-fg-tertiary"}`}>
                    <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${reached ? "bg-accent text-white" : "bg-elevated text-fg-tertiary"}`}>{i + 1}</span>
                    {DESIGN_STAGE_LABEL[s]}
                  </span>
                  {i < DESIGN_STAGES.length - 1 && <span className={`h-px w-3 ${reached && DESIGN_STAGES.indexOf(flow) > i ? "bg-accent" : "bg-border"}`} />}
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span><Input className="mt-1" placeholder="e.g. Ground floor plan" value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Type</span><Select fit className="mt-1 w-auto" value={type} onChange={e => setType(e.target.value)} options={[{ value: "architectural", label: "Architectural" }, { value: "structural", label: "Structural" }, { value: "mep", label: "MEP" }, { value: "interior", label: "Interior" }]} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Revision</span><Input fit className="mt-1 w-24" value={rev} onChange={e => setRev(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Release"}</Button>
        </Card>
      )}
      <input
        ref={inputRef} type="file" className="hidden"
        onChange={(e) => void onPickFile(e)}
      />
      {loading ? (
        <div role="status" aria-label="Loading drawings" aria-busy="true" className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-fg-secondary">
          <Icon name="image" size={48} className="mx-auto mb-3 text-error" />
          <p>No drawings released yet.</p>
          <p className="text-[12px] text-fg-tertiary">Upload your first drawing using the form above.</p>
        </div>
      ) : (
        <div className="space-y-2">{rows.map(r => (
          <Card key={r.id} className={`p-3 ${r.status === "superseded" ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.title} <Badge tone="neutral">{r.revision}</Badge></div>
                <div className="text-[11px] text-fg-tertiary capitalize">{r.type}{r.releaseDate ? ` · ${r.releaseDate}` : ""}{r.status === "superseded" && r.supersededBy ? ` · superseded by ${rows.find(x => x.id === r.supersededBy)?.revision ?? "newer revision"}` : ""}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select fit className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as DrawingStatus; void run(`s-${r.id}`, c => setDrawingStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
                  : <Badge tone={r.status === "current" ? "success" : "neutral"}>{r.status}</Badge>}
                {canEdit && (
                  <Select fit
                    className="w-auto text-xs"
                    value={r.designStage || "concept"}
                    onChange={e => { const v = e.target.value; void run(`stg-${r.id}`, c => setDrawingStage(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, designStage: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, designStage: r.designStage } : x)) }); }}
                    options={DESIGN_STAGES.map(s => ({ value: s, label: DESIGN_STAGE_LABEL[s] }))}
                  />
                )}
                {canEdit && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => openPicker(r.id)} disabled={uploading === r.id || !uploadGate.canUpload}>
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
                    <span className="flex min-w-0 items-center gap-1.5" title={f.name}>
                      {isDxfFileName(f.name) ? (
                        <DxfThumbnail
                          fileName={f.name}
                          size={20}
                          cacheKey={drawingObjectPath(projectId, r.id, f.name)}
                          getUrl={async () => {
                            const client = await getClient();
                            if (!client) return { ok: false as const, error: "Backend not configured." };
                            return drawingFileUrl(client, drawingObjectPath(projectId, r.id, f.name), 300);
                          }}
                        />
                      ) : (
                        <Icon name="doc" size={13} className="flex-shrink-0 text-fg-tertiary" />
                      )}
                      <span className="truncate text-fg-primary">
                        {f.name}
                        <span className="ml-1.5 text-fg-tertiary">{formatBytes(f.size)}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {isCadFileName(f.name) && (
                        <Button size="sm" variant="ghost" onClick={() => setPreviewTarget({ id: r.id, name: f.name })} title="Preview">
                          <Icon name="eye" size={14} />
                        </Button>
                      )}
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
          </Card>))}</div>
      )}

      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} size="full" title="Compare drawing revisions" subtitle={pairs[pairIndex] ? `${pairs[pairIndex].old.title} (${pairs[pairIndex].old.type})` : undefined} ariaLabel="Compare drawing revisions">
        {pairs.length > 0 ? (
          <div className="flex flex-col gap-3">
            <Select fit
              className="w-full sm:w-auto"
              value={String(pairIndex)}
              onChange={e => { setPairIndex(Number(e.target.value)); setCompareImages({ oldImage: null, newImage: null }); }}
              options={pairs.map((p, i) => ({ value: String(i), label: `${p.old.revision} → ${p.newer.revision} · ${p.old.title}` }))}
            />
            {compareImages.oldImage && compareImages.newImage && (
              <DiffView
                title={`${pairs[pairIndex].old.title} (${pairs[pairIndex].old.type})`}
                oldImage={compareImages.oldImage}
                newImage={compareImages.newImage}
                onClose={() => setCompareOpen(false)}
                onDownload={s => { if (s.url) window.open(s.url, "_blank", "noopener,noreferrer"); }}
              />
            )}
          </div>
        ) : (
          <div className="text-sm text-fg-secondary">No two-revision pairs to compare.</div>
        )}
      </Modal>

      <CadPreviewModal
        open={previewTarget !== null}
        onClose={() => setPreviewTarget(null)}
        fileName={previewTarget?.name ?? null}
        label="drawing"
        getUrl={async () => {
          const client = await getClient();
          if (!client) return { ok: false, error: "Backend not configured." };
          if (!previewTarget) return { ok: false, error: "No file selected." };
          return drawingFileUrl(client, drawingObjectPath(projectId, previewTarget.id, previewTarget.name), 120);
        }}
      />
    </div>
  );
}