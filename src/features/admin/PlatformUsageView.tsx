// SiteTrack Pro — Platform Usage Analytics admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { Card, Spinner, AccessDenied } from "@/components/ui/atoms";
import { getUsageStats, type UsageStats } from "@/app/platformUsageQueries";


import { getClient } from "@/lib/supabase";
export function PlatformUsageView(): JSX.Element {
  const can = useCan("platform:orgs:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;

  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const res = await getUsageStats(client);
    if (res.ok) setStats(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading || !stats) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-black text-ink-900 mb-1">Usage Analytics</h1>
      <p className="text-ink-400 text-sm mb-6">Aggregate platform metrics</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs font-bold tracking-wider text-ink-500 uppercase mb-1">Orgs</div>
          <div className="text-3xl font-light">{stats.orgs}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-bold tracking-wider text-ink-500 uppercase mb-1">Users</div>
          <div className="text-3xl font-light">{stats.users}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-bold tracking-wider text-ink-500 uppercase mb-1">Projects</div>
          <div className="text-3xl font-light">{stats.projects}</div>
        </Card>
      </div>
      <div className="bg-amber-50 rounded-2xl p-4 border-l-4 border-amber-500 text-sm text-amber-900">
        DAU/WAU/MAU counters require a materialized view on activity_log, refreshed by cron. Build after backend go-live.
      </div>
    </div>
  );
}
