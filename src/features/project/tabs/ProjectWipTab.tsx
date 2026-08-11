// SiteTrack Pro — WIP Aging Tab (v6 Phase 6).
// Project-level work-in-progress aging with buckets and drill-down.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Spinner, Alert, Icon, Button } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { listWipAging, createWipEntry, updateWipEntry, computeWipAgingBuckets, type WipAgingEntry, type WipAgingBuckets, type WipCategory } from "@/app/projectFinancialQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

const CATEGORIES: WipCategory[] = ["labor", "material", "equipment", "subcontractor"];
const STATUSES: Array<"open" | "partially_billed" | "billed" | "write_off"> = ["open", "partially_billed", "billed", "write_off"];

export function ProjectWipView({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canView = useCan("budget:view", ctx);
  const canEdit = useCan("budget:edit", ctx);

  const [wip, setWip] = useState<WipAgingEntry[]>([]);
  const [buckets, setBuckets] = useState<WipAgingBuckets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formCategory, setFormCategory] = useState<WipCategory>("labor");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formIncurredDate, setFormIncurredDate] = useState(new Date().toISOString().slice(0, 10));
  const [formBilledAmount, setFormBilledAmount] = useState("0");
  const [formStatus, setFormStatus] = useState<"open" | "partially_billed" | "billed" | "write_off">("open");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listWipAging(client, projectId);
    if (res.ok) { setWip(res.data); setBuckets(computeWipAgingBuckets(res.data)); }
    else setError(res.error);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { if (canView) void reload(); }, [canView, reload]);
  const { busy } = useAction(reload, setError);

  if (!canView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-fg-primary">WIP Aging</h2>
          <Badge tone="neutral">Requires budget:view</Badge>
        </div>
        <div className="text-center py-8 text-fg-tertiary">
          <Icon name="shield" size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Access restricted.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="grid place-items-center py-8"><Spinner size={24} /></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;

  const handleCreate = async () => {
    if (!formDescription.trim() || !Number.isFinite(Number(formAmount)) || Number(formAmount) <= 0) return;
    const client = await getClient(); if (!client) return;
    const res = await createWipEntry(client, {
      projectId, category: formCategory, description: formDescription.trim(),
      amount: Number(formAmount), incurredDate: formIncurredDate || undefined,
    });
    if (res.ok) { setShowForm(false); resetForm(); void reload(); } else setError(res.error);
  };

  const handleUpdate = async (id: string) => {
    if (!formDescription.trim() || !Number.isFinite(Number(formAmount)) || Number(formAmount) <= 0) return;
    const client = await getClient(); if (!client) return;
    const res = await updateWipEntry(client, id, {
      category: formCategory, description: formDescription.trim(),
      amount: Number(formAmount), billedAmount: Number(formBilledAmount) || 0,
      status: formStatus,
    });
    if (res.ok) { setEditingId(null); resetForm(); void reload(); } else setError(res.error);
  };

  const resetForm = () => {
    setFormCategory("labor");
    setFormDescription("");
    setFormAmount("");
    setFormIncurredDate(new Date().toISOString().slice(0, 10));
    setFormBilledAmount("0");
    setFormStatus("open");
  };

  const startEdit = (e: WipAgingEntry) => {
    setEditingId(e.id);
    setFormCategory(e.category);
    setFormDescription(e.description ?? "");
    setFormAmount(String(e.amount));
    setFormIncurredDate(e.incurredDate);
    setFormBilledAmount(String(e.billedAmount));
    setFormStatus(e.status);
  };

  if (loading) return <div className="grid place-items-center py-8"><Spinner size={24} /></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;

  const totalUnbilled = buckets?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-lg font-bold text-fg-primary">WIP Aging</h2>
        {canEdit && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Icon name="plus" size={14} className="mr-1" /> Add WIP Entry
          </Button>
        )}
      </div>

      {/* Buckets Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Card className="p-3 text-center bg-success-tint/20 border-l-2 border-success">
          <div className="text-2xl font-display font-bold text-success">{fmtRupees(buckets?.current ?? 0)}</div>
          <div className="text-[11px] text-fg-tertiary">0-30 days</div>
        </Card>
        <Card className="p-3 text-center bg-info-tint/20 border-l-2 border-info">
          <div className="text-2xl font-display font-bold text-info">{fmtRupees(buckets?.days31_60 ?? 0)}</div>
          <div className="text-[11px] text-fg-tertiary">31-60 days</div>
        </Card>
        <Card className="p-3 text-center bg-warning-tint/20 border-l-2 border-warning">
          <div className="text-2xl font-display font-bold text-warning">{fmtRupees(buckets?.days61_90 ?? 0)}</div>
          <div className="text-[11px] text-fg-tertiary">61-90 days</div>
        </Card>
        <Card className="p-3 text-center bg-warning-tint/20 border-l-2 border-warning">
          <div className="text-2xl font-display font-bold text-warning">{fmtRupees(buckets?.days91_120 ?? 0)}</div>
          <div className="text-[11px] text-fg-tertiary">91-120 days</div>
        </Card>
        <Card className="p-3 text-center bg-error-tint/20 border-l-2 border-error">
          <div className="text-2xl font-display font-bold text-error">{fmtRupees(buckets?.over120 ?? 0)}</div>
          <div className="text-[11px] text-fg-tertiary">120+ days</div>
        </Card>
      </div>

      <Card padding="sm" title={<div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Total Unbilled: {fmtRupees(totalUnbilled)}</div>} action={<Badge tone={wip.filter(e => e.agingDays > 120).length > 0 ? "danger" : wip.filter(e => e.agingDays > 90).length > 0 ? "warning" : "success"}>
        {wip.filter(e => e.agingDays > 120).length > 0 ? "Critical" : wip.filter(e => e.agingDays > 90).length > 0 ? "Aging" : "Healthy"}
      </Badge>}>

        {/* Add/Edit Form */}
        {(showForm || editingId) && (
          <Card padding="sm" className="mb-4 bg-bg-secondary border-l-2 border-accent" title={<h4 className="font-semibold text-fg-primary">{editingId ? "Edit WIP Entry" : "New WIP Entry"}</h4>} action={<Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}>
            <Icon name="x" size={14} />
          </Button>}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Category</label>
                <Select value={formCategory} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormCategory(e.target.value as WipCategory)} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Description</label>
                <Input value={formDescription} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormDescription(e.target.value)} placeholder="Description of work / materials" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Amount (₹)</label>
                <Input type="number" value={formAmount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Incurred Date</label>
                <Input type="date" value={formIncurredDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormIncurredDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Billed Amount (₹)</label>
                <Input type="number" value={formBilledAmount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormBilledAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Status</label>
                <Select value={formStatus} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormStatus(e.target.value as "open" | "partially_billed" | "billed" | "write_off")} options={STATUSES.map(s => ({ value: s, label: s }))} />
              </div>
              <div className="flex items-end">
                <Button onClick={editingId ? () => handleUpdate(editingId!) : handleCreate} disabled={busy === "create" || busy === "update"}>
                  {busy === "create" || busy === "update" ? <Spinner size={14} /> : editingId ? "Update" : "Create"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        {/* WIP Table */}
        <DataTable dense columns={[
          { key: "category", header: "Category", className: "text-center", render: e => <Badge tone={e.category === "labor" ? "info" : e.category === "material" ? "success" : e.category === "equipment" ? "warning" : "neutral"}>{e.category}</Badge> },
          { key: "description", header: "Description", className: "flex-1 min-w-0", render: e => <span className="truncate">{e.description ?? "—"}</span> },
          { key: "amount", header: "Amount", className: "text-right font-mono text-sm", render: e => fmtRupees(e.amount) },
          { key: "billedAmount", header: "Billed", className: "text-right font-mono text-sm", render: e => fmtRupees(e.billedAmount) },
          { key: "unbilled", header: "Unbilled", className: "text-right font-mono text-sm font-semibold", render: e => <span className={e.amount - e.billedAmount > 0 ? "text-warning" : "text-success"}>{fmtRupees(e.amount - e.billedAmount)}</span> },
          { key: "agingDays", header: "Aging", className: "text-center", render: e => <Badge tone={e.agingDays > 120 ? "danger" : e.agingDays > 90 ? "warning" : e.agingDays > 60 ? "warning" : "success"}>{e.agingDays} days</Badge> },
          { key: "incurredDate", header: "Incurred", className: "text-center text-sm", render: e => e.incurredDate },
          { key: "status", header: "Status", className: "text-center", render: e => <Badge tone={e.status === "open" ? "warning" : e.status === "partially_billed" ? "info" : e.status === "billed" ? "success" : "neutral"}>{e.status}</Badge> },
          ...(canEdit ? [{
            key: "actions" as const, header: "", className: "text-center",
            render: (e: WipAgingEntry) => (
              <div className="flex items-center justify-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => startEdit(e)}><Icon name="send" size={12} /></Button>
              </div>
            ),
          }] : []),
        ]} rows={wip} rowKey={e => e.id} emptyMessage="No WIP entries." onRowClick={canEdit ? e => startEdit(e) : undefined} />
      </Card>
    </div>
  );
}