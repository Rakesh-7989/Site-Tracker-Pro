// SiteTrack Pro — Org Billing (/org/billing). Plan, seat usage, subscription
// lifecycle management (view, cancel, reactivate), billing history, alerts.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Button, Alert, AccessDenied, Icon } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { requestPlanUpgrade } from "@/app/queries/upgradeQueries";
import { getOrgOverview, getOrgBillingFull, PLAN_LABEL, type OrgOverview, type BillingFull, type BillingHistoryItem } from "@/app/queries/orgAdminQueries";
import { fetchOrgQuota, usageRollup, type QuotaRollup } from "@/app/queries/quotaQueries";
import { QuotaMeter } from "@/auth/QuotaGate";
import { useT } from "@/i18n/I18nProvider";

 
import { getClient } from "@/lib/supabase/supabase";
const fmtDate = (iso: string | null): string => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const fmtMoney = (n: number, cur: string): string => `${cur === "INR" ? "₹" : ""}${(n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const subTone = (s: string): "neutral" | "success" | "warning" | "danger" | "info" => (
  s === "active" ? "success" : s === "trial" ? "info" : s === "paused" ? "warning" : s === "past_due" ? "danger" : s === "cancelled" ? "danger" : "neutral"
);
export function OrgBillingView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const t = useT();
  const canView = useCan("org:billing:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">{t("billing.selectOrg")}</Alert>;
  if (!canView) return <AccessDenied message={t("billing.accessDenied")} />;
  return <OrgBillingInner orgId={activeOrg.orgId} />;
}

function OrgBillingInner({ orgId }: { orgId: string }): JSX.Element {
  const t = useT();
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [billing, setBilling] = useState<BillingFull | null>(null);
  const [quota, setQuota] = useState<QuotaRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{ kind: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("billing.backendError")); setLoading(false); return; }
    const [o, b, q] = await Promise.all([
      getOrgOverview(client, orgId),
      getOrgBillingFull(client, orgId),
      fetchOrgQuota(client, orgId),
    ]);
    if (o.ok) setOverview(o.data); else setError(o.error);
    if (b.ok) setBilling(b.data); else if (!o.ok) setError(b.error);
    if (q.ok) setQuota(usageRollup(q.data));
    setLoading(false);
  }, [orgId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const performAction = async (kind: string) => {
    setActionResult(null); setActionBusy(true);
    const client = await getClient();
    if (!client) { setActionBusy(false); return setActionResult({ ok: false, message: t("billing.backendError") }); }
     
    const reason = kind === "cancel" ? "Cancelled by org admin" : "Reactivated by org admin";
    const res = await client.rpc("admin_set_subscription_status", { p_org: orgId, p_status: kind, p_reason: reason });
    const ok = !res.error;
    setActionBusy(false);
    if (ok) {
      setActionResult({ ok: true, message: `Subscription ${kind === "cancel" ? "cancelled" : "reactivated"} successfully.` });
      void reload();
    } else {
      setActionResult({ ok: false, message: String(res.error?.message ?? res.error) });
    }
  };

  const sub = billing?.subscription;

  return (
    <div className="max-w-3xl mx-auto space-y-5 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">{t("billing.title")}</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div> : !overview ? <div className="text-sm text-fg-secondary">{t("billing.noData")}</div> : (
        <>
          {/* â”€â”€ Plan card â”€â”€ */}
          <Card padding="lg" title={<div>
            <div className="text-xs text-fg-tertiary uppercase tracking-wider">{t("billing.currentPlan")}</div>
            <div className="text-xl font-display font-bold text-fg-primary">{PLAN_LABEL[overview.plan] ?? overview.plan}</div>
          </div>} action={sub && <Badge tone={subTone(sub.status)}>{sub.status}</Badge>}>
            {billing?.alerts && billing.alerts.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {billing.alerts.map((a, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[12px] p-2 rounded-lg ${
                    a.severity === "danger" ? "bg-error-tint text-error" :
                    a.severity === "warning" ? "bg-warning-tint text-warning" :
                    "bg-info-tint text-info"
                  }`}>
                    <Icon name="alert" size={14} />
                    {a.message}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* â”€â”€ Usage meters (users + projects) â”€â”€ */}
          {quota && (
            <div className="grid gap-4 md:grid-cols-2">
              <QuotaMeter resource="users" rollup={quota} />
              <QuotaMeter resource="projects" rollup={quota} />
            </div>
          )}

          {/* â”€â”€ Subscription details â”€â”€ */}
          <Card padding="lg" title={<div className="text-xs text-fg-tertiary uppercase tracking-wider">{t("billing.subscription")}</div>} action={<div className="flex items-center gap-2">
            {sub && ["active", "trial"].includes(sub.status) && (
              <Button size="sm" variant="ghost" onClick={() => { setAction({ kind: "cancel" }); setActionResult(null); }}>
                Cancel
              </Button>
            )}
            {sub && ["paused", "cancelled"].includes(sub.status) && (
              <Button size="sm" variant="primary" onClick={() => performAction("active")}>
                Reactivate
              </Button>
            )}
            {sub && sub.status === "past_due" && (
              <span className="text-[11px] text-fg-tertiary">Contact support to resolve payment</span>
            )}
          </div>}>
            {sub ? (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-fg-secondary">{t("billing.status")}</dt>
                <dd className="text-fg-primary text-right font-medium"><Badge tone={subTone(sub.status)}>{sub.status}</Badge></dd>
                <dt className="text-fg-secondary">{t("billing.provider")}</dt><dd className="text-fg-primary text-right capitalize">{sub.provider || "—"}</dd>
                <dt className="text-fg-secondary">{t("billing.renewsEnds")}</dt><dd className="text-fg-primary text-right">{fmtDate(sub.currentPeriodEnd)}</dd>
                <dt className="text-fg-secondary">{t("billing.trialEnds")}</dt><dd className="text-fg-primary text-right">{fmtDate(sub.trialEndsAt)}</dd>
                {sub.cancelledAt ? (
                  <><dt className="text-fg-secondary">Cancelled at</dt><dd className="text-fg-primary text-right">{fmtDate(sub.cancelledAt)}</dd></>
                ) : null}
                {sub.gracePeriodEndsAt ? (
                  <><dt className="text-fg-secondary">Grace period ends</dt><dd className="text-fg-primary text-right">{fmtDate(sub.gracePeriodEndsAt)}</dd></>
                ) : null}
              </dl>
            ) : <div className="text-sm text-fg-secondary">{t("billing.noSub", { plan: PLAN_LABEL[overview.plan] ?? overview.plan })}</div>}
          </Card>

          {/* â”€â”€ Cancel confirmation modal â”€â”€ */}
          <Modal open={!!action} onClose={() => { setAction(null); setActionResult(null); }} size="sm" title="Cancel subscription" footer={
            <div className="flex gap-2 flex-wrap">
              {actionResult?.ok ? (
                <Button size="sm" onClick={() => { setAction(null); setActionResult(null); }}>Done</Button>
              ) : (
                <>
                  <Button size="sm" variant="danger" loading={actionBusy}
                    onClick={() => void performAction("cancel")}>
                    {actionBusy ? "Cancelling..." : "Yes, cancel subscription"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAction(null); setActionResult(null); }} disabled={actionBusy}>Keep active</Button>
                </>
              )}
            </div>
          }>
            <div className="space-y-4">
              <p className="text-sm text-fg-secondary">Are you sure you want to cancel your subscription? You will lose access to paid features at the end of the billing period.</p>
              {actionResult && <Alert variant={actionResult.ok ? "success" : "danger"}>{actionResult.message}</Alert>}
            </div>
          </Modal>

          {/* â”€â”€ Billing history â”€â”€ */}
          <Card padding="lg" title={<div className="text-xs text-fg-tertiary uppercase tracking-wider">{t("billing.billingHistory")}</div>}>
          <DataTable dense columns={BILLING_COLUMNS} rows={billing?.billingHistory ?? []} rowKey={r => r.id} emptyMessage={t("billing.noHistory")} />
          </Card>

          {/* â”€â”€ Request upgrade card â”€â”€ */}
          <RequestUpgradeCard orgId={orgId} currentPlan={overview.plan} />
        </>
      )}
    </div>
  );
}

const BILLING_COLUMNS: Column<BillingHistoryItem>[] = [
  { key: "date", header: "Date", className: "flex-1 min-w-0", render: r => <span className="text-sm text-fg-primary">{fmtDate(r.paidAt)}</span> },
  { key: "amount", header: "Amount", className: "flex-shrink-0 font-medium", render: r => <span className="text-sm">{fmtMoney(r.amount, r.currency)}</span> },
  { key: "status", header: "Status", className: "flex-shrink-0", render: r => <Badge tone={r.status === "success" ? "success" : r.status === "pending" ? "warning" : "neutral"}>{r.status}</Badge> },
  { key: "invoice", header: "", className: "flex-shrink-0", render: r => r.invoiceUrl ? <a href={r.invoiceUrl} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-2 text-[11px] underline">Invoice</a> : <span className="text-sm text-fg-tertiary">\u2014</span> },
];

const ORDER = ["free", "basic", "pro", "business", "enterprise", "custom"];
const UPGRADE_TARGETS = ["pro", "business", "enterprise"];

function RequestUpgradeCard({ orgId, currentPlan }: { orgId: string; currentPlan: string }): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [desired, setDesired] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const curIdx = ORDER.indexOf(currentPlan);
  const targets = curIdx === -1 ? [] : UPGRADE_TARGETS.filter(pl => ORDER.indexOf(pl) > curIdx);

  const submit = async () => {
    setErr(null);
    if (!desired) return setErr(t("billing.errPickPlan"));
    setBusy(true);
    const client = await getClient();
    if (!client) { setBusy(false); return setErr(t("billing.backendError")); }
    const res = await requestPlanUpgrade(client, orgId, desired, note);
    setBusy(false);
    if (res.ok) { setDone(true); setOpen(false); } else setErr(res.error);
  };

  return (
    <Card padding="md" title={<div>
      <div className="font-semibold text-fg-primary">{t("billing.upgradeTitle")}</div>
      <div className="text-[13px] text-fg-secondary mt-0.5">{t("billing.upgradeSub")}</div>
    </div>} action={!open && !done && <Button onClick={() => setOpen(true)} leftIcon={<Icon name="trend" size={15} />}>{t("billing.requestUpgrade")}</Button>}>

      {done && <div className="mt-3 rounded-lg bg-success-tint border border-success p-3 text-[13px] text-success">{t("billing.requestSent")}</div>}

      {open && (
        <div className="mt-4 border-t border-default pt-4 space-y-3">
          {err && <Alert variant="danger">{err}</Alert>}
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("billing.moveToPlan")}</span>
            <Select value={desired} onChange={e => setDesired(e.target.value)} className="mt-1" options={[{ value: "", label: t("billing.choosePlan") }, ...targets.map(pl => ({ value: pl, label: PLAN_LABEL[pl] ?? pl }))]} />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("billing.noteLabel")}</span>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={t("billing.notePlaceholder")} className="w-full mt-1 px-3 py-2.5 border border-default rounded-lg text-sm bg-panel" />
          </label>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={submit} loading={busy}>{busy ? t("billing.sending") : t("billing.sendRequest")}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>{t("billing.cancel")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
