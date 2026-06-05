// SiteTrack Pro — superadmin signup queue (/admin/signups). Review pending
// signup requests: approve (creates org + invites the applicant) or reject.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listSignupRequests, reviewSignupRequest, type SignupRequestRow, type SignupStatus } from "@/app/signupAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const FILTERS = [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All" }];
const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom" };
const statusTone = (s: SignupStatus): "neutral" | "warning" | "success" | "danger" => (s === "approved" ? "success" : s === "rejected" ? "danger" : "warning");
const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };

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
    if (res.ok) setNotice(`Approved ${r.firmName}. ${res.data.emailSent ? "Invite email sent." : "Org created — invite email may be delayed."}`);
    else setError(res.error);
    await reload(); setBusy(null);
  };
  const doReject = async (r: SignupRequestRow) => {
    setBusy(r.id); setError(null); setNotice(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await reviewSignupRequest(client, r.id, "reject", rejectNote.trim() || undefined);
    if (res.ok) setNotice(`Rejected ${r.firmName}.`); else setError(res.error);
    setRejecting(null); setRejectNote(""); await reload(); setBusy(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
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
                </div>
                <div className="text-sm text-ink-600 mt-0.5">{r.contactName} · {r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                {r.message && <div className="text-[12px] text-ink-500 mt-1 italic">“{r.message}”</div>}
                <div className="text-[11px] text-ink-400 mt-1">{fmtDate(r.createdAt)}{r.reviewNotes ? ` · note: ${r.reviewNotes}` : ""}</div>
              </div>
              {r.status === "pending" && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => { setRejecting(rejecting === r.id ? null : r.id); setRejectNote(""); }} disabled={busy === r.id}>Reject</Button>
                  <Button size="sm" onClick={() => void approve(r)} disabled={busy === r.id}>{busy === r.id ? <Spinner size={14} /> : "Approve"}</Button>
                </div>
              )}
            </div>
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
