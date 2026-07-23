// SiteTrack Pro â€” Platform Billing & MRR admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { Card, Spinner, AccessDenied } from "@/components/ui/atoms";
import { listOrgBillingRows, type OrgBillingRow } from "@/app/platformBillingQueries";


import { getClient } from "@/lib/supabase";
export function PlatformBillingView(): JSX.Element {
  const can = useCan("platform:billing:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;

  const [orgs, setOrgs] = useState<OrgBillingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const res = await listOrgBillingRows(client);
    if (res.ok) setOrgs(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  const active = orgs.filter(o => o.status === "active");
  const trial = orgs.filter(o => o.status === "trial");
  const totalMRR = active.reduce((s, o) => s + (o.mrr || 0), 0);
  const byPlan = ["basic", "pro", "business", "enterprise", "custom"].map(p => ({
    plan: p,
    orgs: active.filter(o => o.plan === p),
    mrr: active.filter(o => o.plan === p).reduce((s, o) => s + (o.mrr || 0), 0),
  }));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-ink-900">Billing & MRR</h1>
        <p className="text-ink-400 text-sm mt-1">{active.length} active, {trial.length} trial</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs font-bold tracking-wider text-ink-500 uppercase mb-1">MRR</div>
          <div className="text-3xl font-light text-ink-900">â‚¹{totalMRR.toLocaleString("en-IN")}</div>
          <div className="text-xs text-ink-400 mt-1">{active.length} active subs</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-bold tracking-wider text-ink-500 uppercase mb-1">ARR</div>
          <div className="text-3xl font-light text-ink-900">â‚¹{(totalMRR * 12).toLocaleString("en-IN")}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-bold tracking-wider text-ink-500 uppercase mb-1">Active</div>
          <div className="text-3xl font-light text-ink-900">{active.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-bold tracking-wider text-ink-500 uppercase mb-1">Trial / Suspended</div>
          <div className="text-3xl font-light text-ink-900">{trial.length} / {orgs.filter(o => o.status === "suspended").length}</div>
        </Card>
      </div>
      <Card className="p-6">
        <h2 className="font-bold text-lg mb-4">Revenue by plan</h2>
        <div className="space-y-4">
          {byPlan.map(p => {
            const share = totalMRR ? Math.round((p.mrr / totalMRR) * 100) : 0;
            return (
              <div key={p.plan}>
                <div className="flex justify-between mb-1 text-sm">
                  <span className="font-semibold capitalize">{p.plan}</span>
                  <span>â‚¹{p.mrr.toLocaleString("en-IN")} ({share}%)</span>
                </div>
                <div className="w-full bg-stone-200 rounded-full h-2">
                  <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${share}%` }} />
                </div>
                <div className="text-xs text-ink-400 mt-0.5">{p.orgs.length} orgs</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
