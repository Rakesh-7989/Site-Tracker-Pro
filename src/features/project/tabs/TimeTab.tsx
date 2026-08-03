// SiteTrack Pro — consultancy billable time tab (v4 C1 + C2).
// Log your own time (time:log); managers + entry owners may edit/delete while
// an entry is still pending (time:manage). Managers approve / reject entries
// (time:approve); approved + billable + unbilled entries feed hourly billing.
// The rate field is prefilled from the member's project rate card when unset.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import {
  listTimeEntries, createTimeEntry, updateTimeEntry, deleteTimeEntry, approveTimeEntry,
  billableHours, entryValue, type TimeEntry, type ApprovalStatus,
} from "@/app/timeQueries";
import { listRateCards, effectiveRate, type RateCard } from "@/app/rateCardQueries";
import { listFeePhases } from "@/app/phaseQueries";
import { localDateISO } from "@/lib/dateLocal";

const STATUS_TONE: Record<ApprovalStatus, "success" | "warning" | "danger"> = {
  pending: "warning", approved: "success", rejected: "danger",
};

export function TimeTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const profileId = session?.user.id ?? "";
  const canLog = useCan("time:log", { orgId: activeOrg?.orgId, projectId });
  const canManage = useCan("time:manage", { orgId: activeOrg?.orgId, projectId });
  const canApprove = useCan("time:approve", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<TimeEntry[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [phases, setPhases] = useState<{ id: string; title: string; feeAmount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [activity, setActivity] = useState("");
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("");
  const [billable, setBillable] = useState(true);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");
  const [editActivity, setEditActivity] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPhaseId, setEditPhaseId] = useState<string | null>(null);

  const canEditEntry = (e: TimeEntry) => e.approvalStatus === "pending" && (canManage || e.profileId === profileId);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [entriesRes, cardsRes, phasesRes] = await Promise.all([
      listTimeEntries(client, projectId),
      listRateCards(client, projectId),
      listFeePhases(client, projectId),
    ]);
    if (entriesRes.ok) setRows(entriesRes.data); else setError(entriesRes.error);
    if (cardsRes.ok) setRateCards(cardsRes.data);
    if (phasesRes.ok) setPhases(phasesRes.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const rateHint = effectiveRate(profileId, localDateISO(), rateCards);

  const add = async () => {
    if (!activity.trim() || !hours.trim()) return;
    const tmpId = "tmp-" + Date.now();
    const h = Number(hours);
    const r = rate.trim() === "" ? (rateHint ?? null) : Number(rate);
    await run("add", c => createTimeEntry(c, { projectId, profileId, date: date || localDateISO(), activity: activity.trim(), hours: h, billable, rate: r, phaseId }), {
      apply: () => setRows(prev => [{ id: tmpId, profileId, memberName: null, date: date || localDateISO(), activity: activity.trim(), hours: h, billable, rate: r, notes: null, approvalStatus: "pending", approvedBy: null, approvedAt: null, billed: false, billedInvoiceId: null, createdAt: "", phaseId }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setActivity(""); setHours(""); setRate(""); setBillable(true); setPhaseId(null);
  };

  const setApproval = async (e: TimeEntry, status: ApprovalStatus) => {
    await run(`a-${e.id}`, c => approveTimeEntry(c, e.id, status), {
      apply: () => setRows(prev => prev.map(x => x.id === e.id ? { ...x, approvalStatus: status, approvedBy: status === "pending" ? null : profileId, approvedAt: status === "pending" ? null : new Date().toISOString() } : x)),
      rollback: () => setRows(prev => prev.map(x => x.id === e.id ? { ...x, approvalStatus: e.approvalStatus, approvedBy: e.approvedBy, approvedAt: e.approvedAt } : x)),
    });
  };

  const startEdit = (e: TimeEntry) => {
    setEditingId(e.id); setEditHours(String(e.hours)); setEditActivity(e.activity); setEditNotes(e.notes ?? "");
  };

  const saveEdit = async (e: TimeEntry) => {
    const h = Number(editHours) || e.hours;
    await run(`e-${e.id}`, c => updateTimeEntry(c, e.id, { activity: editActivity.trim() || e.activity, hours: h, notes: editNotes.trim() || null, phaseId: editPhaseId }), {
      apply: () => setRows(prev => prev.map(x => x.id === e.id ? { ...x, hours: h, activity: editActivity.trim() || e.activity, notes: editNotes.trim() || null, phaseId: editPhaseId } : x)),
      rollback: () => setRows(prev => prev.map(x => x.id === e.id ? { ...x, hours: e.hours, activity: e.activity, notes: e.notes, phaseId: e.phaseId } : x)),
    });
    setEditingId(null);
    setEditPhaseId(null);
  };

  const total = billableHours(rows);
  const value = rows.reduce((s, e) => s + entryValue(e), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Time</h2>
        {rows.length > 0 && (
          <span className="text-sm text-fg-secondary">{total.toFixed(1)}h logged · {fmtRupees(Math.round(value))}</span>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {canLog && (
            <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Date</span>
                <Input className="mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Activity</span>
                <Input className="mt-1" placeholder="e.g. Structural drawings review" value={activity} onChange={e => setActivity(e.target.value)} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Hours</span>
                <Input className="mt-1" type="number" min={0.25} max={24} step={0.25} placeholder="4.5" value={hours} onChange={e => setHours(e.target.value)} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Rate (₹/h)</span>
                <Input className="mt-1" type="number" min={0} placeholder={rateHint != null ? String(rateHint) : "2000"} value={rate} onChange={e => setRate(e.target.value)} />
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm text-fg-secondary cursor-pointer">
                  <input type="checkbox" className="accent-[var(--st-accent)]" checked={billable} onChange={e => setBillable(e.target.checked)} />
                  Billable
                </label>
                <Select className="w-48" value={phaseId || ""} onChange={e => setPhaseId(e.target.value || null)} options={[{ value: "", label: "--- Phase (optional) ---" }, ...phases.map(p => ({ value: p.id, label: p.title }))]} />
                <Button size="sm" onClick={() => void add()} disabled={busy === "add" || !activity.trim() || !hours.trim()}>{busy === "add" ? <Spinner size={14} /> : "Log time"}</Button>
              </div>
            </Card>
          )}

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-fg-secondary">No time logged yet.{canLog ? " Log the first entry above." : ""}</div>
      ) : (
        <div className="space-y-2">
          {rows.map(e => (
            <Card key={e.id} className="p-3 flex items-center justify-between gap-3">
              {editingId === e.id ? (
                <div className="flex-1 grid gap-2 sm:grid-cols-3 items-end">
                  <Input value={editActivity} onChange={x => setEditActivity(x.target.value)} placeholder="Activity" />
                  <Input type="number" min={0.25} max={24} step={0.25} value={editHours} onChange={x => setEditHours(x.target.value)} placeholder="Hours" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === `e-${e.id}`} onClick={() => void saveEdit(e)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg-primary truncate">{e.activity}</span>
                      <Badge tone={e.billable ? "info" : "neutral"}>{e.billable ? "billable" : "internal"}</Badge>
                      <Badge tone={STATUS_TONE[e.approvalStatus]}>{e.approvalStatus}</Badge>
                      {e.billed && <Badge tone="neutral">billed</Badge>}
                    </div>
                    <div className="text-[11px] text-fg-tertiary">
                      {e.date} · {e.memberName ?? "You"}
                      {e.rate != null && ` · ${fmtRupees(e.rate)}/h`}
                      {e.notes && ` · ${e.notes}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-fg-primary">{e.hours.toFixed(1)}h</span>
                    {canApprove && e.approvalStatus === "pending" && (
                      <>
                        <Button size="sm" disabled={busy === `a-${e.id}`} onClick={() => void setApproval(e, "approved")}>Approve</Button>
                        <Button size="sm" variant="ghost" disabled={busy === `a-${e.id}`} onClick={() => void setApproval(e, "rejected")}>Reject</Button>
                      </>
                    )}
                    {canApprove && e.approvalStatus !== "pending" && (
                      <Button size="sm" variant="ghost" disabled={busy === `a-${e.id}`} onClick={() => void setApproval(e, "pending")}>Reopen</Button>
                    )}
                    {canEditEntry(e) && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(e)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => void run(`d-${e.id}`, c => deleteTimeEntry(c, e.id), { apply: () => setRows(prev => prev.filter(x => x.id !== e.id)), rollback: () => setRows(prev => [...prev, e]) })}>
                          <Icon name="trash" size={14} className="text-error" />
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
