// SiteTrack Pro — Subscription alert banner. Renders below TopBar when the
// active org has an active subscription alert (past_due, cancelled, paused,
// trial ending). Dismissible for non-danger alerts.

import { useEffect, useState, useRef } from "react";
import { useOrgSwitcher } from "@/auth";
import { Icon } from "@/components/ui/atoms";
import { getOrgSubscriptionAlerts, type BillingAlert } from "@/app/orgAdminQueries";
import { Link } from "react-router-dom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import { getClient } from "@/lib/supabase";
const bg: Record<string, string> = {
  danger: "bg-red-600 text-white",
  warning: "bg-amber-500 text-white",
  info: "bg-blue-600 text-white",
};

export function SubscriptionBanner(): JSX.Element | null {
  const { activeOrg } = useOrgSwitcher();
  const [alerts, setAlerts] = useState<BillingAlert[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const lastOrgRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeOrg) { setAlerts([]); return; }
    if (lastOrgRef.current === activeOrg.orgId) return;
    lastOrgRef.current = activeOrg.orgId;
    setDismissed(false);
    let cancelled = false;
    (async () => {
      const client = await getClient();
      if (!client) return;
      const res = await getOrgSubscriptionAlerts(client, activeOrg.orgId);
      if (!cancelled) setAlerts(res.ok ? res.data : []);
    })();
    return () => { cancelled = true; };
  }, [activeOrg]);

  if (!activeOrg || alerts.length === 0 || dismissed) return null;

  // Only show the highest-severity alert
  const order = ["danger", "warning", "info"];
  const alert = alerts.reduce((a, b) =>
    order.indexOf(a.severity) < order.indexOf(b.severity) ? a : b
  );

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-1.5 text-[13px] font-medium ${bg[alert.severity] ?? "bg-ink-600 text-white"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon name="alert" size={14} className="shrink-0" />
        <span className="truncate">{alert.message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {alert.actionLabel && alert.actionRoute && (
          <Link to={alert.actionRoute} className="underline font-semibold hover:opacity-80">{alert.actionLabel}</Link>
        )}
        {alert.severity !== "danger" && (
          <button onClick={() => setDismissed(true)} className="p-0.5 hover:opacity-80" aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
