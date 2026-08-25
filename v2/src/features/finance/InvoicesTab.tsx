import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInvoice,
  INVOICE_STATUS_TONE,
  listInvoices,
  netReceivable,
  paymentStatus,
  type PaymentStatus,
} from "./financeQueries";
import { useT } from "@/i18n";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/forms";
import { SkeletonPage } from "@/components/ui/Skeleton";

const PAY_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  pending: "Pending",
  overdue: "Overdue",
};

export function InvoicesTab({ projectId }: { projectId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [gstPct, setGstPct] = useState("18");
  const [tdsPct, setTdsPct] = useState("2");
  const [formError, setFormError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["invoices", projectId],
    queryFn: () => listInvoices(projectId),
  });

  const create = useMutation({
    mutationFn: () =>
      createInvoice(projectId, {
        amount: Number(amount),
        gstPct: Number(gstPct) || 0,
        tdsPct: Number(tdsPct) || 0,
      }),
    onSuccess: () => {
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["invoices", projectId] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError("Enter a valid amount");
      return;
    }
    create.mutate();
  }

  if (q.isLoading) return <SkeletonPage rows={3} />;
  if (q.isError) return <Alert variant="error">{String(q.error)}</Alert>;

  const rows = q.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Card title={t("detail.newInvoice")} padding="md">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <Input
            label={t("detail.amount")}
            type="number"
            min="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-40"
          />
          <Input
            label={t("detail.gstPct")}
            type="number"
            step="0.01"
            value={gstPct}
            onChange={(e) => setGstPct(e.target.value)}
            className="w-24"
          />
          <Input
            label={t("detail.tdsPct")}
            type="number"
            step="0.01"
            value={tdsPct}
            onChange={(e) => setTdsPct(e.target.value)}
            className="w-24"
          />
          <Button type="submit" loading={create.isPending}>
            {t("detail.createInvoice")}
          </Button>
        </form>
        {(create.isError || formError) && (
          <div className="mt-2">
            <Alert variant="error">{formError ?? String(create.error)}</Alert>
          </div>
        )}
      </Card>

      <Card title={`${t("detail.invoices")} (${rows.length})`} padding="none">
        {rows.length === 0 ? (
          <EmptyState title={t("detail.noInvoices")} message={t("detail.noInvoicesHint")} />
        ) : (
          <ul className="divide-y divide-[var(--st-border)]">
            {rows.map((inv) => {
              const net = netReceivable(inv.amount, inv.gstPct, inv.tdsPct);
              const pay = paymentStatus(inv);
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg-primary">{inv.no}</div>
                    <div className="text-xs text-fg-tertiary">
                      ₹{inv.amount.toLocaleString("en-IN")} + GST {inv.gstPct}% − TDS {inv.tdsPct}%
                      {inv.issuedDate ? ` · ${inv.issuedDate}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold text-fg-primary">
                      ₹{net.toLocaleString("en-IN")}
                    </span>
                    <Badge tone={INVOICE_STATUS_TONE[inv.status] ?? "neutral"}>
                      {PAY_LABEL[pay]}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}