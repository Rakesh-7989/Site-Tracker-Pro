// SiteTrack Pro — consultancy deliverables tab (v4 C1 + C3.2 file uploads).
// Register the deliverables a consultancy/design project owes its client.
// create/edit → deliverable:manage; approve/reject/issue → deliverable:approve.
// File attach/download → project member (storage RLS); file delete → managers.
// Doc types + status follow the deliverables CHECK constraints (139).

import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listFeePhases, type FeePhase } from "@/app/phaseQueries";
import {
  listDeliverables, createDeliverable, setDeliverableStatus, deleteDeliverable,
  DOC_TYPES, type Deliverable, type DeliverableStatus, type DocType,
} from "@/app/deliverableQueries";
import {
  listDeliverableFiles, uploadDeliverableFile, deleteDeliverableFiles, deliverableFileUrl,
  deliverableObjectPath, formatBytes, type DeliverableFileRef,
} from "@/app/deliverableStorageQueries";
import { logDownloadEvent } from "@/app/downloadAuditQueries";

const STATUS_TONE: Record<DeliverableStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral", in_review: "info", approved: "success", rejected: "danger", issued: "success",
};
const STATUS_LABEL: Record<DeliverableStatus, string> = {
  draft: "Draft", in_review: "In review", approved: "Approved", rejected: "Rejected", issued: "Issued",
};
const DOC_LABEL: Record<DocType, string> = {
  drawing: "Drawing", spec: "Spec", report: "Report", model: "Model",
  schedule: "Schedule", certificate: "Certificate", other: "Other",
};
const NEXT: Record<DeliverableStatus, DeliverableStatus> = {
  draft: "in_review", in_review: "approved", approved: "issued", rejected: "in_review", issued: "draft",
};

export function DeliverablesTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("deliverable:manage", { orgId: activeOrg?.orgId, projectId });
  const canApprove = useCan("deliverable:approve", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<Deliverable[]>([]);
  const [phases, setPhases] = useState<FeePhase[]>([]);
  const [files, setFiles] = useState<Record<string, DeliverableFileRef[]>>({});
  const [fileLoading, setFileLoading] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType>("drawing");
  const [phaseId, setPhaseId] = useState("");
  const [due, setDue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [targetDeliverable, setTargetDeliverable] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [d, p] = await Promise.all([listDeliverables(client, projectId), listFeePhases(client, projectId)]);
    if (d.ok) setRows(d.data); else setError(d.error);
    if (p.ok) setPhases(p.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const reloadFiles = useCallback(async (deliverableId: string) => {
    setFileLoading(deliverableId); setFileError(null);
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); setFileLoading(null); return; }
    const res = await listDeliverableFiles(client, projectId, deliverableId);
    if (res.ok) setFiles(prev => ({ ...prev, [deliverableId]: res.data }));
    else setFileError(res.error);
    setFileLoading(null);
  }, [projectId]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!title.trim()) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createDeliverable(c, { projectId, title: title.trim(), docType, phaseId: phaseId || null, dueDate: due || null }), {
      apply: () => setRows(prev => [{ id: tmpId, phaseId: phaseId || null, title: title.trim(), docType, status: "draft" as DeliverableStatus, dueDate: due || null, ownerId: null, ownerName: null, createdAt: "" }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setTitle(""); setPhaseId(""); setDue("");
  };

  const openPicker = (deliverableId: string) => {
    setTargetDeliverable(deliverableId);
    setFileError(null);
    if (inputRef.current) { inputRef.current.value = ""; inputRef.current.click(); }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetDeliverable) return;
    const deliverableId = targetDeliverable;
    setTargetDeliverable(null);
    setUploading(deliverableId); setFileError(null);
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); setUploading(null); return; }
    const res = await uploadDeliverableFile(client, projectId, deliverableId, file, file.name, { upsert: true });
    if (res.ok) await reloadFiles(deliverableId);
    else setFileError(res.error);
    setUploading(null);
  };

  const download = async (d: Deliverable, name: string) => {
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); return; }
    const path = deliverableObjectPath(projectId, d.id, name);
    const res = await deliverableFileUrl(client, path, 300);
    if (res.ok) {
      const size = files[d.id]?.find(f => f.name === name)?.size ?? 0;
      void logDownloadEvent(client, { projectId, register: "deliverable", refId: d.id, fileName: name, filePath: path, sizeBytes: size });
      window.open(res.data, "_blank", "noopener,noreferrer");
    } else setFileError(res.error);
  };

  const removeFile = async (d: Deliverable, name: string) => {
    const client = await getClient();
    if (!client) { setFileError("Backend not configured."); return; }
    const path = deliverableObjectPath(projectId, d.id, name);
    const res = await deleteDeliverableFiles(client, [path]);
    if (res.ok) await reloadFiles(d.id);
    else setFileError(res.error);
  };

  const canCycle = (d: Deliverable) => canApprove || (canManage && (d.status === "draft" || d.status === "in_review"));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Deliverables</h2>
        {rows.length > 0 && <span className="text-sm text-fg-secondary">{rows.filter(d => d.status === "issued").length}/{rows.length} issued</span>}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {fileError && <Alert variant="danger">{fileError}</Alert>}

      {canManage && (
        <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span>
            <Input className="mt-1" placeholder="e.g. GFC Structural Drawings" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Type</span>
            <Select className="mt-1" options={DOC_TYPES.map(t => ({ value: t, label: DOC_LABEL[t] }))} value={docType} onChange={e => setDocType(e.target.value as DocType)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Phase</span>
            <Select className="mt-1" options={[{ value: "", label: "— none —" }, ...phases.map(p => ({ value: p.id, label: p.title }))]} value={phaseId} onChange={e => setPhaseId(e.target.value)} />
          </div>
          <div className="flex gap-2 items-end">
            <Button className="flex-1" onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
          </div>
        </Card>
      )}

      <input
        ref={inputRef} type="file" className="hidden"
        onChange={(e) => void onPickFile(e)}
      />

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-fg-secondary">No deliverables yet.{canManage ? " Add the first one above." : ""}</div>
      ) : (
        <div className="space-y-2">
          {rows.map(d => (
            <Card key={d.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-fg-primary truncate">{d.title}</span>
                    <Badge tone="neutral">{DOC_LABEL[d.docType]}</Badge>
                  </div>
                  <div className="text-[11px] text-fg-tertiary">
                    {d.dueDate ? `Due ${d.dueDate}` : "No due date"}
                    {d.ownerName && ` · ${d.ownerName}`}
                    {d.phaseId && ` · Phase ${phases.find(p => p.id === d.phaseId)?.title ?? ""}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canCycle(d) ? (
                    <button
                      type="button"
                      disabled={busy === `s-${d.id}`}
                      onClick={() => { const ns = NEXT[d.status]; void run(`s-${d.id}`, c => setDeliverableStatus(c, d.id, ns), { apply: () => setRows(prev => prev.map(x => x.id === d.id ? { ...x, status: ns } : x)), rollback: () => setRows(prev => prev.map(x => x.id === d.id ? { ...x, status: d.status } : x)) }); }}
                      title="Advance status"
                    >
                      <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                    </button>
                  ) : (
                    <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  )}
                  {canManage && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => openPicker(d.id)} disabled={uploading === d.id}>
                        {uploading === d.id ? <Spinner size={14} /> : <Icon name="upload" size={14} />}
                        <span className="ml-1 hidden sm:inline">Attach</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void run(`d-${d.id}`, c => deleteDeliverable(c, d.id), { apply: () => setRows(prev => prev.filter(x => x.id !== d.id)), rollback: () => setRows(prev => [...prev, d]) })}>
                        <Icon name="trash" size={14} className="text-error" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {fileLoading === d.id ? (
                  <div className="flex items-center gap-2 text-[11px] text-fg-tertiary"><Spinner size={12} /> Loading files…</div>
                ) : (files[d.id] ?? []).length === 0 ? (
                  <div className="text-[11px] text-fg-tertiary">No files attached.</div>
                ) : (
                  (files[d.id] ?? []).map(f => (
                    <div key={f.name} className="flex items-center justify-between gap-2 rounded bg-bg-secondary px-2 py-1 text-[12px]">
                      <span className="truncate text-fg-primary" title={f.name}>
                        <Icon name="doc" size={13} className="mr-1.5 inline text-fg-tertiary" />
                        {f.name}
                        <span className="ml-1.5 text-fg-tertiary">{formatBytes(f.size)}</span>
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => void download(d, f.name)} title="Download">
                          <Icon name="download" size={14} />
                        </Button>
                        {canApprove && (
                          <Button size="sm" variant="ghost" onClick={() => void removeFile(d, f.name)} title="Delete file">
                            <Icon name="trash" size={13} className="text-error" />
                          </Button>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
