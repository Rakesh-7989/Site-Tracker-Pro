// SiteTrack Pro — <QuotaMeter> / <QuotaGate>: usage meter + upgrade nudge.
//
// <QuotaMeter> shows a progress bar with used/max for a resource.
// <QuotaGate> wraps children; if at quota, renders an upgrade banner instead
// (soft gate — hard enforcement is DB triggers / server-side).

import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import { Card, Icon, Badge, ProgressBar, Spinner } from "@/components/ui/atoms";
import { useOrgSwitcher } from "./useOrgSwitcher";
import { usePlanCaps } from "./usePlanCaps";
import { usageRollup, type QuotaRollup } from "@/app/queries/quotaQueries";

const PLAN_LABELS: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", enterprise: "Enterprise", custom: "Enterprise" };

const RESOURCE_LABEL: Record<string, string> = { users: "Seats", projects: "Projects" };

function getNextPlan(current: string): string {
  const order = ["free", "basic", "pro", "business", "enterprise", "custom"];
  const idx = order.indexOf(current);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : order[order.length - 1];
}

interface QuotaMeterProps {
  resource: "users" | "projects";
  rollup: QuotaRollup;
}

export function QuotaMeter({ resource, rollup }: QuotaMeterProps): JSX.Element {
  const row = rollup[resource];
  const pct = row.pct;
  const atLimit = row.atQuota;
  const unlimited = row.max === null;
  const used = row.current;
  const max = row.max;

  return (
    <Card padding="lg" title={<span className="font-semibold text-fg-primary">{RESOURCE_LABEL[resource]}</span>} action={<span className={atLimit ? "text-error font-semibold" : "text-fg-secondary"}>{unlimited ? `${used} / ∞` : `${used} / ${max}`}</span>}>
      <div className="space-y-2">
        {!unlimited && (
          <ProgressBar value={pct ?? 0} color={atLimit ? "red" : pct && pct > 80 ? "orange" : "emerald"} />
        )}
        {unlimited && <div className="text-[11px] text-fg-tertiary">Unlimited on this plan</div>}
        {atLimit && <div className="text-[11px] text-error">Limit reached — upgrade to add more</div>}
      </div>
    </Card>
  );
}

interface QuotaGateProps {
  resource: "users" | "projects";
  children: ReactNode;
  fallback?: ReactNode;
}

export function QuotaGate({ resource, children, fallback }: QuotaGateProps): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const orgId = activeOrg?.orgId ?? null;
  const { plan, loading: capsLoading } = usePlanCaps();
  const [rollup, setRollup] = useState<QuotaRollup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) { setRollup(null); setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        const mod = await import("@/lib/supabase/supabase");
        const client = await (mod as { getSupabaseClient: () => Promise<import("@/lib/supabase/db").TypedSupabaseClient> }).getSupabaseClient();
        if (!client) { if (!cancelled) { setRollup(null); setLoading(false); } return; }
        const { fetchOrgQuota } = await import("@/app/queries/quotaQueries");
        const res = await fetchOrgQuota(client, orgId);
        if (cancelled) return;
        if (res.ok) setRollup(usageRollup(res.data));
        setLoading(false);
      } catch { if (!cancelled) { setRollup(null); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // SEC-05 fail-closed: while usage/plan data loads we render a neutral
  // placeholder — never children (would grant before quota is known) and never
  // the upgrade card (would flash at a legitimately-entitled user).
  if (loading || capsLoading) return <QuotaGateLoading />;
  if (!rollup) return <QuotaGateUnknown />; // fetch error → deny, not grant

  const atLimit = rollup[resource].atQuota;
  if (!atLimit) return <>{children}</>;

  if (fallback !== undefined) return <>{fallback}</>;

  const currentPlan = plan ?? "basic";
  const nextPlan = PLAN_LABELS[getNextPlan(currentPlan)] ?? "a higher plan";

  return (
    <Card className="p-6 border-warning bg-warning-tint/60 text-center max-w-md mx-auto">
      <div className="w-11 h-11 rounded-xl bg-warning-tint text-warning grid place-items-center mx-auto mb-3"><Icon name="lock" size={20} /></div>
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="font-semibold text-fg-primary">{RESOURCE_LABEL[resource]} limit reached</span>
        <Badge tone="warning">{nextPlan}+</Badge>
      </div>
      <p className="text-sm text-fg-secondary">Your {RESOURCE_LABEL[resource].toLowerCase()} limit for the <b>{PLAN_LABELS[currentPlan] ?? currentPlan}</b> plan has been reached.</p>
      <Link to="/org/billing" className="inline-block mt-4 text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-4 py-2 rounded-lg transition">
        View plans & upgrade →
      </Link>
    </Card>
  );
}

/** Neutral "checking usage" placeholder — the fail-closed loading state. */
function QuotaGateLoading(): JSX.Element {
  return (
    <Card className="p-6 text-center max-w-md mx-auto">
      <div className="flex items-center justify-center gap-2 text-fg-secondary text-sm">
        <Spinner size={16} />
        <span>Checking usage limits…</span>
      </div>
    </Card>
  );
}

/** Fail-closed state when the usage fetch errors (unknown ≠ under-quota). */
function QuotaGateUnknown(): JSX.Element {
  return (
    <Card className="p-6 text-center max-w-md mx-auto">
      <div className="w-11 h-11 rounded-xl bg-bg-secondary text-fg-tertiary grid place-items-center mx-auto mb-3"><Icon name="shield" size={20} /></div>
      <div className="text-sm text-fg-secondary">Couldn’t verify usage limits. Please retry.</div>
    </Card>
  );
}