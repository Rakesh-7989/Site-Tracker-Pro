// SiteTrack Pro — Org Billing (/org/billing). Plan, seat usage, subscription
// lifecycle management (view, cancel, reactivate), billing history, alerts.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Button, Spinner, Alert, AccessDenied, Icon } from "@/components/ui/atoms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { requestPlanUpgrade } from "@/app/upgradeQueries";
import { getOrgOverview, getOrgBillingFull, PLAN_LABEL, PLAN_SEATS, type OrgOverview, type BillingFull, type BillingHistoryItem } from "@/app/orgAdminQueries";
import { useT } from "@/i18n/I18nProvider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{ kind: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("billing.backendError")); setLoading(false); return; }
    const [o, b] = await Promise.all([
      getOrgOverview(client, orgId),
      getOrgBillingFull(client, orgId),
    ]);
    if (o.ok) setOverview(o.data); else setError(o.error);
    if (b.ok) setBilling(b.data); else if (!o.ok) setError(b.error);
    setLoading(false);
  }, [orgId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const performAction = async (kind: string) => {
    setActionResult(null); setActionBusy(true);
    const client = await getClient();
    if (!client) { setActionBusy(false); return setActionResult({ ok: false, message: t("billing.backendError") }); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reason = kind === "cancel" ? "Cancelled by org admin" : "Reactivated by org admin";
    const res = await (client.rpc as any)("admin_set_subscription_status", { p_org: orgId, p_status: kind, p_reason: reason });
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
  const seats = overview ? PLAN_SEATS[overview.plan] ?? null : null;
  const used = overview?.memberCount ?? 0;
  const pct = seats ? Math.min(100, Math.round((used / seats) * 100)) : 0;
  const over = seats != null && used > seats;

  return (
    <div className="max-w-3xl mx-auto space-y-5 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">{t("billing.title")}</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div> : !overview ? <div className="text-sm text-fg-secondary">{t("billing.noData")}</div> : (
        <>
          {/* â”€â”€ Plan card â”€â”€ */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-fg-tertiary uppercase tracking-wider">{t("billing.currentPlan")}</div>
                <div className="text-xl font-display font-bold text-fg-primary">{PLAN_LABEL[overview.plan] ?? overview.plan}</div>
              </div>
              {sub && <Badge tone={subTone(sub.status)}>{sub.status}</Badge>}
            </div>
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

          {/* â”€â”€ Seat usage â”€â”€ */}
          <Card className="p-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-fg-primary">{t("billing.seats")}</span>
              <span className={over ? "text-error font-semibold" : "text-fg-secondary"}>{used} {seats != null ? `/ ${seats}` : t("billing.unlimited")}</span>
            </div>
            {seats != null && (
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className={`h-full rounded-full ${over ? "bg-error" : pct > 80 ? "bg-accent" : "bg-success"}`} style={{ width: `${pct}%` }} />
              </div>
            )}
            {over && <div className="text-[11px] text-error">{t("billing.overLimit")}</div>}
          </Card>

          {/* â”€â”€ Subscription details â”€â”€ */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-xs text-fg-tertiary uppercase tracking-wider">{t("billing.subscription")}</div>
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
            </div>
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
          {action && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/30" onClick={() => { setAction(null); setActionResult(null); }}>
              <div className="w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}><Card className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display font-bold text-fg-primary">Cancel subscription</h3>
                  <button onClick={() => { setAction(null); setActionResult(null); }} className="text-fg-tertiary hover:text-fg-primary p-1">
                    <Icon name="x" size={18} />
                  </button>
                </div>
                <p className="text-sm text-fg-secondary">Are you sure you want to cancel your subscription? You will lose access to paid features at the end of the billing period.</p>
                {actionResult && <Alert variant={actionResult.ok ? "success" : "danger"}>{actionResult.message}</Alert>}
                <div className="flex gap-2 flex-wrap">
                  {actionResult?.ok ? (
                    <Button size="sm" onClick={() => { setAction(null); setActionResult(null); }}>Done</Button>
                  ) : (
                    <>
                      <Button size="sm" variant="danger" disabled={actionBusy} leftIcon={actionBusy ? <Spinner size={14} /> : undefined}
                        onClick={() => void performAction("cancel")}>
                        {actionBusy ? "Cancelling..." : "Yes, cancel subscription"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAction(null); setActionResult(null); }} disabled={actionBusy}>Keep active</Button>
                    </>
                  )}
                </div>
              </Card>
              </div>
            </div>
          )}

          {/* â”€â”€ Billing history â”€â”€ */}
          <Card className="p-5">
            <div className="text-xs text-fg-tertiary uppercase tracking-wider mb-3">{t("billing.billingHistory")}</div>
          <DataTable columns={BILLING_COLUMNS} rows={billing?.billingHistory ?? []} rowKey={r => r.id} emptyMessage={t("billing.noHistory")} />
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
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-fg-primary">{t("billing.upgradeTitle")}</div>
          <div className="text-[13px] text-fg-secondary mt-0.5">{t("billing.upgradeSub")}</div>
        </div>
        {!open && !done && <Button onClick={() => setOpen(true)} leftIcon={<Icon name="trend" size={15} />}>{t("billing.requestUpgrade")}</Button>}
      </div>

      {done && <div className="mt-3 rounded-lg bg-success-tint border border-success p-3 text-[13px] text-success">{t("billing.requestSent")}</div>}

      {open && (
        <div className="mt-4 border-t border-default pt-4 space-y-3">
          {err && <Alert variant="danger">{err}</Alert>}
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("billing.moveToPlan")}</span>
            <select value={desired} onChange={e => setDesired(e.target.value)} className="w-full mt-1 px-3 py-2.5 border border-default rounded-lg text-sm bg-panel">
              <option value="">{t("billing.choosePlan")}</option>
              {targets.map(pl => <option key={pl} value={pl}>{PLAN_LABEL[pl] ?? pl}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("billing.noteLabel")}</span>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={t("billing.notePlaceholder")} className="w-full mt-1 px-3 py-2.5 border border-default rounded-lg text-sm bg-panel" />
          </label>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={submit} disabled={busy} leftIcon={busy ? <Spinner size={15} /> : null}>{busy ? t("billing.sending") : t("billing.sendRequest")}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>{t("billing.cancel")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
