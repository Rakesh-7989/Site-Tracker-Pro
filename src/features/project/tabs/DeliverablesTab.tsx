// SiteTrack Pro — consultancy deliverables tab (v4 C1 + C3.2 file uploads).
// Register the deliverables a consultancy/design project owes its client.
// create/edit → deliverable:manage; approve/reject/issue → deliverable:approve.
// File attach/download → project member (storage RLS); file delete → managers.
// Doc types + status follow the deliverables CHECK constraints (139).

import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { useStorageUploadGate, StorageQuotaWarning } from "@/features/shared/StorageUploadGate";
import { listFeePhases, type FeePhase } from "@/app/queries/phaseQueries";
import { listProjectMembers, type ProjectMemberRow } from "@/app/queries/queries";
import {
  listDeliverables, createDeliverable, setDeliverableStatus, updateDeliverable, deleteDeliverable,
  DOC_TYPES, type Deliverable, type DeliverableStatus, type DocType,
} from "@/app/queries/deliverableQueries";
import {
  listDeliverableFiles, uploadDeliverableFile, deleteDeliverableFiles, deliverableFileUrl,
  deliverableObjectPath, formatBytes, validateDeliverableFile, DELIVERABLE_ACCEPT,
  type DeliverableFileRef,
} from "@/app/queries/deliverableStorageQueries";
import { logDownloadEvent } from "@/app/queries/downloadAuditQueries";
import { CadPreviewModal } from "@/features/shared/CadPreviewModal";
import { DxfThumbnail } from "@/features/shared/DxfThumbnail";
import { isCadFileName, isDxfFileName } from "@/lib/dxfPreview";

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

export function DeliverablesTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("deliverable:manage", { orgId: activeOrg?.orgId, projectId });
  const canApprove = useCan("deliverable:approve", { orgId: activeOrg?.orgId, projectId });
  const uploadGate = useStorageUploadGate(activeOrg?.orgId);

  const [rows, setRows] = useState<Deliverable[]>([]);
  const [phases, setPhases] = useState<FeePhase[]>([]);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
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
  const [ownerId, setOwnerId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edTitle, setEdTitle] = useState("");
  const [edDocType, setEdDocType] = useState<DocType>("other");
  const [edPhaseId, setEdPhaseId] = useState("");
  const [edDue, setEdDue] = useState("");
  const [edOwnerId, setEdOwnerId] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [targetDeliverable, setTargetDeliverable] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ id: string; name: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [d, p, m] = await Promise.all([listDeliverables(client, projectId), listFeePhases(client, projectId), listProjectMembers(client, projectId)]);
    if (d.ok) setRows(d.data); else setError(d.error);
    if (p.ok) setPhases(p.data);
    if (m.ok) setMembers(m.data);
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
    await run("add", c => createDeliverable(c, { projectId, title: title.trim(), docType, phaseId: phaseId || null, dueDate: due || null, ownerId: ownerId || null }), {
      apply: () => setRows(prev => [{ id: tmpId, phaseId: phaseId || null, title: title.trim(), docType, status: "draft" as DeliverableStatus, dueDate: due || null, ownerId: ownerId || null, ownerName: members.find(m => m.profileId === ownerId)?.name ?? null, createdAt: "" }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setTitle(""); setPhaseId(""); setDue(""); setOwnerId("");
  };

  const startEdit = (d: Deliverable) => {
    setEditingId(d.id); setEdTitle(d.title); setEdDocType(d.docType);
    setEdPhaseId(d.phaseId ?? ""); setEdDue(d.dueDate ?? ""); setEdOwnerId(d.ownerId ?? "");
  };

  const saveEdit = async (d: Deliverable) => {
    await run(`u-${d.id}`, c => updateDeliverable(c, d.id, {
      title: edTitle.trim() || d.title, docType: edDocType, phaseId: edPhaseId || null,
      dueDate: edDue || null, ownerId: edOwnerId || null,
    }), {
      apply: () => setRows(prev => prev.map(x => x.id === d.id ? { ...x, title: edTitle.trim() || d.title, docType: edDocType, phaseId: edPhaseId || null, dueDate: edDue || null, ownerId: edOwnerId || null, ownerName: members.find(m => m.profileId === edOwnerId)?.name ?? null } : x)),
      rollback: () => setRows(prev => prev.map(x => x.id === d.id ? d : x)),
    });
    setEditingId(null);
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
    // Instant client check (SEC-P1-6) — uploadDeliverableFile re-validates too.
    const rejected = validateDeliverableFile(file.name, file.size);
    if (rejected) { setFileError(rejected); return; }
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

  const setStatus = (d: Deliverable, ns: DeliverableStatus) => {
    void run(`s-${d.id}`, c => setDeliverableStatus(c, d.id, ns), {
      apply: () => setRows(prev => prev.map(x => x.id === d.id ? { ...x, status: ns } : x)),
      rollback: () => setRows(prev => prev.map(x => x.id === d.id ? { ...x, status: d.status } : x)),
    });
  };

  // Submit draft → in_review rides deliverable:manage (creator). Approve /
  // Reject / Issue gates on the reviewer capability deliverable:approve.
  const canSubmit = (d: Deliverable) => canManage && d.status === "draft";
  const canReview = (d: Deliverable) => canApprove && d.status === "in_review";
  const canIssue = (d: Deliverable) => canApprove && d.status === "approved";
  const canReopen = (d: Deliverable) => canApprove && d.status === "rejected";

  return (
    <div className="space-y-4">
      <StorageQuotaWarning quota={uploadGate.quota} />
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
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Owner</span>
            <Select className="mt-1" options={[{ value: "", label: "— unassigned —" }, ...members.map(m => ({ value: m.profileId, label: m.name }))]} value={ownerId} onChange={e => setOwnerId(e.target.value)} />
          </div>
          <div className="flex gap-2 items-end">
            <Button className="flex-1" onClick={() => void add()} disabled={busy === "add" || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
          </div>
        </Card>
      )}

      <input
        ref={inputRef} type="file" className="hidden" accept={DELIVERABLE_ACCEPT}
        onChange={(e) => void onPickFile(e)}
      />

      {loading ? (
        <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
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
                  <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  {canSubmit(d) && (
                    <Button size="sm" variant="secondary" disabled={busy === `s-${d.id}`} onClick={() => setStatus(d, "in_review")}>Submit for review</Button>
                  )}
                  {canReview(d) && (
                    <>
                      <Button size="sm" disabled={busy === `s-${d.id}`} onClick={() => setStatus(d, "approved")}>Approve</Button>
                      <Button size="sm" variant="danger" disabled={busy === `s-${d.id}`} onClick={() => setStatus(d, "rejected")}>Reject</Button>
                    </>
                  )}
                  {canIssue(d) && (
                    <Button size="sm" variant="secondary" disabled={busy === `s-${d.id}`} onClick={() => setStatus(d, "issued")}>Issue</Button>
                  )}
                  {canReopen(d) && (
                    <Button size="sm" variant="ghost" disabled={busy === `s-${d.id}`} onClick={() => setStatus(d, "in_review")}>Reopen for review</Button>
                  )}
                  {canManage && (
                    <>
                      {editingId === d.id ? (
                        <Button size="sm" variant="secondary" disabled={busy === `u-${d.id}`} onClick={() => void saveEdit(d)}>Save</Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(d)} disabled={busy === `u-${d.id}`}>Edit</Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => openPicker(d.id)} disabled={uploading === d.id || !uploadGate.canUpload}>
                        {uploading === d.id ? <Spinner size={14} /> : <Icon name="upload" size={14} />}
                        <span className="ml-1 hidden sm:inline">Attach</span>
                      </Button>
                      {editingId !== d.id && (
                        <Button size="sm" variant="ghost" onClick={() => void run(`d-${d.id}`, c => deleteDeliverable(c, d.id), { apply: () => setRows(prev => prev.filter(x => x.id !== d.id)), rollback: () => setRows(prev => [...prev, d]) })}>
                          <Icon name="trash" size={14} className="text-error" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {editingId === d.id && canManage && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
                  <Input value={edTitle} onChange={x => setEdTitle(x.target.value)} placeholder="Title" />
                  <Select options={DOC_TYPES.map(t => ({ value: t, label: DOC_LABEL[t] }))} value={edDocType} onChange={x => setEdDocType(x.target.value as DocType)} />
                  <Select options={[{ value: "", label: "— none —" }, ...phases.map(p => ({ value: p.id, label: p.title }))]} value={edPhaseId} onChange={x => setEdPhaseId(x.target.value)} />
                  <Input type="date" value={edDue} onChange={x => setEdDue(x.target.value)} />
                  <Select options={[{ value: "", label: "— unassigned —" }, ...members.map(m => ({ value: m.profileId, label: m.name }))]} value={edOwnerId} onChange={x => setEdOwnerId(x.target.value)} />
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              )}

              <div className="mt-2 space-y-1">
                {fileLoading === d.id ? (
                  <div className="flex items-center gap-2 text-[11px] text-fg-tertiary"><Spinner size={12} /> Loading files…</div>
                ) : (files[d.id] ?? []).length === 0 ? (
                  <div className="text-[11px] text-fg-tertiary">No files attached.</div>
                ) : (
                  (files[d.id] ?? []).map(f => (
                    <div key={f.name} className="flex items-center justify-between gap-2 rounded bg-bg-secondary px-2 py-1 text-[12px]">
                      <span className="flex min-w-0 items-center gap-1.5" title={f.name}>
                        {isDxfFileName(f.name) ? (
                          <DxfThumbnail
                            fileName={f.name}
                            size={20}
                            cacheKey={deliverableObjectPath(projectId, d.id, f.name)}
                            getUrl={async () => {
                              const client = await getClient();
                              if (!client) return { ok: false as const, error: "Backend not configured." };
                              return deliverableFileUrl(client, deliverableObjectPath(projectId, d.id, f.name), 300);
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
                          <Button size="sm" variant="ghost" onClick={() => setPreviewTarget({ id: d.id, name: f.name })} title="Preview">
                            <Icon name="eye" size={14} />
                          </Button>
                        )}
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

      <CadPreviewModal
        open={previewTarget !== null}
        onClose={() => setPreviewTarget(null)}
        fileName={previewTarget?.name ?? null}
        label="deliverable"
        getUrl={async () => {
          const client = await getClient();
          if (!client) return { ok: false, error: "Backend not configured." };
          if (!previewTarget) return { ok: false, error: "No file selected." };
          return deliverableFileUrl(client, deliverableObjectPath(projectId, previewTarget.id, previewTarget.name), 120);
        }}
      />
    </div>
  );
}
