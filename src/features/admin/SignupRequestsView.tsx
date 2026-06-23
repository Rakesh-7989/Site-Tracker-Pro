// SiteTrack Pro — superadmin signup queue (/admin/signups). Review pending
// signup requests: approve (creates org + invites the applicant) or reject.

import { useCallback, useEffect, useState } from "react";
import { useCan, useAuth } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listSignupRequests, reviewSignupRequest, markSignupPaid, createCheckoutLink, type SignupRequestRow, type SignupStatus } from "@/app/signupAdminQueries";
import { listStaff, assignSignupRequest, type StaffMember } from "@/app/staffQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const FILTERS = [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All" }];
const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom" };
const statusTone = (s: SignupStatus): "neutral" | "warning" | "success" | "danger" => (s === "approved" ? "success" : s === "rejected" ? "danger" : "warning");
const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
const PAY_TONE: Record<string, "warning" | "success" | "neutral"> = { unpaid: "warning", paid: "success", waived: "neutral" };
const PAY_LABEL: Record<string, string> = { unpaid: "Payment due", paid: "Paid", waived: "Waived" };
// 24h provisioning SLA — clock starts at payment confirmation.
function slaText(r: SignupRequestRow): { text: string; over: boolean } | null {
  if (r.status !== "pending" || r.paymentStatus === "unpaid" || !r.paidAt) return null;
  const hrs = Math.round((new Date(r.paidAt).getTime() + 24 * 3600 * 1000 - Date.now()) / 3600000);
  return hrs >= 0 ? { text: `Provision due in ${hrs}h`, over: false } : { text: `Overdue by ${-hrs}h`, over: true };
}

export function SignupRequestsView(): JSX.Element {
  const canManage = useCan("platform:orgs:manage");
  if (!canManage) return <AccessDenied message="Platform superadmin access required." />;
  return <Inner />;
}

function Inner(): JSX.Element {
  const [filter, setFilter] = useState<string>("pending");
  const [rows, setRows] = useState<SignupRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  // Staff routing (owner/head only): load the roster + assign requests to a staff.
  const { session } = useAuth();
  const isOwner = session?.user.staffTier === "owner";
  const canAssign = session?.user.staffTier === "owner" || session?.user.staffTier === "head";
  const [staff, setStaff] = useState<StaffMember[]>([]);

  useEffect(() => {
    if (!canAssign) return;
    void (async () => {
      const client = await getClient(); if (!client) return;
      const res = await listStaff(client);
      if (res.ok) setStaff(res.data);
    })();
  }, [canAssign]);

  const sendPayLink = async (r: SignupRequestRow) => {
    setBusy(r.id); setError(null); setNotice(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await createCheckoutLink(client, r.id, "annual");
    if (res.ok) setNotice(`Cashfree payment link (₹${res.data.amount}) emailed to ${r.email}. Marks paid automatically once they pay.`);
    else setError(res.error.includes("not-configured") ? "Cashfree keys not set yet — add CASHFREE_APP_ID + CASHFREE_SECRET (sandbox) first." : res.error);
    setBusy(null);
  };

  const markPaid = async (r: SignupRequestRow, status: "unpaid" | "paid" | "waived") => {
    setBusy(r.id); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await markSignupPaid(client, r.id, status);
    if (res.ok) { setNotice(status === "paid" ? `Payment confirmed for ${r.firmName} — provision within 24h.` : `Payment ${status} for ${r.firmName}.`); await reload(); }
    else setError(res.error);
    setBusy(null);
  };

  const assign = async (r: SignupRequestRow, staffId: string) => {
    setBusy(r.id); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await assignSignupRequest(client, r.id, staffId || null);
    if (res.ok) { setNotice(staffId ? `Assigned ${r.firmName} to a staff member.` : `Unassigned ${r.firmName}.`); await reload(); }
    else setError(res.error);
    setBusy(null);
  };

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listSignupRequests(client, filter === "all" ? undefined : (filter as SignupStatus));
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [filter]);
  useEffect(() => { void reload(); }, [reload]);

  const approve = async (r: SignupRequestRow) => {
    setBusy(r.id); setError(null); setNotice(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await reviewSignupRequest(client, r.id, "approve");
    if (res.ok) {
      const delivery = res.data.existingUser
        ? "Existing user added as org admin; ask them to sign in with the same email."
        : res.data.emailSent ? "Invite email sent." : "Org created; invite email may be delayed.";
      setNotice(`Approved ${r.firmName}. ${delivery}`);
    } else setError(res.error);
    await reload(); setBusy(null);
  };

  const canApprove = (r: SignupRequestRow): boolean => isOwner || r.paymentStatus === "paid";
  const approveTitle = (r: SignupRequestRow): string | undefined =>
    canApprove(r) ? undefined : "Owner must confirm payment before non-owner staff can approve.";

  const doReject = async (r: SignupRequestRow) => {
    setBusy(r.id); setError(null); setNotice(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await reviewSignupRequest(client, r.id, "reject", rejectNote.trim() || undefined);
    if (res.ok) setNotice(`Rejected ${r.firmName}.`); else setError(res.error);
    setRejecting(null); setRejectNote(""); await reload(); setBusy(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Alert variant="info">
        Self-service registration is live at <b>/register</b>. Firms can now create their own workspace
        directly. This queue is for legacy/paid-plan requests only.
      </Alert>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold text-ink-900">Signup requests</h1>
        <Select className="w-36" value={filter} onChange={e => setFilter(e.target.value)} options={FILTERS} />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div>
        : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-500"><Icon name="mail" size={24} className="mx-auto text-ink-300 mb-2" />No {filter === "all" ? "" : filter} requests.</Card>
        ) : <div className="space-y-2">{rows.map(r => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink-900">{r.firmName}</span>
                  <Badge tone="info">{PLAN_LABEL[r.plan] ?? r.plan}</Badge>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  {r.status === "pending" && <Badge tone={PAY_TONE[r.paymentStatus]}>{PAY_LABEL[r.paymentStatus]}</Badge>}
                  {(() => { const s = slaText(r); return s ? <span className={`text-[11px] font-semibold ${s.over ? "text-rose-600" : "text-amber-600"}`}>⏱ {s.text}</span> : null; })()}
                </div>
                <div className="text-sm text-ink-600 mt-0.5">{r.contactName} · {r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                {r.message && <div className="text-[12px] text-ink-500 mt-1 italic">“{r.message}”</div>}
                <div className="text-[11px] text-ink-400 mt-1">{fmtDate(r.createdAt)}{r.reviewNotes ? ` · note: ${r.reviewNotes}` : ""}</div>
              </div>
              {r.status === "pending" && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => { setRejecting(rejecting === r.id ? null : r.id); setRejectNote(""); }} disabled={busy === r.id}>Reject</Button>
                  <Button size="sm" onClick={() => void approve(r)} disabled={busy === r.id || !canApprove(r)} title={approveTitle(r)}>{busy === r.id ? <Spinner size={14} /> : "Approve"}</Button>
                </div>
              )}
            </div>
            {canAssign && (
              <div className="mt-3 flex items-center gap-2 border-t border-cream-100 pt-3 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Handled by</span>
                <Select className="w-56" value={r.assignedStaffId ?? ""} disabled={busy === r.id}
                  onChange={e => void assign(r, e.target.value)}
                  options={[{ value: "", label: "— Unassigned —" }, ...staff.map(s => ({ value: s.id, label: s.email || s.name }))]} />
              </div>
            )}
            {r.status === "pending" && (
              <div className="mt-2 flex items-center gap-2 flex-wrap text-[12px]">
                <span className="text-ink-400 font-semibold">Payment:</span>
                {r.paymentStatus === "unpaid" ? (<>
                  <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/pay/${r.id}`); setNotice(`UPI pay link copied — share it with ${r.email}.`); }}>Copy UPI link</Button>
                  <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void sendPayLink(r)}>Cashfree link</Button>
                  {isOwner ? (<>
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => void markPaid(r, "paid")}>Mark received</Button>
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void markPaid(r, "waived")}>Waive</Button>
                  </>) : <span className="text-ink-500">Owner must confirm payment.</span>}
                  {r.paymentRef && <span className="text-ink-500">claim UTR: {r.paymentRef}</span>}
                </>) : (<>
                  <span className="text-ink-700">{PAY_LABEL[r.paymentStatus]}{r.paidAt ? ` · ${fmtDate(r.paidAt)}` : ""}{r.paymentRef ? ` · ref ${r.paymentRef}` : ""}</span>
                  {isOwner && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void markPaid(r, "unpaid")}>Undo</Button>}
                </>)}
              </div>
            )}
            {rejecting === r.id && (
              <div className="mt-3 flex gap-2 items-end border-t border-cream-100 pt-3">
                <div className="flex-1"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Reason (optional)</span>
                  <Input className="mt-1" value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Why is this being rejected?" /></div>
                <Button size="sm" variant="secondary" onClick={() => void doReject(r)} disabled={busy === r.id}>Confirm reject</Button>
              </div>
            )}
          </Card>
        ))}</div>}
    </div>
  );
}
