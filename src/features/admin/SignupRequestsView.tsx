import { useCallback, useEffect, useState } from "react";
import { useCan, useAuth } from "@/auth";
import { Card, Button, Badge, Alert, AccessDenied, Icon, Spinner, StatCard } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildCsv, downloadCsv, csvDateStamp, type CsvColumn } from "@/lib/genericCsv";
import { listSignupRequests, reviewSignupRequest, markSignupPaid, createCheckoutLink, type SignupRequestRow, type SignupStatus } from "@/app/signupAdminQueries";
import { listStaff, assignSignupRequest, type StaffMember } from "@/app/staffQueries";

import { getClient } from "@/lib/supabase";
const FILTERS = [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All" }];
const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom" };
export const statusTone = (s: SignupStatus): "neutral" | "warning" | "success" | "danger" => (s === "approved" ? "success" : s === "rejected" ? "danger" : "warning");
export const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
export const PAY_TONE: Record<string, "warning" | "success" | "neutral"> = { unpaid: "warning", paid: "success", waived: "neutral" };
export const PAY_LABEL: Record<string, string> = { unpaid: "Payment due", paid: "Paid", waived: "Waived" };
export function slaText(r: SignupRequestRow): { text: string; over: boolean } | null {
  if (r.status !== "pending" || r.paymentStatus === "unpaid" || !r.paidAt) return null;
  const hrs = Math.round((new Date(r.paidAt).getTime() + 24 * 3600 * 1000 - Date.now()) / 3600000);
  return hrs >= 0 ? { text: `Provision due in ${hrs}h`, over: false } : { text: `Overdue by ${-hrs}h`, over: true };
}

// ── Pure helpers (exported for the phase unit tests) ──────────────────────────

/** Queue roll-up of the loaded rows (pending / approved / rejected + unpaid pending). */
export function signupSummary(rows: SignupRequestRow[]): { pending: number; approved: number; rejected: number; pendingUnpaid: number } {
  let pending = 0, approved = 0, rejected = 0, pendingUnpaid = 0;
  for (const r of rows) {
    if (r.status === "pending") { pending++; if (r.paymentStatus === "unpaid") pendingUnpaid++; }
    else if (r.status === "approved") approved++;
    else rejected++;
  }
  return { pending, approved, rejected, pendingUnpaid };
}

/** CSV column spec for the signup export (raw values). */
export const SIGNUP_CSV_COLUMNS: ReadonlyArray<CsvColumn<keyof SignupRequestRow>> = [
  { key: "firmName", label: "Firm" },
  { key: "contactName", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Status" },
  { key: "paymentStatus", label: "Payment" },
  { key: "paymentRef", label: "Payment ref" },
  { key: "paidAt", label: "Paid at" },
  { key: "reviewNotes", label: "Review notes" },
  { key: "createdAt", label: "Created" },
];

export function SignupRequestsView(): JSX.Element {
  const canManage = useCan("platform:orgs:manage");
  if (!canManage) return <AccessDenied message="Platform superadmin access required." />;
  return <Inner />;
}

interface Settled<T> { ok: boolean; data: T | null; error?: string }

type Lazy<T> = { ok: true; data: T } | { ok: false; error: string };

async function settle<T>(p: Promise<Lazy<T>>): Promise<Settled<T>> {
  try {
    const r = await p;
    if (r.ok) return { ok: true, data: r.data };
    return { ok: false, data: null, error: r.error };
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function SignupSkeleton(): JSX.Element {
  return (
    <div className="space-y-6" role="status" aria-label="Loading signup requests">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-panel rounded-xl border border-default p-4 space-y-3">
            <Skeleton decorative height={10} width="w-16" />
            <Skeleton decorative height={24} width="w-12" />
          </div>
        ))}
      </div>
      <div className="bg-panel rounded-xl border border-default p-4 space-y-3">
        <Skeleton decorative height={12} width="w-40" />
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} decorative height={40} width="w-full" />)}
      </div>
    </div>
  );
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
    const res = await settle(listSignupRequests(client, filter === "all" ? undefined : (filter as SignupStatus)));
    if (res.ok && res.data) setRows(res.data); else setError(res.error ?? "Failed to load signup requests.");
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

  const summary = signupSummary(rows);
  const onExport = useCallback(() => {
    const content = buildCsv(rows as unknown as Array<Record<string, unknown>>, SIGNUP_CSV_COLUMNS);
    if (!content) return;
    downloadCsv(`signup-requests-${csvDateStamp()}.csv`, content);
  }, [rows]);

  const columns: Column<SignupRequestRow>[] = [
    {
      key: "firm", header: "Firm", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-fg-primary text-sm">{r.firmName}</span>
            <Badge tone="info">{PLAN_LABEL[r.plan] ?? r.plan}</Badge>
            <Badge tone={statusTone(r.status)}>{r.status}</Badge>
            {r.status === "pending" && <Badge tone={PAY_TONE[r.paymentStatus]}>{PAY_LABEL[r.paymentStatus]}</Badge>}
            {(() => { const s = slaText(r); return s ? <span className={`text-[11px] font-semibold ${s.over ? "text-error" : "text-warning"}`}>⏱ {s.text}</span> : null; })()}
          </div>
          <div className="text-xs text-fg-secondary mt-0.5">{r.contactName} · {r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
          {r.message && <div className="text-[11px] text-fg-secondary mt-0.5 italic truncate">"{r.message}"</div>}
          <div className="text-[10px] text-fg-tertiary mt-0.5">{fmtDate(r.createdAt)}{r.reviewNotes ? ` · note: ${r.reviewNotes}` : ""}</div>
        </div>
      ),
    },
    {
      key: "payment", header: "Payment", hideOnMobile: true, className: "flex-shrink-0",
      render: r => r.status === "pending" ? (
        <div className="space-y-1">
          {r.paymentStatus === "unpaid" ? (
            <>
              <div className="flex gap-1 flex-wrap">
                <Button size="sm" variant="secondary" disabled={busy === r.id}
                  onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/pay/${r.id}`); setNotice(`UPI pay link copied — share it with ${r.email}.`); }}>
                  UPI
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === r.id}
                  onClick={() => void sendPayLink(r)}>
                  Cashfree
                </Button>
              </div>
              <div className="flex gap-1 flex-wrap">
                {isOwner ? (
                  <>
                    <Button size="sm" variant="secondary" disabled={busy === r.id}
                      onClick={() => void markPaid(r, "paid")}>
                      Mark paid
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === r.id}
                      onClick={() => void markPaid(r, "waived")}>
                      Waive
                    </Button>
                  </>
                ) : <span className="text-[11px] text-fg-secondary">Owner must confirm payment.</span>}
              </div>
              {r.paymentRef && <span className="text-[10px] text-fg-secondary block">claim UTR: {r.paymentRef}</span>}
            </>
          ) : (
            <div>
              <span className="text-xs text-fg-primary">{PAY_LABEL[r.paymentStatus]}{r.paidAt ? ` · ${fmtDate(r.paidAt)}` : ""}{r.paymentRef ? ` · ref ${r.paymentRef}` : ""}</span>
              {isOwner && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void markPaid(r, "unpaid")}>Undo</Button>}
            </div>
          )}
        </div>
      ) : <span className="text-xs text-fg-secondary">{PAY_LABEL[r.paymentStatus] ?? r.paymentStatus}</span>,
    },
    ...(canAssign ? [{
      key: "assigned" as const, header: "Staff", hideOnMobile: true, className: "flex-shrink-0",
      render: (r: SignupRequestRow) => (
        <Select fit className="w-40" value={r.assignedStaffId ?? ""} disabled={busy === r.id}
          onChange={e => void assign(r, e.target.value)}
          options={[{ value: "", label: "— Unassigned —" }, ...staff.map(s => ({ value: s.id, label: s.email || s.name }))]} />
      ),
    }] : []),
    {
      key: "actions", header: "", className: "flex-shrink-0",
      render: r => (
        <div className="space-y-1">
          {r.status === "pending" && (
            <div className="flex gap-1">
              <Button size="sm" variant="secondary"
                onClick={() => { setRejecting(rejecting === r.id ? null : r.id); setRejectNote(""); }}
                disabled={busy === r.id}>Reject</Button>
              <Button size="sm" onClick={() => void approve(r)} disabled={busy === r.id || !canApprove(r)}
                title={approveTitle(r)}>{busy === r.id ? <Spinner size={14} /> : "Approve"}</Button>
            </div>
          )}
          {rejecting === r.id && (
            <div className="flex gap-1 items-center">
              <Input fit className="w-28" value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Reason" />
              <Button size="sm" variant="secondary" onClick={() => void doReject(r)} disabled={busy === r.id}>Confirm</Button>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4 p-4 md:p-6">
      <Alert variant="info">
        Self-service registration is live at <b>/register</b>. Firms can now create their own workspace
        directly. This queue is for legacy/paid-plan requests only.
      </Alert>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Signup requests</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" leftIcon={<Icon name="download" size={14} />} onClick={onExport} disabled={rows.length === 0}>
            Export CSV
          </Button>
          <Select fit className="w-36" value={filter} onChange={e => setFilter(e.target.value)} options={FILTERS} />
        </div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {loading ? <SignupSkeleton /> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Pending" value={summary.pending} sub={`${summary.pendingUnpaid} unpaid`} />
          <StatCard label="Approved" value={summary.approved} sub="created orgs" />
          <StatCard label="Rejected" value={summary.rejected} sub="declined" />
          <StatCard label="Queue total" value={rows.length} sub={`${filter === "all" ? "" : filter} view`} />
        </div>
      )}

      {!loading && (
        <Card className="overflow-hidden">
          <DataTable dense columns={columns} rows={rows} rowKey={r => r.id} emptyMessage={`No ${filter === "all" ? "" : filter} requests.`} />
        </Card>
      )}
    </div>
  );
}