// SiteTrack Pro — v5 Phase B1: Client Approval & Revision System tab.
// Revision register + approval state (request/approve/reject/lock), Figma-style
// x/y comment pins on a preview overlay with status-ladder threads, and the
// guarded share-link manager. All writes go through approvalQueries (DB-side
// RPCs keep password/OTP secrets off the client).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, StatCard } from "@/components/ui/atoms";
import { Input, Textarea } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
import {
  listApprovalDrawings, requestApproval, approveDrawing, rejectDrawing, lockDrawing,
  createRevision, sortRevisions, nextRevision,
  listDrawingComments, addDrawingComment, setCommentStatus, deleteDrawingComment,
  commentThreads, commentReplies, openCommentCount, APPROVAL_TONE, COMMENT_TONE,
  listShareLinks, createShareLink, setShareLinkRevoked, shareUrl,
  approvalAnalytics, type ApprovalDrawing, type CommentStatus, type DrawingComment, type ShareLink,
} from "@/app/approvalQueries";

const APPROVAL_LABEL: Record<string, string> = {
  not_requested: "Not requested",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  locked: "Locked",
};
const COMMENT_NEXT: Partial<Record<CommentStatus, CommentStatus>> = {
  open: "in_progress",
  in_progress: "resolved",
};
const COMMENT_LABEL: Record<CommentStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

type CommentMapEntry = DrawingComment;
type ShareLinkRow = ShareLink;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function DrawingReviewTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const capCtx = { orgId: activeOrg?.orgId, projectId };
  const canComment = useCan("drawing:comment", capCtx);
  const canApprove = useCan("drawing:approve", capCtx);
  const canManageLinks = useCan("share:link:manage", capCtx);
  const canUpload = useCan("drawings:upload", capCtx);

  const [rows, setRows] = useState<ApprovalDrawing[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<ApprovalDrawing | null>(null);
  const [revisionParent, setRevisionParent] = useState<ApprovalDrawing | null>(null);
  const [linkModal, setLinkModal] = useState(false);
  const [pinTarget, setPinTarget] = useState<{ x: number; y: number } | null>(null);
  const [pinBody, setPinBody] = useState("");
  const [replyFor, setReplyFor] = useState<{ parentId: string; body: string } | null>(null);

  const [commentsBy, setCommentsBy] = useState<Record<string, CommentMapEntry[]>>({});

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listApprovalDrawings(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    if (canManageLinks) {
      const lr = await listShareLinks(client, projectId);
      if (lr.ok) setShareLinks(lr.data);
    }
    setLoading(false);
  }, [projectId, canManageLinks]);
  useEffect(() => { void reload(); }, [reload]);

  const loadComments = useCallback(async (drawingId: string) => {
    const client = await getClient();
    if (!client) return;
    const res = await listDrawingComments(client, drawingId);
    if (res.ok) setCommentsBy(prev => ({ ...prev, [drawingId]: res.data }));
  }, []);
  useEffect(() => {
    if (selectedId) void loadComments(selectedId);
  }, [selectedId, loadComments]);

  const { busy, run } = useAction(reload, setError);

  const sel = rows.find(r => r.id === selectedId) ?? null;
  const selComments = selectedId ? (commentsBy[selectedId] ?? []) : [];
  const threads = commentThreads(selComments);
  const analytics = approvalAnalytics(rows);
  const sorted = useMemo(() => sortRevisions(rows), [rows]);

  const submitApproval = useCallback(async (d: ApprovalDrawing, signature: string | null) => {
    const client = await getClient();
    if (!client || !session?.user.id) return;
    setError(null);
    const res = await approveDrawing(client, { drawingId: d.id, approvedBy: session.user.id, signature });
    if (!res.ok) { setError(res.error); return; }
    setApproveTarget(null);
    await reload();
  }, [session, reload]);

  const submitRevision = useCallback(async () => {
    const client = await getClient();
    if (!client || !revisionParent || !session?.user.id) return;
    setError(null);
    const res = await createRevision(client, {
      projectId,
      parentId: revisionParent.id,
      title: revisionParent.title,
      type: revisionParent.type,
      revision: nextRevision(revisionParent.revision),
      releasedBy: session.user.id,
      changeNote: revisionParent.changeNote,
    });
    if (!res.ok) { setError(res.error); return; }
    setRevisionParent(null);
    await reload();
  }, [projectId, revisionParent, session, reload]);

  const submitPin = useCallback(async () => {
    const client = await getClient();
    if (!client || !selectedId || !session?.user.id || !pinTarget || !pinBody.trim()) return;
    setError(null);
    const res = await addDrawingComment(client, {
      drawingId: selectedId, authorId: session.user.id, body: pinBody.trim(),
      x: pinTarget.x, y: pinTarget.y,
    });
    if (!res.ok) { setError(res.error); return; }
    setPinTarget(null); setPinBody("");
    await loadComments(selectedId);
  }, [session, selectedId, pinTarget, pinBody, loadComments]);

  const submitReply = useCallback(async (parentId: string) => {
    const client = await getClient();
    if (!client || !selectedId || !session?.user.id || !replyFor?.body.trim()) return;
    setError(null);
    const res = await addDrawingComment(client, {
      drawingId: selectedId, authorId: session.user.id, body: replyFor.body.trim(), parentId,
    });
    if (!res.ok) { setError(res.error); return; }
    setReplyFor(null);
    await loadComments(selectedId);
  }, [session, selectedId, replyFor, loadComments]);

  const advanceComment = useCallback(async (id: string, status: CommentStatus) => {
    const client = await getClient();
    if (!client) return;
    setError(null);
    const next = COMMENT_NEXT[status] ?? "closed";
    const res = await setCommentStatus(client, id, next);
    if (!res.ok) { setError(res.error); return; }
    if (selectedId) await loadComments(selectedId);
  }, [selectedId, loadComments]);

  const removeComment = useCallback(async (id: string) => {
    const client = await getClient();
    if (!client) return;
    setError(null);
    const res = await deleteDrawingComment(client, id);
    if (!res.ok) { setError(res.error); return; }
    if (selectedId) await loadComments(selectedId);
  }, [selectedId, loadComments]);

  const submitLink = useCallback(async (input: { label?: string | null; allowDownload?: boolean; expiresAt?: string | null; maxViews?: number | null; password?: string | null; needOtp?: boolean }) => {
    const client = await getClient();
    if (!client) return;
    setError(null);
    const res = await createShareLink(client, { projectId, ...input });
    if (!res.ok) { setError(res.error); return; }
    setLinkModal(false);
    await reload();
  }, [projectId, reload]);

  const columns: Column<ApprovalDrawing>[] = [
    {
      key: "title", header: "Drawing",
      render: d => (
        <button type="button" onClick={() => setSelectedId(d.id)} className="text-left hover:text-accent">
          <span className="block text-[13px] font-semibold text-fg-primary">{d.title}</span>
          <span className="block text-[11px] text-fg-tertiary">{d.type}</span>
        </button>
      ),
    },
    { key: "revision", header: "Rev", render: d => <Badge tone="neutral">{d.revision}</Badge> },
    {
      key: "status", header: "Status",
      render: d => <Badge tone={APPROVAL_TONE[d.approvalStatus]}>{APPROVAL_LABEL[d.approvalStatus]}</Badge>,
    },
    {
      key: "note", header: "Change note", hideOnMobile: true,
      render: d => <span className="text-[12px] text-fg-secondary">{d.changeNote || "—"}</span>,
    },
    {
      key: "approver", header: "Approved", hideOnMobile: true,
      render: d => (
        <span className="text-[12px] text-fg-secondary">
          {d.approvalStatus === "approved" || d.approvalStatus === "locked"
            ? `${d.approvedByName ?? "—"} · ${fmtDate(d.approvedAt)}`
            : "—"}
        </span>
      ),
    },
    {
      key: "actions", header: "Actions", className: "text-right",
      render: d => {
        const isLocked = d.approvalStatus === "locked";
        return (
          <span className="inline-flex items-center gap-1.5 justify-end">
            {canUpload && !isLocked && (
              <Button size="sm" variant="ghost" leftIcon={<Icon name="plus" size={14} />} onClick={() => setRevisionParent(d)} title="New revision" disabled={busy !== null}>Rev</Button>
            )}
            {canApprove && d.approvalStatus === "not_requested" && (
              <Button size="sm" disabled={busy !== null} onClick={() => void run(`req-${d.id}`, async c => requestApproval(c, d.id))}>Request review</Button>
            )}
            {canApprove && d.approvalStatus === "pending" && (
              <>
                <Button size="sm" onClick={() => setApproveTarget(d)} disabled={busy !== null}>Approve</Button>
                <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => void run(`rej-${d.id}`, async c => rejectDrawing(c, d.id))}>Reject</Button>
              </>
            )}
            {canApprove && d.approvalStatus === "rejected" && (
              <Button size="sm" disabled={busy !== null} onClick={() => void run(`req-${d.id}`, async c => requestApproval(c, d.id))}>Request review</Button>
            )}
            {canApprove && d.approvalStatus === "approved" && (
              <Button size="sm" variant="dark" leftIcon={<Icon name="lock" size={14} />} disabled={busy !== null} onClick={() => void run(`lock-${d.id}`, async c => lockDrawing(c, d.id))}>Lock</Button>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon="image" label="Revisions" value={analytics.totalRevisions} accent="orange" />
        <StatCard icon="refresh" label="Pending" value={analytics.pending} accent="blue" />
        <StatCard icon="check" label="Approved" value={analytics.approved} accent="emerald" />
        <StatCard icon="x" label="Rejected" value={analytics.rejected} accent="red" />
        <StatCard icon="lock" label="Locked" value={analytics.locked} accent="violet" />
        <StatCard icon="trend" label="Approval rate" value={Math.round(analytics.approvalRate * 100) + "%"} sub={`avg ${analytics.avgApprovalDays.toFixed(1)}d · depth ${analytics.maxRevisionDepth}`} accent="emerald" />
      </div>

      <Card title={<div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-fg-primary">Revision register</h3>
        <span className="text-[11px] text-fg-tertiary">{analytics.totalRevisions} drawings</span>
      </div>}>
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey="id"
          dense
          loading={loading}
          error={error}
          emptyMessage="No drawings yet — upload a drawing to start the review loop."
          emptyIcon="image"
        />
      </Card>

      {sel && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={<div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-fg-primary">{sel.title} · {sel.revision}</h3>
            <Badge tone={APPROVAL_TONE[sel.approvalStatus]}>{APPROVAL_LABEL[sel.approvalStatus]}</Badge>
          </div>}>
            {sel.previewUrl ? (
              <div className="relative w-full overflow-hidden rounded-lg border border-border bg-bg-secondary">
                <img src={sel.previewUrl} alt={sel.title} className="block w-full" />
                {threads.filter(t => t.x != null && t.y != null).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.body}
                    onClick={() => { const el = document.getElementById(`thread-${t.id}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                    className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-accent text-[10px] font-bold text-white shadow"
                    style={{ left: `${(t.x ?? 0) * 100}%`, top: `${(t.y ?? 0) * 100}%` }}
                  >{t.body.length > 0 ? "!" : "+"}</button>
                ))}
                {canComment && (
                  <button
                    type="button"
                    onClick={e => {
                      const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
                      setPinTarget({ x, y });
                    }}
                    className="absolute bottom-2 right-2 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-cream shadow"
                  >+ Add pin</button>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-bg-secondary p-8 text-center text-[12px] text-fg-tertiary">
                No preview available. Pins below are listed by position.
              </div>
            )}
            <p className="mt-2 text-[11px] text-fg-tertiary">{openCommentCount(selComments)} open thread{openCommentCount(selComments) === 1 ? "" : "s"}</p>
          </Card>

          <Card title={<h3 className="font-display text-sm font-bold text-fg-primary">Comments</h3>}>
            {selComments.length === 0 && (
              <div className="py-6 text-center text-[12px] text-fg-tertiary">No comments yet. {canComment ? "Click the drawing to drop a pin." : "Ask a team member to start the review."}</div>
            )}
            <div className="space-y-3">
              {threads.map(t => (
                <div key={t.id} id={`thread-${t.id}`} className="rounded-lg border border-border bg-bg-secondary p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={COMMENT_TONE[t.status]}>{COMMENT_LABEL[t.status]}</Badge>
                      <span className="text-[11px] font-semibold text-fg-primary">{t.authorName ?? "Member"}</span>
                      {t.x != null && t.y != null && <span className="text-[10px] text-fg-tertiary">pin {Math.round((t.x ?? 0) * 100)}%, {Math.round((t.y ?? 0) * 100)}%</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {canApprove && COMMENT_NEXT[t.status] && (
                        <Button size="sm" variant="ghost" onClick={() => void advanceComment(t.id, t.status)}>{COMMENT_LABEL[COMMENT_NEXT[t.status] ?? "closed"]}</Button>
                      )}
                      {canApprove && t.status !== "closed" && (
                        <Button size="sm" variant="ghost" onClick={() => void advanceComment(t.id, "closed")} title="Close thread">Close</Button>
                      )}
                      {canApprove && (
                        <Button size="sm" variant="ghost" leftIcon={<Icon name="trash" size={13} />} onClick={() => void removeComment(t.id)} aria-label="Delete thread">Del</Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-[12px] text-fg-primary">{t.body}</p>
                  <div className="mt-2 space-y-1.5">
                    {commentReplies(selComments, t.id).map(r => (
                      <div key={r.id} className="rounded bg-bg-primary p-2">
                        <span className="text-[10px] font-semibold text-fg-secondary">{r.authorName ?? "Member"}</span>
                        <p className="text-[12px] text-fg-primary">{r.body}</p>
                      </div>
                    ))}
                  </div>
                  {canComment && (
                    <div className="mt-2">
                      {replyFor?.parentId === t.id ? (
                        <div className="flex gap-2">
                          <Input fit value={replyFor.body} onChange={e => setReplyFor({ parentId: t.id, body: e.target.value })} placeholder="Write a reply…" />
                          <Button size="sm" disabled={!replyFor.body.trim()} onClick={() => void submitReply(t.id)}>Reply</Button>
                          <Button size="sm" variant="ghost" onClick={() => setReplyFor(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setReplyFor({ parentId: t.id, body: "" })}>Reply</Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {canManageLinks && (
        <Card title={<div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-fg-primary">Share links</h3>
          <Button size="sm" leftIcon={<Icon name="plus" size={14} />} onClick={() => setLinkModal(true)}>New link</Button>
        </div>}>
          {shareLinks.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-fg-tertiary">No share links yet — create one to invite a client or consultant.</div>
          ) : (
            <div className="space-y-2">
              {shareLinks.map(l => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-fg-primary">{l.label || "Untitled link"}</span>
                      {l.revokedAt && <Badge tone="danger">Revoked</Badge>}
                      {l.expiresAt && new Date(l.expiresAt).getTime() < Date.now() && <Badge tone="warning">Expired</Badge>}
                    </div>
                    <p className="truncate text-[11px] text-fg-tertiary">{shareUrl(l.token)}</p>
                    <p className="text-[11px] text-fg-tertiary">{l.views}{l.maxViews != null ? ` / ${l.maxViews}` : ""} views · {l.allowDownload ? "download on" : "download off"}{l.expiresAt ? ` · expires ${fmtDate(l.expiresAt)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" leftIcon={<Icon name="eye" size={14} />} onClick={() => { void navigator.clipboard.writeText(shareUrl(l.token)); }}>Copy</Button>
                    <Button size="sm" variant={l.revokedAt ? "secondary" : "danger"} disabled={busy !== null} onClick={() => void run(`revoke-${l.id}`, async c => setShareLinkRevoked(c, l.id, !l.revokedAt))}>{l.revokedAt ? "Restore" : "Revoke"}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <ApprovalModal
        drawing={approveTarget}
        busy={busy !== null}
        onClose={() => setApproveTarget(null)}
        onConfirm={(sig) => { if (approveTarget) void submitApproval(approveTarget, sig); }}
      />
      <RevisionModal drawing={revisionParent} busy={busy !== null} onClose={() => setRevisionParent(null)} onConfirm={() => void submitRevision()} />
      <PinModal
        open={pinTarget != null}
        busy={busy !== null}
        body={pinBody}
        setBody={setPinBody}
        onClose={() => { setPinTarget(null); setPinBody(""); }}
        onConfirm={() => void submitPin()}
      />
      <LinkModal open={linkModal} busy={busy !== null} onClose={() => setLinkModal(false)} onCreate={submitLink} />
    </div>
  );
}

function ApprovalModal({ drawing, busy, onClose, onConfirm }: { drawing: ApprovalDrawing | null; busy: boolean; onClose: () => void; onConfirm: (sig: string | null) => void }): JSX.Element {
  const [signature, setSignature] = useState("");
  const [type, setType] = useState<"sign" | "approve">("approve");
  return (
    <Modal open={drawing != null} onClose={onClose} title={`Approve ${drawing?.revision ?? ""}`}>
      {drawing && (
        <div className="space-y-3">
          <p className="text-[12px] text-fg-secondary">Approving <span className="font-semibold text-fg-primary">{drawing.title}</span> captures your signature on the approved revision.</p>
          <div className="flex gap-2">
            <Button size="sm" variant={type === "sign" ? "primary" : "secondary"} onClick={() => setType("sign")}>Draw signature</Button>
            <Button size="sm" variant={type === "approve" ? "primary" : "secondary"} onClick={() => setType("approve")}>No signature</Button>
          </div>
          {type === "sign" && <SignaturePad value={signature} onChange={setSignature} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={() => onConfirm(type === "sign" ? (signature || null) : null)} disabled={busy || (type === "sign" && !signature.trim())}>
              {busy ? <Spinner size={14} /> : "Approve"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RevisionModal({ drawing, busy, onClose, onConfirm }: { drawing: ApprovalDrawing | null; busy: boolean; onClose: () => void; onConfirm: () => void }): JSX.Element {
  const next = drawing ? nextRevision(drawing.revision) : "Rev A";
  return (
    <Modal open={drawing != null} onClose={onClose} title="New revision">
      {drawing && (
        <div className="space-y-3">
          <p className="text-[12px] text-fg-secondary">
            Spawn <span className="font-semibold text-fg-primary">{next}</span> of{" "}
            <span className="font-semibold text-fg-primary">{drawing.title}</span> chained to the current revision.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={onConfirm} disabled={busy}>{busy ? <Spinner size={14} /> : "Create revision"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PinModal({ open, busy, body, setBody, onClose, onConfirm }: { open: boolean; busy: boolean; body: string; setBody: (v: string) => void; onClose: () => void; onConfirm: () => void }): JSX.Element {
  return (
    <Modal open={open} onClose={onClose} title="Add comment pin">
      <div className="space-y-3">
        <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="What needs attention here?" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy || !body.trim()}>{busy ? <Spinner size={14} /> : "Place pin"}</Button>
        </div>
      </div>
    </Modal>
  );
}

interface LinkDraft {
  label: string;
  allowDownload: boolean;
  expiresAt: string;
  maxViews: string;
  password: string;
  needOtp: boolean;
}
const EMPTY_LINK: LinkDraft = { label: "", allowDownload: true, expiresAt: "", maxViews: "", password: "", needOtp: false };

function LinkModal({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (input: { label?: string | null; allowDownload?: boolean; expiresAt?: string | null; maxViews?: number | null; password?: string | null; needOtp?: boolean }) => void }): JSX.Element {
  const [draft, setDraft] = useState<LinkDraft>(EMPTY_LINK);
  useEffect(() => { if (!open) setDraft(EMPTY_LINK); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="New share link">
      <div className="space-y-3">
        <Input fit value={draft.label} onChange={e => setDraft(p => ({ ...p, label: e.target.value }))} placeholder="Label (e.g. Client — Rev C review)" />
        <div className="flex items-center gap-2 text-[12px] text-fg-secondary">
          <input type="checkbox" id="lnk-dl" checked={draft.allowDownload} onChange={e => setDraft(p => ({ ...p, allowDownload: e.target.checked }))} className="accent-[var(--st-accent)]" />
          <label htmlFor="lnk-dl">Allow downloads</label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input fit type="date" value={draft.expiresAt} onChange={e => setDraft(p => ({ ...p, expiresAt: e.target.value }))} aria-label="Expires" />
          <Input fit type="number" min={1} value={draft.maxViews} onChange={e => setDraft(p => ({ ...p, maxViews: e.target.value }))} placeholder="Max views" aria-label="Max views" />
        </div>
        <Input fit value={draft.password} onChange={e => setDraft(p => ({ ...p, password: e.target.value }))} placeholder="Password (optional)" />
        <div className="flex items-center gap-2 text-[12px] text-fg-secondary">
          <input type="checkbox" id="lnk-otp" checked={draft.needOtp} onChange={e => setDraft(p => ({ ...p, needOtp: e.target.checked }))} className="accent-[var(--st-accent)]" />
          <label htmlFor="lnk-otp">Email one-time code on first open</label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onCreate({
            label: draft.label || null,
            allowDownload: draft.allowDownload,
            expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
            maxViews: draft.maxViews ? Number(draft.maxViews) : null,
            password: draft.password || null,
            needOtp: draft.needOtp,
          })} disabled={busy}>{busy ? <Spinner size={14} /> : "Create link"}</Button>
        </div>
      </div>
    </Modal>
  );
}
