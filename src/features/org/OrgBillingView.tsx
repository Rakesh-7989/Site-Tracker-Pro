// SiteTrack Pro — Org Billing (/org/billing). Read-only plan + seat usage +
// subscription snapshot (org_admin_overview RPC, migration 77). No payment
// action here — billing changes go through the provider portal.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Button, Spinner, Alert, AccessDenied, Icon } from "@/components/ui/atoms";
import { requestPlanUpgrade } from "@/app/upgradeQueries";
import { getOrgOverview, PLAN_LABEL, PLAN_SEATS, type OrgOverview } from "@/app/orgAdminQueries";
import { useT } from "@/i18n/I18nProvider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const fmtDate = (iso: string | null): string => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const statusTone = (s: string): "neutral" | "success" | "warning" | "danger" | "info" => (s === "active" ? "success" : s === "trial" ? "info" : s === "past_due" ? "warning" : s === "cancelled" ? "danger" : "neutral");

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
  const [data, setData] = useState<OrgOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("billing.backendError")); setLoading(false); return; }
    const res = await getOrgOverview(client, orgId); if (res.ok) setData(res.data); else setError(res.error); setLoading(false);
  }, [orgId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const seats = data ? PLAN_SEATS[data.plan] ?? null : null;
  const used = data?.memberCount ?? 0;
  const pct = seats ? Math.min(100, Math.round((used / seats) * 100)) : 0;
  const over = seats != null && used > seats;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink-900">{t("billing.title")}</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div> : !data ? <div className="text-sm text-ink-500">{t("billing.noData")}</div> : (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-ink-400 uppercase tracking-wider">{t("billing.currentPlan")}</div>
                <div className="text-xl font-display font-bold text-ink-900">{PLAN_LABEL[data.plan] ?? data.plan}</div>
              </div>
              {data.sub && <Badge tone={statusTone(data.sub.status)}>{data.sub.status}</Badge>}
            </div>
          </Card>

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

          <Card className="p-5">
            <div className="text-xs text-ink-400 uppercase tracking-wider mb-2">{t("billing.subscription")}</div>
            {data.sub ? (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-500">{t("billing.provider")}</dt><dd className="text-ink-800 text-right capitalize">{data.sub.provider || "—"}</dd>
                <dt className="text-ink-500">{t("billing.status")}</dt><dd className="text-ink-800 text-right">{data.sub.status || "—"}</dd>
                <dt className="text-ink-500">{t("billing.renewsEnds")}</dt><dd className="text-ink-800 text-right">{fmtDate(data.sub.currentPeriodEnd)}</dd>
                <dt className="text-ink-500">{t("billing.trialEnds")}</dt><dd className="text-ink-800 text-right">{fmtDate(data.sub.trialEndsAt)}</dd>
              </dl>
            ) : <div className="text-sm text-ink-500">{t("billing.noSub", { plan: PLAN_LABEL[data.plan] ?? data.plan })}</div>}
          </Card>

          <RequestUpgradeCard orgId={orgId} currentPlan={data.plan} />
        </>
      )}
    </div>
  );
}

const UPGRADE_TARGETS = ["pro", "business", "enterprise"];

function RequestUpgradeCard({ orgId, currentPlan }: { orgId: string; currentPlan: string }): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [desired, setDesired] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Only offer plans above the current one.
  const order = ["free", "basic", "pro", "business", "enterprise"];
  const targets = UPGRADE_TARGETS.filter(pl => order.indexOf(pl) > order.indexOf(currentPlan));

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

      {done && <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-700">✅ {t("billing.requestSent")}</div>}

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
