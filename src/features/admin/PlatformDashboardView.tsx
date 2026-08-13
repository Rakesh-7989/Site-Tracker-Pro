// SiteTrack Pro — platform home (/admin, superadmin). Cross-tenant ops dashboard:
// KPI strip, plan mix, signup / support / upgrade queues, recent platform activity
// + manage quick links. Each panel loads independently (stats is the only hard gate).

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCanAny } from "@/auth";
import { Card, Badge, Alert, AccessDenied, StatCard, Icon } from "@/components/ui/atoms";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChartCard } from "@/components/ui/ChartCard";
import { BarChart, type ChartDatum } from "@/components/ui/Charts";
import { EmptyState } from "@/components/ui/EmptyState";
import type { IconName } from "@/components/ui/icons";
import { getPlatformStats, PLAN_LABEL, type PlatformStats } from "@/app/platformAdminQueries";
import { listSupportTickets, listOrgsBrief, type Ticket, type OrgBrief } from "@/app/platformSupportQueries";
import { listUpgradeRequests, type UpgradeRequest, type UpgradeStatus } from "@/app/upgradeQueries";
import { listAuditLog, type AuditLogRow } from "@/app/auditLogQueries";
import { getClient } from "@/lib/supabase";

const PLATFORM_CAPS = [
  "platform:users:manage",
  "platform:orgs:manage",
  "platform:billing:manage",
  "platform:settings:manage",
  "platform:impersonate",
  "platform:audit:read:cross-org",
  "platform:roles:configure",
  "platform:usage:view",
  "platform:support:manage",
  "platform:branding:manage",
  "platform:featureflags:manage",
] as const;

export const PLAN_ORDER = ["basic", "pro", "business", "custom"];

const LINKS: Array<{ to: string; label: string; icon: IconName; desc: string }> = [
  { to: "/admin/signups", label: "Signup requests", icon: "mail", desc: "Approve / reject new firms" },
  { to: "/admin/orgs", label: "Organizations", icon: "building", desc: "Every tenant + plans + MRR" },
  { to: "/admin/users", label: "Users", icon: "users", desc: "Everyone across tenants" },
  { to: "/admin/roles", label: "Role permissions", icon: "lock", desc: "Capabilities & custom roles" },
  { to: "/admin/audit", label: "Audit Log", icon: "shield", desc: "Immutable cross-org activity" },
  { to: "/admin/usage", label: "Usage", icon: "barChart", desc: "Cross-tenant stats" },
  { to: "/admin/billing", label: "Billing", icon: "credit-card", desc: "Revenue by plan" },
  { to: "/admin/settings", label: "Settings", icon: "sliders", desc: "Ops toggles & platform" },
];

export function PlatformDashboardView(): JSX.Element {
  const can = useCanAny(PLATFORM_CAPS);
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
  return <Inner />;
}

// ── Pure helpers (exported for the phase unit tests) ──────────────────────────

/** Chart data for the plan-mix bar (drops zero-count plans, canonical order). */
export function planMixData(plans: Record<string, number>): ChartDatum[] {
  return PLAN_ORDER
    .map(p => ({ label: PLAN_LABEL[p] ?? p, value: Number(plans[p] ?? 0) }))
    .filter(d => d.value > 0);
}

/** Non-closed tickets, most recent first. */
export function openTickets(tickets: Ticket[]): Ticket[] {
  return tickets
    .filter(t => t.status !== "closed")
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

export interface TicketFocus {
  count: number;
  rows: Ticket[];
}

/** { count, rows } for the support panel (count = non-closed). */
export function ticketFocus(tickets: Ticket[], limit = 4): TicketFocus {
  const rows = openTickets(tickets);
  return { count: rows.length, rows: rows.slice(0, limit) };
}

export interface UpgradeFocusRow {
  id: string;
  orgName: string;
  desiredPlan: string | null;
  status: UpgradeStatus;
  createdAt: string;
}

export interface UpgradeFocus {
  count: number;
  rows: UpgradeFocusRow[];
}

/** Active (open + in_progress) upgrade requests, most recent first. */
export function upgradeFocus(requests: UpgradeRequest[], limit = 5): UpgradeFocus {
  const active = requests
    .filter(r => r.status !== "closed")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    count: active.length,
    rows: active.slice(0, limit).map(r => ({
      id: r.id,
      orgName: r.orgName,
      desiredPlan: r.desiredPlan,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

/** Cap the cross-org activity feed rows. */
export function feedRows(rows: AuditLogRow[], limit = 10): AuditLogRow[] {
  return rows.slice(0, limit);
}

/** Org display name from the brief list (support panel join). */
export function orgNameFromBrief(orgs: OrgBrief[], orgId: string): string {
  return orgs.find(o => o.id === orgId)?.name ?? "Unknown org";
}

/** Compact relative-time label ("just now" / "5m ago" / "3h ago" / "2d ago"). */
export function agoLabel(ts: string): string {
  if (!ts) return "";
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Settled<T> { ok: boolean; data: T | null; error?: string }

type Lazy<T> = { ok: true; data: T } | { ok: false; error: string };

async function settle<T>(p: Promise<Lazy<T>>): Promise<Settled<T>> {
  try {
    const r = await p;
    if (r.ok) return { ok: true, data: r.data };
    return { ok: false, data: null, error: r.error };
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="space-y-6" role="status" aria-label="Loading platform">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-panel rounded-xl border border-default p-3 md:p-5 space-y-3">
            <Skeleton decorative height={10} width="w-16" />
            <Skeleton decorative height={24} width="w-12" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-panel rounded-xl border border-default p-4 space-y-3">
            <Skeleton decorative height={10} width="w-24" />
            <Skeleton decorative height={12} width="w-full" />
            <Skeleton decorative height={12} width="w-5/6" />
            <Skeleton decorative height={12} width="w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelUnavailable(): JSX.Element {
  return <div className="text-sm text-fg-tertiary text-center py-6">Unavailable.</div>;
}

function Inner(): JSX.Element {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [upgrades, setUpgrades] = useState<UpgradeRequest[] | null>(null);
  const [feed, setFeed] = useState<AuditLogRow[] | null>(null);
  const [orgs, setOrgs] = useState<OrgBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }

    const [sr, tr, ur, fr, or] = await Promise.all([
      settle(getPlatformStats(client)),
      settle(listSupportTickets(client)),
      settle(listUpgradeRequests(client, { limit: 50 })),
      settle(listAuditLog(client, undefined, { limit: 10 })),
      settle(listOrgsBrief(client)),
    ]);

    if (sr.ok && sr.data) setStats(sr.data); else setError(sr.error ?? "Failed to load platform stats.");
    setTickets(tr.ok ? tr.data : null);
    setUpgrades(ur.ok ? ur.data : null);
    setFeed(fr.ok ? fr.data : null);
    setOrgs(or.ok && or.data ? or.data : []);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const planData = planMixData(stats?.plans ?? {});
  const tf = ticketFocus(tickets ?? [], 4);
  const uf = upgradeFocus(upgrades ?? [], 5);
  const feedSlice = feedRows(feed ?? [], 10);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg-primary">Platform</h1>
          <div className="text-sm text-fg-secondary">Cross-tenant operations</div>
        </div>
        <Badge tone="danger">Superadmin</Badge>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? <DashboardSkeleton /> : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Organizations" value={stats?.orgCount ?? 0} />
            <StatCard label="Users" value={stats?.userCount ?? 0} />
            <StatCard label="Projects" value={stats?.projectCount ?? 0} />
            <StatCard
              label="Pending signups"
              value={(stats?.pendingSignups ?? 0) > 0
                ? <span className="text-accent">{stats?.pendingSignups ?? 0}</span>
                : (stats?.pendingSignups ?? 0)}
              sub={stats ? `${stats.approvedSignups} approved` : undefined}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Staff" value={stats?.staffCount ?? 0} />
            <StatCard label="Open tickets" value={tf.count} sub={tickets == null ? undefined : `${tickets.length} total`} />
            <StatCard label="Active upgrades" value={uf.count} />
            <StatCard label="Approved signups" value={stats?.approvedSignups ?? 0} />
          </div>

          {/* Plan mix + queues */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartCard
              title="Plan mix"
              subtitle="Organizations by plan"
              height={180}
              empty={planData.length === 0}
              emptyMessage="No organizations yet"
            >
              <BarChart data={planData} />
            </ChartCard>

            <Card padding="md" title="Support inbox" action={tf.count > 0 && (
              <Link to="/admin/support" className="text-[11px] font-semibold text-accent hover:text-accent-2">View all</Link>
            )}>
              {tickets == null ? <PanelUnavailable /> : tf.rows.length === 0 ? (
                <div className="text-sm text-fg-tertiary text-center py-6">No open tickets.</div>
              ) : (
                <div className="space-y-2.5">
                  {tf.rows.map(t => (
                    <div key={t.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-fg-primary truncate">{t.subject}</div>
                        <div className="text-[11px] text-fg-tertiary truncate">{orgNameFromBrief(orgs, t.org_id)} · {agoLabel(t.created)}</div>
                      </div>
                      <Badge tone={t.status === "open" ? "warning" : "info"}>{t.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card padding="md" title="Upgrade requests" action={uf.count > 0 && (
              <Link to="/admin/upgrades" className="text-[11px] font-semibold text-accent hover:text-accent-2">View all</Link>
            )}>
              {upgrades == null ? <PanelUnavailable /> : uf.rows.length === 0 ? (
                <div className="text-sm text-fg-tertiary text-center py-6">No active requests.</div>
              ) : (
                <div className="space-y-2.5">
                  {uf.rows.map(r => (
                    <div key={r.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-fg-primary truncate">{r.orgName}</div>
                        <div className="text-[11px] text-fg-tertiary">{PLAN_LABEL[r.desiredPlan ?? ""] ?? r.desiredPlan ?? "—"} · {agoLabel(r.createdAt)}</div>
                      </div>
                      <Badge tone={r.status === "open" ? "warning" : "info"}>{r.status === "open" ? "open" : "in progress"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Recent platform activity */}
          <Card
            padding="md"
            title="Recent platform activity"
            action={<Link to="/admin/audit" className="text-[11px] font-semibold text-accent hover:text-accent-2">Audit log</Link>}
          >
            {feed == null ? <PanelUnavailable /> : feedSlice.length === 0 ? (
              <EmptyState compact icon="shield" title="No platform activity yet" />
            ) : (
              <div className="divide-y divide-default">
                {feedSlice.map(r => (
                  <div key={r.id} className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-fg-primary leading-snug">
                        <span className="font-semibold">{r.actorName || "unknown"}</span>{" "}
                        <span className="text-fg-secondary">{r.message ?? r.action}</span>
                      </div>
                      <div className="text-[11px] text-fg-tertiary truncate">
                        {orgNameFromBrief(orgs, r.orgId)} · {r.resource || "platform"}{r.resourceId ? ` · ${r.resourceId.slice(0, 8)}` : ""}
                      </div>
                    </div>
                    <span className="text-[11px] text-fg-tertiary flex-shrink-0">{agoLabel(r.ts)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Manage quick links */}
          <div>
            <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">Manage</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {LINKS.map(l => (
                <Link key={l.to} to={l.to}>
                  <Card className="p-4 hover:border-accent transition cursor-pointer h-full relative">
                    {l.to === "/admin/signups" && (stats?.pendingSignups ?? 0) > 0 && (
                      <span className="absolute top-3 right-3 text-[10px] font-bold bg-accent text-white rounded-full px-1.5 py-0.5">{stats?.pendingSignups}</span>
                    )}
                    <div className="w-9 h-9 rounded-lg bg-accent-tint text-accent grid place-items-center mb-2"><Icon name={l.icon} size={18} /></div>
                    <div className="text-sm font-semibold text-fg-primary">{l.label}</div>
                    <div className="text-[11px] text-fg-tertiary mt-0.5">{l.desc}</div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
