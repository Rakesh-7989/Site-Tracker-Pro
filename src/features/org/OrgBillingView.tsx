// SiteTrack Pro — Org Billing (/org/billing). Plan, seat usage, subscription
// lifecycle management (view, cancel, reactivate), billing history, alerts.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Button, Spinner, Alert, AccessDenied, Icon } from "@/components/ui/atoms";
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
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink-900">{t("billing.title")}</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div> : !overview ? <div className="text-sm text-ink-500">{t("billing.noData")}</div> : (
        <>
          {/* â”€â”€ Plan card â”€â”€ */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-ink-400 uppercase tracking-wider">{t("billing.currentPlan")}</div>
                <div className="text-xl font-display font-bold text-ink-900">{PLAN_LABEL[overview.plan] ?? overview.plan}</div>
              </div>
              {sub && <Badge tone={subTone(sub.status)}>{sub.status}</Badge>}
            </div>
            {billing?.alerts && billing.alerts.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {billing.alerts.map((a, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[12px] p-2 rounded-lg ${
                    a.severity === "danger" ? "bg-red-50 text-red-700" :
                    a.severity === "warning" ? "bg-amber-50 text-amber-700" :
                    "bg-blue-50 text-blue-700"
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
              <span className="font-semibold text-ink-800">{t("billing.seats")}</span>
              <span className={over ? "text-rose-600 font-semibold" : "text-ink-600"}>{used} {seats != null ? `/ ${seats}` : t("billing.unlimited")}</span>
            </div>
            {seats != null && (
              <div className="h-2 rounded-full bg-cream-100 overflow-hidden">
                <div className={`h-full rounded-full ${over ? "bg-rose-400" : pct > 80 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
              </div>
            )}
            {over && <div className="text-[11px] text-rose-600">{t("billing.overLimit")}</div>}
          </Card>

          {/* â”€â”€ Subscription details â”€â”€ */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-xs text-ink-400 uppercase tracking-wider">{t("billing.subscription")}</div>
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
                <span className="text-[11px] text-ink-400">Contact support to resolve payment</span>
              )}
            </div>
            {sub ? (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-500">{t("billing.status")}</dt>
                <dd className="text-ink-800 text-right font-medium"><Badge tone={subTone(sub.status)}>{sub.status}</Badge></dd>
                <dt className="text-ink-500">{t("billing.provider")}</dt><dd className="text-ink-800 text-right capitalize">{sub.provider || "—"}</dd>
                <dt className="text-ink-500">{t("billing.renewsEnds")}</dt><dd className="text-ink-800 text-right">{fmtDate(sub.currentPeriodEnd)}</dd>
                <dt className="text-ink-500">{t("billing.trialEnds")}</dt><dd className="text-ink-800 text-right">{fmtDate(sub.trialEndsAt)}</dd>
                {sub.cancelledAt ? (
                  <><dt className="text-ink-500">Cancelled at</dt><dd className="text-ink-800 text-right">{fmtDate(sub.cancelledAt)}</dd></>
                ) : null}
                {sub.gracePeriodEndsAt ? (
                  <><dt className="text-ink-500">Grace period ends</dt><dd className="text-ink-800 text-right">{fmtDate(sub.gracePeriodEndsAt)}</dd></>
                ) : null}
              </dl>
            ) : <div className="text-sm text-ink-500">{t("billing.noSub", { plan: PLAN_LABEL[overview.plan] ?? overview.plan })}</div>}
          </Card>

          {/* â”€â”€ Cancel confirmation modal â”€â”€ */}
          {action && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/30" onClick={() => { setAction(null); setActionResult(null); }}>
              <div className="w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}><Card className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display font-bold text-ink-900">Cancel subscription</h3>
                  <button onClick={() => { setAction(null); setActionResult(null); }} className="text-ink-400 hover:text-ink-700 p-1">
                    <Icon name="x" size={18} />
                  </button>
                </div>
                <p className="text-sm text-ink-600">Are you sure you want to cancel your subscription? You will lose access to paid features at the end of the billing period.</p>
                {actionResult && <Alert variant={actionResult.ok ? "success" : "danger"}>{actionResult.message}</Alert>}
                <div className="flex gap-2">
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
            <div className="text-xs text-ink-400 uppercase tracking-wider mb-3">{t("billing.billingHistory")}</div>
            {(!billing?.billingHistory || billing.billingHistory.length === 0) ? (
              <div className="text-sm text-ink-500">{t("billing.noHistory")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-ink-400 uppercase tracking-wider">
                    <th className="text-left pb-2 font-medium">Date</th>
                    <th className="text-right pb-2 font-medium">Amount</th>
                    <th className="text-right pb-2 font-medium">Status</th>
                    <th className="text-right pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {billing.billingHistory.map((bh: BillingHistoryItem) => (
                    <tr key={bh.id} className="text-ink-700">
                      <td className="py-2 text-left">{fmtDate(bh.paidAt)}</td>
                      <td className="py-2 text-right font-medium">{fmtMoney(bh.amount, bh.currency)}</td>
                      <td className="py-2 text-right"><Badge tone={bh.status === "success" ? "success" : bh.status === "pending" ? "warning" : "neutral"}>{bh.status}</Badge></td>
                      <td className="py-2 text-right">
                        {bh.invoiceUrl ? (
                          <a href={bh.invoiceUrl} target="_blank" rel="noreferrer" className="text-safety-500 hover:text-safety-600 text-[11px] underline">Invoice</a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* â”€â”€ Request upgrade card â”€â”€ */}
          <RequestUpgradeCard orgId={orgId} currentPlan={overview.plan} />
        </>
      )}
    </div>
  );
}

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
          <div className="font-semibold text-ink-800">{t("billing.upgradeTitle")}</div>
          <div className="text-[13px] text-ink-500 mt-0.5">{t("billing.upgradeSub")}</div>
        </div>
        {!open && !done && <Button onClick={() => setOpen(true)} leftIcon={<Icon name="trend" size={15} />}>{t("billing.requestUpgrade")}</Button>}
      </div>

      {done && <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-700">{t("billing.requestSent")}</div>}

      {open && (
        <div className="mt-4 border-t border-cream-100 pt-4 space-y-3">
          {err && <Alert variant="danger">{err}</Alert>}
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{t("billing.moveToPlan")}</span>
            <select value={desired} onChange={e => setDesired(e.target.value)} className="w-full mt-1 px-3 py-2.5 border border-cream-200 rounded-lg text-sm bg-white">
              <option value="">{t("billing.choosePlan")}</option>
              {targets.map(pl => <option key={pl} value={pl}>{PLAN_LABEL[pl] ?? pl}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{t("billing.noteLabel")}</span>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={t("billing.notePlaceholder")} className="w-full mt-1 px-3 py-2.5 border border-cream-200 rounded-lg text-sm bg-white" />
          </label>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy} leftIcon={busy ? <Spinner size={15} /> : null}>{busy ? t("billing.sending") : t("billing.sendRequest")}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>{t("billing.cancel")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
