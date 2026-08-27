// SiteTrack Pro — platform users (/admin/users, superadmin). Cross-tenant user
// directory: platform-wide KPI strip (platform_stats RPC), staff-tier mix chart,
// tier filter, CSV export, search + pagination. Mirrors PlatformOrgsView.

import { useCallback, useEffect, useState } from "react";
import { useCan, ROLE_LABEL } from "@/auth";
import { Badge, Alert, AccessDenied, Button, Icon, StatCard } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChartCard } from "@/components/ui/ChartCard";
import { BarChart, type ChartDatum } from "@/components/ui/Charts";
import { buildCsv, downloadCsv, csvDateStamp, type CsvColumn } from "@/lib/utils/genericCsv";
import { listPlatformUsers, getPlatformStats, ADMIN_PAGE_SIZE, type PlatformUser, type PlatformStats } from "@/app/queries/platformAdminQueries";
import { tierBadge } from "@/features/admin/StaffAdminView";

import { getClient } from "@/lib/supabase/supabase";

const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const roleLabel = (r: string): string => (ROLE_LABEL as Record<string, string>)[r] ?? r;

// ── Pure helpers (exported for the phase unit tests) ──────────────────────────

/** Canonical tier display order for the mix chart. */
export const USER_TIER_ORDER: readonly string[] = ["superadmin", "owner", "head", "member", "user"];

/** User → tier bucket (superadmin platform role wins over staff tier). */
export const tierOf = (u: PlatformUser): string => (u.role === "superadmin" ? "superadmin" : u.staffTier ?? "user");

export const TIER_LABEL: Record<string, string> = { superadmin: "Superadmin", owner: "Owner", head: "Head", member: "Member", user: "User" };

/** Tier distribution of the current page (zero-count tiers dropped). */
export function userTierMix(rows: PlatformUser[]): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(tierOf(r), (counts.get(tierOf(r)) ?? 0) + 1);
  return USER_TIER_ORDER
    .map(t => ({ label: TIER_LABEL[t] ?? t, value: counts.get(t) ?? 0 }))
    .filter(d => d.value > 0);
}

/** Client-side tier filter over the loaded page ("all" = no filter). */
export function filterUsersByTier(rows: PlatformUser[], tier: string): PlatformUser[] {
  if (!tier || tier === "all") return rows;
  return rows.filter(r => tierOf(r) === tier);
}

/** CSV column spec for the user export (raw values). */
export const USER_CSV_COLUMNS: ReadonlyArray<CsvColumn<keyof PlatformUser>> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "staffTier", label: "Staff tier" },
  { key: "isStaff", label: "Is staff" },
  { key: "orgCount", label: "Organizations" },
  { key: "createdAt", label: "Joined" },
];

// ── Component ────────────────────────────────────────────────────────────────

export function PlatformUsersView(): JSX.Element {
  const can = useCan("platform:users:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
  return <Inner />;
}

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

function UsersSkeleton(): JSX.Element {
  return (
    <div className="space-y-6" role="status" aria-label="Loading users">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-panel rounded-xl border border-default p-4 space-y-3">
            <Skeleton decorative height={10} width="w-16" />
            <Skeleton decorative height={24} width="w-12" />
          </div>
        ))}
      </div>
      <div className="bg-panel rounded-xl border border-default p-4 space-y-3">
        <Skeleton decorative height={10} width="w-24" />
        <Skeleton decorative height={160} width="w-full" />
      </div>
    </div>
  );
}

function Inner(): JSX.Element {
  const [rows, setRows] = useState<PlatformUser[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [tierFilter, setTierFilter] = useState("all");

  useEffect(() => { const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [ur, sr] = await Promise.all([
      settle(listPlatformUsers(client, { limit: ADMIN_PAGE_SIZE, offset: page * ADMIN_PAGE_SIZE, search })),
      settle(getPlatformStats(client)),
    ]);
    if (ur.ok && ur.data) setRows(ur.data);
    else setError(ur.error ?? "Failed to load users.");
    if (sr.ok && sr.data) setStats(sr.data);
    setStatsFailed(!sr.ok);
    setLoading(false);
  }, [page, search]);
  useEffect(() => { void reload(); }, [reload]);

  const hasNext = rows.length === ADMIN_PAGE_SIZE;

  const filtered = filterUsersByTier(rows, tierFilter);
  const tierData = userTierMix(filtered);
  const statVal = (n: number | undefined): string | number => (stats && n !== undefined ? n : "—");

  const onExport = useCallback(() => {
    const content = buildCsv(filtered as unknown as Array<Record<string, unknown>>, USER_CSV_COLUMNS);
    if (!content) return;
    downloadCsv(`users-${csvDateStamp()}.csv`, content);
  }, [filtered]);

  const columns = [
    { key: "name", header: "Name", render: (u: PlatformUser) => (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-fg-primary">{u.name || "\u2014"}</span>
        <Badge tone={u.role === "superadmin" ? "danger" : "neutral"}>{roleLabel(u.role)}</Badge>
        {u.isStaff && <Badge tone={tierBadge(u.staffTier).tone}>{tierBadge(u.staffTier).label}</Badge>}
      </div>
    )},
    { key: "email", header: "Email", render: (u: PlatformUser) => (
      <span className="text-sm text-fg-secondary">{u.email ?? "no email"}</span>
    ), hideOnMobile: true },
    { key: "joined", header: "Joined", render: (u: PlatformUser) => (
      <span className="text-xs text-fg-tertiary">{fmtDate(u.createdAt)}</span>
    ), hideOnMobile: true },
    { key: "orgCount", header: "Orgs", className: "text-center", render: (u: PlatformUser) => (
      <div className="text-center"><div className="text-lg font-bold text-fg-primary leading-none">{u.orgCount}</div><div className="text-[10px] text-fg-tertiary uppercase tracking-wide">orgs</div></div>
    )},
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg-primary">Users</h1>
          <div className="text-sm text-fg-secondary">Every account on the platform</div>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Icon name="download" size={14} />} onClick={onExport} disabled={filtered.length === 0}>
          Export CSV
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? <UsersSkeleton /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Users" value={statVal(stats?.userCount)} sub={statsFailed ? "unavailable" : "platform-wide"} />
            <StatCard label="Organizations" value={statVal(stats?.orgCount)} sub={statsFailed ? "unavailable" : "platform-wide"} />
            <StatCard label="Projects" value={statVal(stats?.projectCount)} sub={statsFailed ? "unavailable" : "platform-wide"} />
            <StatCard label="Staff" value={statVal(stats?.staffCount)} sub={statsFailed ? "unavailable" : "platform-wide"} />
          </div>
          <ChartCard
            title="Staff tiers"
            subtitle="Users by tier on this page"
            height={180}
            empty={tierData.length === 0}
            emptyMessage="No users on this page"
          >
            <BarChart data={tierData} />
          </ChartCard>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <Input placeholder="Search by name or email\u2026" value={q} onChange={e => setQ(e.target.value)} className="sm:flex-1" />
        <Select fit aria-label="Filter by tier" value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          options={[{ value: "all", label: "All tiers" }, ...USER_TIER_ORDER.map(t => ({ value: t, label: TIER_LABEL[t] ?? t }))]} className="sm:w-44" />
        <span className="text-xs text-fg-tertiary sm:whitespace-nowrap">{search ? "filtered" : `page ${page + 1}`}</span>
      </div>
      <DataTable
        dense
        columns={columns}
        rows={filtered}
        rowKey={u => u.id}
        loading={loading}
        error={error}
        emptyMessage={search ? `No users match "${search}".` : tierFilter !== "all" ? "No users in this tier." : "No users."}
        variant="card"
        pagination={{ page, hasNext, busy: loading, onPrev: () => setPage(p => Math.max(0, p - 1)), onNext: () => setPage(p => p + 1) }}
      />
    </div>
  );
}