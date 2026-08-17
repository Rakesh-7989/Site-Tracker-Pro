// SiteTrack Pro — statutory approvals / NOC register tab (v4 D4).
// NOC / government-approval register for design + built projects. create/edit/
// delete → statutory:manage (managers + org admin only); plan gated by
// PlanFeature "statutory" at the tab level (tabs-config). Status + kinds follow
// the statutory_approvals CHECK (152). Expiring-soon NOCs are highlighted.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import {
  listStatutoryApprovals, upsertStatutoryApproval, setStatutoryStatus, deleteStatutoryApproval,
  isExpiring, STATUTORY_NEXT, STATUTORY_KINDS,
  type StatutoryApproval, type StatutoryKind, type StatutoryStatus,
} from "@/app/statutoryQueries";

const STATUS_TONE: Record<StatutoryStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral", applied: "info", approved: "success", rejected: "danger", expired: "warning",
};
const STATUS_LABEL: Record<StatutoryStatus, string> = {
  draft: "Draft", applied: "Applied", approved: "Approved", rejected: "Rejected", expired: "Expired",
};
const KIND_LABEL: Record<StatutoryKind, string> = {
  fire: "Fire NOC", municipal: "Municipal", environment: "Environment", electrical: "Electrical",
  labour: "Labour", occupancy: "Occupancy", other: "Other",
};
const formatINR = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  kind: "fire" as StatutoryKind, title: "", authority: "", refNo: "",
  appliedAt: "", validUntil: "", cost: "", notes: "",
};

export function StatutoryTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("statutory:manage", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<StatutoryApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listStatutoryApprovals(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const today = todayISO();
  const expiringCount = rows.filter(r => isExpiring(r.validUntil, today)).length;

  const save = async () => {
    if (!form.title.trim()) return;
    const isEdit = !!editingId;
    const prev = rows;
    const optimistic: StatutoryApproval = {
      id: editingId ?? "tmp-" + Date.now(),
      kind: form.kind,
      title: form.title.trim(),
      authority: form.authority.trim() || null,
      refNo: form.refNo.trim() || null,
      appliedAt: form.appliedAt || null,
      status: "draft",
      decisionAt: null,
      validUntil: form.validUntil || null,
      cost: Math.max(0, Number(form.cost) || 0),
      notes: form.notes.trim() || null,
      createdAt: "",
    };
    await run(isEdit ? "edit" : "add", c => upsertStatutoryApproval(c, {
      id: editingId, projectId,
      kind: form.kind, title: form.title.trim(),
      authority: form.authority.trim() || null, refNo: form.refNo.trim() || null,
      appliedAt: form.appliedAt || null, validUntil: form.validUntil || null,
      cost: Math.max(0, Number(form.cost) || 0), notes: form.notes.trim() || null,
    }), {
      apply: () => setRows(prev =>
        isEdit ? prev.map(x => x.id === editingId ? optimistic : x) : [optimistic, ...prev]),
      rollback: () => setRows(prev),
    });
    setForm(EMPTY); setEditingId(null);
  };

  const toggle = async (a: StatutoryApproval) => {
    const next = STATUTORY_NEXT[a.status]; if (!next) return;
    const prevRows = rows;
    await run(`s-${a.id}`, c => setStatutoryStatus(c, a.id, next), {
      apply: () => setRows(prev => prev.map(x => x.id === a.id ? { ...x, status: next } : x)),
      rollback: () => setRows(prevRows),
    });
  };

  const remove = async (a: StatutoryApproval) => {
    const prevRows = rows;
    await run(`d-${a.id}`, c => deleteStatutoryApproval(c, a.id), {
      apply: () => setRows(prev => prev.filter(x => x.id !== a.id)),
      rollback: () => setRows(prevRows),
    });
  };

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Statutory Approvals</h2>
        {rows.length > 0 && (
          <span className="text-sm text-fg-secondary">
            {rows.filter(r => r.status === "approved").length}/{rows.length} approved
            {expiringCount > 0 && <span className="ml-2 text-accent">· {expiringCount} expiring soon</span>}
          </span>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {canManage ? (
        <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span>
            <Input className="mt-1" placeholder="e.g. Fire NOC" value={form.title} onChange={e => set("title")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Kind</span>
            <Select className="mt-1" options={STATUTORY_KINDS.map(k => ({ value: k, label: KIND_LABEL[k] }))} value={form.kind} onChange={e => set("kind")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Authority</span>
            <Input className="mt-1" placeholder="e.g. Fire Department" value={form.authority} onChange={e => set("authority")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Ref no.</span>
            <Input className="mt-1" placeholder="e.g. GHMC/2026/123" value={form.refNo} onChange={e => set("refNo")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Applied</span>
            <Input className="mt-1" type="date" value={form.appliedAt} onChange={e => set("appliedAt")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Valid until</span>
            <Input className="mt-1" type="date" value={form.validUntil} onChange={e => set("validUntil")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Fee</span>
            <Input className="mt-1" type="number" min={0} prefix="₹" value={form.cost} onChange={e => set("cost")(e.target.value)} />
          </div>
          <div className="flex gap-2 items-end">
            <Button className="flex-1" onClick={() => void save()} disabled={busy === "add" || busy === "edit" || !form.title.trim()}>
              {busy === "add" || busy === "edit" ? <Spinner size={14} /> : editingId ? "Save" : "Add"}
            </Button>
            {editingId && <Button variant="ghost" onClick={() => { setForm(EMPTY); setEditingId(null); }}>Cancel</Button>}
          </div>
        </Card>
      ) : (
        <div className="text-[11px] text-fg-tertiary">Read-only — only managers can edit statutory approvals.</div>
      )}

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-fg-secondary">No statutory approvals yet.{canManage ? " Add the first one above." : ""}</div>
      ) : (
        <div className="space-y-2">
          {rows.map(a => {
            const expiring = isExpiring(a.validUntil, today) && a.status !== "expired";
            return (
              <Card key={a.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg-primary truncate">{a.title}</span>
                      <Badge tone="neutral">{KIND_LABEL[a.kind]}</Badge>
                      {expiring && <Badge tone="warning">Expiring soon</Badge>}
                    </div>
                    <div className="text-[11px] text-fg-tertiary">
                      {a.authority && `${a.authority}`}
                      {a.refNo && ` · Ref ${a.refNo}`}
                      {a.appliedAt && ` · Applied ${a.appliedAt}`}
                      {a.validUntil && ` · Valid to ${a.validUntil}`}
                      {a.cost > 0 && ` · ${formatINR(a.cost)}`}
                    </div>
                    {a.notes && <div className="text-[11px] text-fg-tertiary">{a.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canManage ? (
                      <button type="button" disabled={busy === `s-${a.id}`} onClick={() => void toggle(a)} title="Advance status">
                        <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                      </button>
                    ) : (
                      <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    )}
                    {canManage && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => {
                          setEditingId(a.id);
                          setForm({ kind: a.kind, title: a.title, authority: a.authority ?? "", refNo: a.refNo ?? "", appliedAt: a.appliedAt ?? "", validUntil: a.validUntil ?? "", cost: String(a.cost), notes: a.notes ?? "" });
                        }}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => void remove(a)}>
                          <IconTrash />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-error"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>;
}