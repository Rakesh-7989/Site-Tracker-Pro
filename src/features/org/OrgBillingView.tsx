// SiteTrack Pro — Org Billing (/org/billing). Read-only plan + seat usage +
// subscription snapshot (org_admin_overview RPC, migration 77). No payment
// action here — billing changes go through the provider portal.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Badge, Button, Spinner, Alert, AccessDenied, Icon } from "@/components/ui/atoms";
import { requestPlanUpgrade } from "@/app/upgradeQueries";
import { getOrgOverview, PLAN_LABEL, PLAN_SEATS, type OrgOverview } from "@/app/orgAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const fmtDate = (iso: string | null): string => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const statusTone = (s: string): "neutral" | "success" | "warning" | "danger" | "info" => (s === "active" ? "success" : s === "trial" ? "info" : s === "past_due" ? "warning" : s === "cancelled" ? "danger" : "neutral");

export function OrgBillingView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("org:billing:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canView) return <AccessDenied message="Billing access requires org admin." />;
  return <OrgBillingInner orgId={activeOrg.orgId} />;
}

function OrgBillingInner({ orgId }: { orgId: string }): JSX.Element {
  const [data, setData] = useState<OrgOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getOrgOverview(client, orgId); if (res.ok) setData(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const seats = data ? PLAN_SEATS[data.plan] ?? null : null;
  const used = data?.memberCount ?? 0;
  const pct = seats ? Math.min(100, Math.round((used / seats) * 100)) : 0;
  const over = seats != null && used > seats;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink-900">Billing</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div> : !data ? <div className="text-sm text-ink-500">No billing data.</div> : (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-ink-400 uppercase tracking-wider">Current plan</div>
                <div className="text-xl font-display font-bold text-ink-900">{PLAN_LABEL[data.plan] ?? data.plan}</div>
              </div>
              {data.sub && <Badge tone={statusTone(data.sub.status)}>{data.sub.status}</Badge>}
            </div>
          </Card>

          <Card className="p-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-ink-800">Seats</span>
              <span className={over ? "text-rose-600 font-semibold" : "text-ink-600"}>{used} {seats != null ? `/ ${seats}` : "(unlimited)"}</span>
            </div>
            {seats != null && (
              <div className="h-2 rounded-full bg-cream-100 overflow-hidden">
                <div className={`h-full rounded-full ${over ? "bg-rose-400" : pct > 80 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
              </div>
            )}
            {over && <div className="text-[11px] text-rose-600">Over seat limit — upgrade your plan to add more members.</div>}
          </Card>

          <Card className="p-5">
            <div className="text-xs text-ink-400 uppercase tracking-wider mb-2">Subscription</div>
            {data.sub ? (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-500">Provider</dt><dd className="text-ink-800 text-right capitalize">{data.sub.provider || "—"}</dd>
                <dt className="text-ink-500">Status</dt><dd className="text-ink-800 text-right">{data.sub.status || "—"}</dd>
                <dt className="text-ink-500">Renews / ends</dt><dd className="text-ink-800 text-right">{fmtDate(data.sub.currentPeriodEnd)}</dd>
                <dt className="text-ink-500">Trial ends</dt><dd className="text-ink-800 text-right">{fmtDate(data.sub.trialEndsAt)}</dd>
              </dl>
            ) : <div className="text-sm text-ink-500">No active subscription on record. You&apos;re on the default {PLAN_LABEL[data.plan] ?? data.plan} plan.</div>}
          </Card>

          <RequestUpgradeCard orgId={orgId} currentPlan={data.plan} />
        </>
      )}
    </div>
  );
}

const UPGRADE_TARGETS = ["pro", "business", "enterprise"];

function RequestUpgradeCard({ orgId, currentPlan }: { orgId: string; currentPlan: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [desired, setDesired] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Only offer plans above the current one.
  const order = ["free", "basic", "pro", "business", "enterprise"];
  const targets = UPGRADE_TARGETS.filter(t => order.indexOf(t) > order.indexOf(currentPlan));

  const submit = async () => {
    setErr(null);
    if (!desired) return setErr("Pick a plan you'd like to move to.");
    setBusy(true);
    const client = await getClient();
    if (!client) { setBusy(false); return setErr("Backend not configured."); }
    const res = await requestPlanUpgrade(client, orgId, desired, note);
    setBusy(false);
    if (res.ok) { setDone(true); setOpen(false); } else setErr(res.error);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-ink-800">Need more? Upgrade your plan</div>
          <div className="text-[13px] text-ink-500 mt-0.5">Send a request — our team contacts you to move you up.</div>
        </div>
        {!open && !done && <Button onClick={() => setOpen(true)} leftIcon={<Icon name="trend" size={15} />}>Request an upgrade</Button>}
      </div>

      {done && <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-700">✅ Request sent — our team will reach out to you shortly.</div>}

      {open && (
        <div className="mt-4 border-t border-cream-100 pt-4 space-y-3">
          {err && <Alert variant="danger">{err}</Alert>}
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Move to plan</span>
            <select value={desired} onChange={e => setDesired(e.target.value)} className="w-full mt-1 px-3 py-2.5 border border-cream-200 rounded-lg text-sm bg-white">
              <option value="">Choose a plan…</option>
              {targets.map(t => <option key={t} value={t}>{PLAN_LABEL[t] ?? t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Anything we should know? (optional)</span>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. need RERA filing + more seats" className="w-full mt-1 px-3 py-2.5 border border-cream-200 rounded-lg text-sm bg-white" />
          </label>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy} leftIcon={busy ? <Spinner size={15} /> : null}>{busy ? "Sending…" : "Send request"}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
