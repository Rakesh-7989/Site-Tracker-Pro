// SiteTrack Pro — v5 Phase B1: public share-link surface (/share-link/:token).
// The ONLY anon data path: validate_share_link for the gate screen, then
// share_project_payload (which enforces password/OTP/expiry/view-limits and
// increments views server-side). Nothing reads share_links directly here.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { getClient } from "@/lib/supabase/supabase";
import { validateShareLink, fetchSharePayload, approveViaShareLink, type ShareLinkGate } from "@/app/queries/approvalQueries";

interface SharePayload {
  project: {
    id: string; name: string; type: string; status: string; location: string | null;
    start_date: string | null; description: string | null; progress: number | null;
    expected_end_date: string | null; client_name: string | null; industry_subtype: string | null;
  } | null;
  milestones: Array<{ id: string; title: string; status: string; due_date: string | null; completed_date: string | null }>;
  updates: Array<{ id: string; update_date: string | null; notes: string | null; weather: string | null; workers_count: number | null }>;
  drawings: Array<{
    id: string; title: string; type: string; revision: string; date: string | null; status: string;
    notes: string | null; approval_status: string; preview_url: string | null; download_allowed: boolean;
  }>;
}

type Stage = "loading" | "gate" | "payload" | "invalid";

const STATUS_LABEL: Record<string, string> = {
  not_requested: "Not requested", pending: "Pending review", approved: "Approved", rejected: "Rejected", locked: "Locked",
};
const STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger" | "neutral"> = {
  not_requested: "neutral", pending: "warning", approved: "success", rejected: "danger", locked: "neutral",
};
const APPROVAL_OK = ["approved", "locked"];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function ShareLinkView(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const [stage, setStage] = useState<Stage>("loading");
  const [gate, setGate] = useState<ShareLinkGate | null>(null);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [approveOpen, setApproveOpen] = useState<string | null>(null);
  const [approveSig, setApproveSig] = useState<string | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveOk, setApproveOk] = useState<string | null>(null);

  const loadPayload = useCallback(async (tok: string) => {
    setStage("loading");
    const client = await getClient();
    if (!client) { setStage("invalid"); return; }
    const res = await fetchSharePayload(client, { token: tok, password: null, otp: null });
    if (!res.ok) { setError(res.error); setStage("invalid"); return; }
    setPayload(res.data as unknown as SharePayload);
    setStage("payload");
  }, []);

  const loadGate = useCallback(async (tok: string) => {
    setStage("loading"); setError(null);
    const client = await getClient();
    if (!client) { setStage("invalid"); return; }
    const res = await validateShareLink(client, tok);
    if (!res.ok) { setError(res.error); setStage("invalid"); return; }
    if (!res.data.valid) { setStage("invalid"); return; }
    setGate(res.data);
    if (res.data.requiresPassword || res.data.requiresOtp) { setStage("gate"); return; }
    await loadPayload(tok);
  }, [loadPayload]);

  useEffect(() => { if (token) void loadGate(token); }, [token, loadGate]);

  const submitGate = async () => {
    if (!token) return;
    setBusy(true); setError(null);
    const client = await getClient();
    if (!client) { setBusy(false); return; }
    const res = await fetchSharePayload(client, { token, password: password || null, otp: otp || null });
    setBusy(false);
    if (!res.ok) { setError("Incorrect password or code, or this link is no longer valid."); return; }
    setPayload(res.data as unknown as SharePayload);
    setStage("payload");
  };

  const doApprove = async (drawingId: string, decision: "approved" | "rejected") => {
    if (!token) return;
    if (decision === "approved" && !approveSig) { setApproveError("Please sign before approving."); return; }
    setApproveBusy(true); setApproveError(null); setApproveOk(null);
    const client = await getClient();
    if (!client) { setApproveBusy(false); return; }
    const res = await approveViaShareLink(client, {
      token, password: password || null, otp: otp || null,
      drawingId, decision, signature: approveSig, approverName: approverName || null,
    });
    setApproveBusy(false);
    if (!res.ok) { setApproveError(res.error); return; }
    setApproveOk(res.data.newStatus);
    setApproveOpen(null);
    setApproveSig(null);
    const reload = await fetchSharePayload(client, { token, password: password || null, otp: otp || null });
    if (reload.ok) setPayload(reload.data as unknown as SharePayload);
  };

  const needsPassword = gate?.requiresPassword ?? false;
  const needsOtp = gate?.requiresOtp ?? false;

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white"><Icon name="home" size={18} /></span>
          <div>
            <h1 className="font-display text-lg font-bold text-fg-primary">Shared project</h1>
            <p className="text-[11px] text-fg-tertiary">Secured by SiteTrack Pro share links</p>
          </div>
        </div>

        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

        {stage === "loading" && <div className="flex justify-center py-16"><Spinner size={22} /></div>}

        {stage === "invalid" && (
          <Card padding="md" className="py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-error-tint text-error"><Icon name="lock" size={20} /></div>
            <h2 className="font-display text-base font-bold text-fg-primary">This link is not available</h2>
            <p className="mt-1 text-[12px] text-fg-secondary">It may be expired, revoked, have reached its view limit, or the address may be wrong. Contact the project team to request a new link.</p>
          </Card>
        )}

        {stage === "gate" && gate && (
          <Card padding="md">
            <h2 className="font-display text-base font-bold text-fg-primary">{gate.label || "Protected project"}</h2>
            <p className="mt-1 text-[12px] text-fg-secondary">This share link is protected. Enter the details you were given to open it.</p>
            <div className="mt-4 space-y-3">
              {needsPassword && (
                <Input fit type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete="off" />
              )}
              {needsOtp && (
                <Input fit type="text" value={otp} onChange={e => setOtp(e.target.value)} placeholder="One-time code" autoComplete="off" />
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => void loadGate(token ?? "")} disabled={busy}>Back</Button>
                <Button onClick={() => void submitGate()} disabled={busy || (needsPassword && !password) || (needsOtp && !otp)}>
                  {busy ? <Spinner size={14} /> : "Open project"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {stage === "payload" && payload && payload.project && (
          <div className="space-y-4">
            <Card padding="md">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold text-fg-primary">{payload.project.name}</h2>
                  <p className="text-[12px] text-fg-secondary">
                    {[payload.project.type, payload.project.location, payload.project.client_name].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {payload.project.description && <p className="mt-2 text-[12px] text-fg-secondary">{payload.project.description}</p>}
                </div>
                <div className="text-right">
                  <Badge tone={payload.project.status === "active" ? "success" : "neutral"}>{payload.project.status}</Badge>
                  {payload.project.progress != null && (
                    <p className="mt-2 text-[13px] font-semibold text-fg-primary">{Math.round(payload.project.progress)}% complete</p>
                  )}
                </div>
              </div>
            </Card>

            <Card title={<h3 className="font-display text-sm font-bold text-fg-primary">Milestones</h3>} padding="md">
              {payload.milestones.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-fg-tertiary">No milestones.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {payload.milestones.map(m => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <p className="text-[13px] font-semibold text-fg-primary">{m.title}</p>
                        <p className="text-[11px] text-fg-tertiary">Due {fmtDate(m.due_date)}</p>
                      </div>
                      <Badge tone={m.status === "completed" ? "success" : "warning"}>{m.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {approveOk && <Alert variant="success" className="mb-2">Drawing {approveOk} successfully.</Alert>}
            {approveError && <Alert variant="danger" className="mb-2">{approveError}</Alert>}
            {payload.drawings.length > 0 && (
              <Card title={<h3 className="font-display text-sm font-bold text-fg-primary">Drawings — tap to review</h3>} padding="md">
                <div className="space-y-3">
                  {payload.drawings.some(d => d.approval_status === "pending" || d.approval_status === "not_requested" || d.approval_status === "rejected") && (
                    <div className="rounded-lg border border-warning bg-warning-tint p-3">
                      <p className="text-xs font-semibold text-warning">Client review</p>
                      <p className="text-[11px] text-fg-secondary mt-1">Approve or request changes — your signature will be captured for the record.</p>
                      <Input fit value={approverName} onChange={e => setApproverName(e.target.value)} placeholder="Your name (for the approval record)" className="mt-2" />
                    </div>
                  )}
                  {payload.drawings.map(d => {
                    const canAct = d.approval_status === "pending" || d.approval_status === "not_requested" || d.approval_status === "rejected";
                    return (
                      <div key={d.id} className="rounded-lg border border-border bg-bg-secondary p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-fg-primary">{d.title} · {d.revision}</p>
                            <p className="text-[11px] text-fg-tertiary">{d.type} · {fmtDate(d.date)}</p>
                          </div>
                          <Badge tone={STATUS_TONE[d.approval_status] ?? "neutral"}>{STATUS_LABEL[d.approval_status] ?? d.approval_status}</Badge>
                        </div>
                        {canAct && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => { setApproveOpen(d.id); setApproveError(null); setApproveSig(null); }} leftIcon={<Icon name="check" size={14} />}>Approve</Button>
                            <Button size="sm" variant="secondary" onClick={() => void doApprove(d.id, "rejected")} disabled={approveBusy}>Reject</Button>
                          </div>
                        )}
                        {APPROVAL_OK.includes(d.approval_status) && d.preview_url && d.download_allowed && (
                          <a href={d.preview_url} target="_blank" rel="noreferrer">
                            <img src={d.preview_url} alt={d.title} className="mt-2 w-full rounded border border-border" loading="lazy" />
                          </a>
                        )}
                        {APPROVAL_OK.includes(d.approval_status) && !d.download_allowed && (
                          <p className="mt-2 text-[11px] text-fg-tertiary">Download is disabled on this link — preview only.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
            <Modal open={!!approveOpen} onClose={() => { setApproveOpen(null); setApproveSig(null); setApproveError(null); }} title="Approve drawing" size="lg">
              <div className="space-y-3">
                <p className="text-xs text-fg-secondary">Draw your signature below or type your name. This will be stored with the approval.</p>
                <SignaturePad value={approveSig ?? ""} onChange={setApproveSig} />
                {approveError && <Alert variant="danger">{approveError}</Alert>}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => { setApproveOpen(null); setApproveError(null); }}>Cancel</Button>
                  <Button onClick={() => { const id = approveOpen; if (id) void doApprove(id, "approved"); }} disabled={approveBusy || !approveSig} loading={approveBusy}>Confirm approval</Button>
                </div>
              </div>
            </Modal>

            {payload.updates.length > 0 && (
              <Card title={<h3 className="font-display text-sm font-bold text-fg-primary">Latest updates</h3>} padding="md">
                <ul className="divide-y divide-border">
                  {payload.updates.map(u => (
                    <li key={u.id} className="py-2">
                      <p className="text-[11px] text-fg-tertiary">{fmtDate(u.update_date)}{u.workers_count != null ? ` · ${u.workers_count} workers` : ""}</p>
                      {u.notes && <p className="text-[12px] text-fg-primary">{u.notes}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
