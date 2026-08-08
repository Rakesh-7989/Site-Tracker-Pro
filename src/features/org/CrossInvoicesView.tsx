// SiteTrack Pro — Org-wide Invoice Register with Payment Status (V6 Phase 1.3).
// Mirrors CrossRaBillsView pattern for invoices with payment reconciliation.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Spinner, Alert, Badge, DataTable } from "@/components/ui";
import { Input, Select, FormField } from "@/components/ui/forms";
import { useT } from "@/i18n/I18nProvider";
import { useCan } from "@/auth";
import { useOrgSwitcher } from "@/auth/useOrgSwitcher";
import {
  listOrgInvoicesWithPayments,
  crossInvoiceRollup,
  type CrossInvoice,
} from "@/app/crossInvoiceQueries";
import { getClient } from "@/lib/supabase";

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral", sent: "info", paid: "success", overdue: "danger", cancelled: "neutral",
};

const PAYMENT_STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  paid: "success", partial: "info", pending: "warning", overdue: "danger",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "Paid", partial: "Partial", pending: "Pending", overdue: "Overdue",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled",
};

const fmtCur = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const fmtDate = (iso: string | null) => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

const columns = [
  { key: "no", header: "Invoice No.", className: "font-mono font-semibold text-accent", render: (r: CrossInvoice) => <span className="font-mono font-semibold text-accent">{r.no}</span> },
  { key: "project", header: "Project", className: "flex-1 min-w-0", render: (r: CrossInvoice) => (
    <div>
      <div className="font-semibold text-fg-primary truncate">{r.projectName || "—"}</div>
      <div className="text-xs text-fg-tertiary">{r.projectType || "—"}</div>
    </div>
  ) },
  { key: "issued", header: "Issued", className: "whitespace-nowrap", render: (r: CrossInvoice) => <span className="text-xs text-fg-secondary">{fmtDate(r.issuedDate)}</span> },
  { key: "amount", header: "Amount", className: "text-right", render: (r: CrossInvoice) => <span className="font-semibold text-fg-primary">{fmtCur(r.amount)}</span> },
  { key: "net", header: "Net Receivable", className: "text-right", render: (r: CrossInvoice) => <span className="font-bold text-fg-primary">{fmtCur(r.netReceivable)}</span> },
  { key: "received", header: "Received", className: "text-right", render: (r: CrossInvoice) => <span className="font-semibold text-success">{fmtCur(r.received)}</span> },
  { key: "outstanding", header: "Outstanding", className: "text-right", render: (r: CrossInvoice) => <span className="font-bold text-error">{fmtCur(r.outstanding)}</span> },
  { key: "status", header: "Status", className: "whitespace-nowrap", render: (r: CrossInvoice) => (
    <Badge tone={STATUS_TONE[r.status] as "neutral" | "info" | "success" | "warning" | "danger"}>{STATUS_LABEL[r.status]}</Badge>
  ) },
  { key: "paymentStatus", header: "Payment", className: "whitespace-nowrap", render: (r: CrossInvoice) => (
    <Badge tone={PAYMENT_STATUS_TONE[r.paymentStatus] as "neutral" | "info" | "success" | "warning" | "danger"}>
      {PAYMENT_STATUS_LABEL[r.paymentStatus]}
    </Badge>
  ) },
];

const statusOptions = [{ value: "all", label: "All" }, ...(["draft", "sent", "paid", "overdue", "cancelled"] as const).map(s => ({ value: s, label: STATUS_LABEL[s] }))];
const paymentOptions = [{ value: "all", label: "All" }, ...(["paid", "partial", "pending", "overdue"] as const).map(s => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))];

export function CrossInvoicesView(): JSX.Element {
  const t = useT();
  const canView = useCan("invoice:create", { orgId: useOrgSwitcher().activeOrg?.orgId ?? "" });
  const { activeOrg } = useOrgSwitcher();
  const [invoices, setInvoices] = useState<CrossInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listOrgInvoicesWithPayments(client, activeOrg!.orgId);
    if (res.ok) setInvoices(res.data); else setError(res.error);
    setLoading(false);
  }, [activeOrg]);
  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (paymentFilter !== "all" && inv.paymentStatus !== paymentFilter) return false;
      if (search && !inv.no.toLowerCase().includes(search.toLowerCase()) &&
          !inv.projectName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [invoices, statusFilter, paymentFilter, search]);

  const rollup = useMemo(() => crossInvoiceRollup(invoices), [invoices]);

  if (!canView) return <div className="p-8 text-center text-fg-secondary">Access denied: invoice:view capability required</div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">{t("invoices.eyebrow")}</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">{t("invoices.title")}</h1>
            <p className="text-fg-secondary text-sm mt-2">{t("invoices.subtitle")}</p>
          </div>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("invoices.statTotal")}</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.totalInvoices}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("invoices.statAmount")}</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtCur(rollup.totalAmount)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("invoices.statNet")}</div><div className="font-display text-2xl font-bold text-warning mt-1">{fmtCur(rollup.totalNet)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("invoices.statReceived")}</div><div className="font-display text-2xl font-bold text-success mt-1">{fmtCur(rollup.totalReceived)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("invoices.statOutstanding")}</div><div className="font-display text-2xl font-bold text-error mt-1">{fmtCur(rollup.totalOutstanding)}</div></Card>
        <Card className="p-4 flex flex-col justify-center">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("invoices.statPaymentSplit")}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {["paid", "partial", "pending", "overdue"].map(s => (
              <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-elevated text-fg-secondary">
                {PAYMENT_STATUS_LABEL[s]} {rollup.byPaymentStatus[s as keyof typeof rollup.byPaymentStatus]}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <FormField label="Status" htmlFor="status-filter">
          <Select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            options={statusOptions} />
        </FormField>
        <FormField label="Payment" htmlFor="payment-filter">
          <Select id="payment-filter" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
            options={paymentOptions} />
        </FormField>
        <FormField label="Search" htmlFor="search">
          <Input id="search" placeholder="Search invoice no. or project…" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        </FormField>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : (
        <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-border">
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={r => r.id}
            variant="card"
            emptyMessage={filtered.length === 0 ? "No invoices match the current filters." : ""}
          />
        </div>
      )}
    </div>
  );
}