// SiteTrack Pro — Budget Reallocation Tab (v6 Phase 6).
// Project-level budget change management with approval workflow.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Spinner, Alert, Icon, Button } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { listBudgetChanges, createBudgetChange, approveBudgetChange, computeBudgetImpact, type BudgetChange, type BudgetChangeType, type BudgetCategory, type BudgetImpact } from "@/app/projectFinancialQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

const CHANGE_TYPES: BudgetChangeType[] = ["increase", "decrease", "reallocate", "contingency_use"];
const CATEGORIES: BudgetCategory[] = ["labor", "material", "equipment", "subcontractor", "overhead", "contingency"];

export function ProjectBudgetView({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canView = useCan("budget:view", ctx);
  const canEdit = useCan("budget:edit", ctx);

  const [changes, setChanges] = useState<BudgetChange[]>([]);
  const [impact, setImpact] = useState<BudgetImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<BudgetChangeType>("increase");
  const [formCategory, setFormCategory] = useState<BudgetCategory>("labor");
  const [formAmount, setFormAmount] = useState("");
  const [formFromCategory, setFormFromCategory] = useState<BudgetCategory>("contingency");
  const [formReason, setFormReason] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listBudgetChanges(client, projectId);
    if (res.ok) { setChanges(res.data); setImpact(computeBudgetImpact(res.data)); }
    else setError(res.error);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { if (canView) void reload(); }, [canView, reload]);
  const { busy } = useAction(reload, setError);

  if (!canView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-fg-primary">Budget Reallocation</h2>
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

  const pendingCount = changes.filter(c => c.status === "pending").length;
  const approvedCount = changes.filter(c => c.status === "approved").length;
  const rejectedCount = changes.filter(c => c.status === "rejected").length;

  const handleCreate = async () => {
    if (!formReason.trim() || !Number.isFinite(Number(formAmount)) || Number(formAmount) <= 0) return;
    const client = await getClient(); if (!client) return;
    const res = await createBudgetChange(client, {
      projectId, changeType: formType, category: formCategory,
      amount: Number(formAmount), fromCategory: formType === "reallocate" ? formFromCategory : undefined,
      reason: formReason.trim(),
    });
    if (res.ok) { setShowForm(false); resetForm(); void reload(); } else setError(res.error);
  };

  const handleApprove = async (id: string, approved: boolean) => {
    const client = await getClient(); if (!client) return;
    const res = await approveBudgetChange(client, id, approved);
    if (res.ok) void reload(); else setError(res.error);
  };

  const resetForm = () => {
    setFormType("increase");
    setFormCategory("labor");
    setFormAmount("");
    setFormFromCategory("contingency");
    setFormReason("");
  };

  const pendingApproval = changes.filter(c => c.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-lg font-bold text-fg-primary">Budget Reallocation</h2>
        {canEdit && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Icon name="plus" size={14} className="mr-1" /> Request Change
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Pending</div>
          <div className="text-lg font-display font-bold text-warning mt-0.5">{pendingCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Approved</div>
          <div className="text-lg font-display font-bold text-success mt-0.5">{approvedCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Rejected</div>
          <div className="text-lg font-display font-bold text-danger mt-0.5">{rejectedCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Total Changes</div>
          <div className="text-lg font-display font-bold text-fg-primary mt-0.5">{changes.length}</div>
        </Card>
      </div>

      {/* Pending Approvals */}
      {pendingApproval.length > 0 && (
        <Card className="p-3 border-l-2 border-warning">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-warning">⏳ Pending Approvals ({pendingApproval.length})</div>
          </div>
          <DataTable columns={[
            { key: "changeType", header: "Type", className: "text-center", render: c => <Badge tone={c.changeType === "increase" ? "success" : c.changeType === "decrease" ? "danger" : c.changeType === "reallocate" ? "warning" : "info"}>{c.changeType}</Badge> },
            { key: "category", header: "Category", className: "text-center", render: c => <Badge tone="info">{c.category}</Badge> },
            { key: "fromCategory", header: "From", className: "text-center", render: c => c.fromCategory ? <Badge tone="neutral">{c.fromCategory}</Badge> : <span className="text-fg-tertiary">—</span> },
            { key: "amount", header: "Amount", className: "text-right font-mono text-sm", render: c => fmtRupees(c.amount) },
            { key: "reason", header: "Reason", className: "flex-1 min-w-0", render: c => <span className="truncate">{c.reason}</span> },
            { key: "createdAt", header: "Requested", className: "text-center text-sm", render: c => c.createdAt.slice(0, 16) },
            {
              key: "actions" as const, header: "", className: "text-center",
              render: (c: BudgetChange) => (
                <div className="flex items-center justify-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleApprove(c.id, true)}><Icon name="check" size={12} className="text-success" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleApprove(c.id, false)}><Icon name="x" size={12} className="text-error" /></Button>
                </div>
              ),
            },
          ]} rows={pendingApproval} rowKey={c => c.id} emptyMessage="No pending approvals." />
        </Card>
      )}

      {/* Budget Impact Summary */}
      {impact.length > 0 && (
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Approved Budget Impact</div>
          <div className="space-y-1">
            {impact.map(i => (
              <div key={i.category} className="flex items-center justify-between py-1 text-sm">
                <span className="text-fg-secondary">{i.category}</span>
                <span className="font-mono text-fg-secondary">{fmtRupees(i.currentBudget)}</span>
                <span className={`font-mono text-sm ${i.proposedChange >= 0 ? "text-success" : "text-danger"}`}>
                  {i.proposedChange >= 0 ? "+" : ""}{fmtRupees(i.proposedChange)}
                </span>
                <span className={`font-mono font-semibold ${i.newBudget >= i.currentBudget ? "text-success" : "text-danger"}`}>{fmtRupees(i.newBudget)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Request Change Form */}
      {showForm && canEdit && (
        <Card className="p-3 mb-4 bg-bg-secondary border-l-2 border-accent">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-fg-primary">Request Budget Change</h4>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>
              <Icon name="x" size={14} />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Type</label>
              <Select value={formType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormType(e.target.value as BudgetChangeType)} options={CHANGE_TYPES.map(t => ({ value: t, label: t }))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Category</label>
              <Select value={formCategory} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormCategory(e.target.value as BudgetCategory)} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">From Category (if reallocate)</label>
              <Select value={formFromCategory} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormFromCategory(e.target.value as BudgetCategory)} options={CATEGORIES.map(c => ({ value: c, label: c }))} disabled={formType !== "reallocate"} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Amount (₹)</label>
              <Input type="number" value={formAmount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary block mb-1">Reason</label>
              <Input value={formReason} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormReason(e.target.value)} placeholder="Justification for this budget change" />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button onClick={handleCreate} disabled={busy === "create" || !formReason.trim() || !Number.isFinite(Number(formAmount)) || Number(formAmount) <= 0}>
                {busy === "create" ? <Spinner size={14} /> : "Submit Request"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {/* All Changes History */}
      <Card className="p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Change History ({changes.length})</div>
        <DataTable columns={[
          { key: "changeType", header: "Type", className: "text-center", render: c => <Badge tone={c.changeType === "increase" ? "success" : c.changeType === "decrease" ? "danger" : c.changeType === "reallocate" ? "warning" : "info"}>{c.changeType}</Badge> },
          { key: "category", header: "Category", className: "text-center", render: c => <Badge tone="info">{c.category}</Badge> },
          { key: "fromCategory", header: "From", className: "text-center", render: c => c.fromCategory ? <Badge tone="neutral">{c.fromCategory}</Badge> : <span className="text-fg-tertiary">—</span> },
          { key: "amount", header: "Amount", className: "text-right font-mono text-sm", render: c => fmtRupees(c.amount) },
          { key: "reason", header: "Reason", className: "flex-1 min-w-0", render: c => <span className="truncate">{c.reason}</span> },
          { key: "status", header: "Status", className: "text-center", render: c => <Badge tone={c.status === "approved" ? "success" : c.status === "pending" ? "warning" : "danger"}>{c.status}</Badge> },
          { key: "approvedAt", header: "Approved", className: "text-center text-sm", render: c => c.approvedAt ? c.approvedAt.slice(0, 16) : <span className="text-fg-tertiary">—</span> },
          { key: "createdAt", header: "Requested", className: "text-center text-sm", render: c => c.createdAt.slice(0, 16) },
        ]} rows={changes} rowKey={c => c.id} emptyMessage="No budget changes." />
      </Card>
    </div>
  );
}