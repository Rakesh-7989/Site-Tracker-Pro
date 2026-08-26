import { getClient } from "@/lib/supabase";

import { useCallback, useEffect, useState } from "react";

import { useAuth, useHasStaffArea } from "@/auth";
import { Card, Button, Icon, Badge, StatCard } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildCsv, downloadCsv, csvDateStamp, type CsvColumn } from "@/lib/genericCsv";
import { listUpgradeRequests, assignUpgradeRequest, setUpgradeStatus, type UpgradeRequest, type UpgradeStatus } from "@/app/upgradeQueries";
import { listStaff, type StaffMember } from "@/app/staffQueries";
import { Pager } from "@/components/ui/Pager";

const UPGRADE_PAGE_SIZE = 100;

export const STATUS_TONE: Record<UpgradeStatus, "warning" | "info" | "success"> = { open: "warning", in_progress: "info", closed: "success" };
export const STATUS_LABEL: Record<UpgradeStatus, string> = { open: "Open", in_progress: "In progress", closed: "Closed" };

// ── Pure helpers (exported for the phase unit tests) ──────────────────────────

/** Roll-up of the loaded page (open / in_progress / closed + still-open total). */
export function upgradeSummary(rows: UpgradeRequest[]): { open: number; inProgress: number; closed: number; openTotal: number } {
  let open = 0, inProgress = 0, closed = 0;
  for (const r of rows) {
    if (r.status === "open") open++;
    else if (r.status === "in_progress") inProgress++;
    else closed++;
  }
  return { open, inProgress, closed, openTotal: open + inProgress };
}

/** CSV column spec for the upgrade export (raw values). */
export const UPGRADE_CSV_COLUMNS: ReadonlyArray<CsvColumn<keyof UpgradeRequest>> = [
  { key: "orgName", label: "Org" },
  { key: "requesterEmail", label: "Requester" },
  { key: "currentPlan", label: "Current plan" },
  { key: "desiredPlan", label: "Desired plan" },
  { key: "status", label: "Status" },
  { key: "assignedEmail", label: "Assigned to" },
  { key: "resolutionNote", label: "Resolution note" },
  { key: "createdAt", label: "Created" },
  { key: "updatedAt", label: "Updated" },
];

export function UpgradeRequestsView(): JSX.Element {
  const { session } = useAuth();
  const tier = session?.user.staffTier ?? null;
  const isStaff = useHasStaffArea("upgrades");
  const canAssign = session?.user.identityRole === "superadmin" || tier === "owner" || tier === "head";

  const [rows, setRows] = useState<UpgradeRequest[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend unavailable."); setLoading(false); return; }
    const [r, s] = await Promise.all([
      listUpgradeRequests(client, { limit: UPGRADE_PAGE_SIZE, offset: page * UPGRADE_PAGE_SIZE }),
      canAssign ? listStaff(client) : Promise.resolve({ ok: true as const, data: [] as StaffMember[] }),
    ]);
    if (r.ok) setRows(r.data); else setError(r.error);
    if (s.ok) setStaff(s.data);
    setLoading(false);
  }, [canAssign, page]);

  useEffect(() => { if (isStaff) void load(); else setLoading(false); }, [isStaff, load]);

  function UpgradeSkeleton(): JSX.Element {
    return (
      <div className="space-y-6" role="status" aria-label="Loading upgrade requests">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-panel rounded-xl border border-default p-4 space-y-3">
              <Skeleton decorative height={10} width="w-16" />
              <Skeleton decorative height={24} width="w-12" />
            </div>
          ))}
        </div>
        <div className="bg-panel rounded-xl border border-default p-4 space-y-3">
          <Skeleton decorative height={12} width="w-40" />
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} decorative height={40} width="w-full" />)}
        </div>
      </div>
    );
  }

  const doAssign = async (r: UpgradeRequest, staffId: string) => {
    setBusy(r.id);
    const client = await getClient();
    const res = await assignUpgradeRequest(client, r.id, staffId || null);
    if (res.ok) await load(); else setError(res.error);
    setBusy(null);
  };
  const doStatus = async (r: UpgradeRequest, status: UpgradeStatus) => {
    setBusy(r.id);
    const client = await getClient();
    const res = await setUpgradeStatus(client, r.id, status);
    if (res.ok) await load(); else setError(res.error);
    setBusy(null);
  };

  const summary = upgradeSummary(rows);
  const onExport = useCallback(() => {
    const content = buildCsv(rows as unknown as Array<Record<string, unknown>>, UPGRADE_CSV_COLUMNS);
    if (!content) return;
    downloadCsv(`upgrade-requests-${csvDateStamp()}.csv`, content);
  }, [rows]);

  if (!isStaff) {
    return (
      <div className="max-w-xl mx-auto mt-10 p-4 md:p-6">
        <Card className="p-4 md:p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-secondary text-fg-tertiary grid place-items-center mx-auto mb-3"><Icon name="shield" size={24} /></div>
          <h1 className="font-display text-lg font-bold">Upgrade requests</h1>
          <p className="text-sm text-fg-secondary mt-2">Only platform staff can view upgrade requests.</p>
        </Card>
      </div>
    );
  }

  const columns: Column<UpgradeRequest>[] = [
    {
      key: "org", header: "Org", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-fg-primary text-sm">{r.orgName}</span>
            <Badge tone="neutral">{r.currentPlan ?? "?"} → {r.desiredPlan ?? "?"}</Badge>
            <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          </div>
          <div className="text-xs text-fg-secondary mt-0.5">by {r.requesterEmail ?? "\u2014"} · {r.createdAt.slice(0, 10)}{r.assignedEmail ? ` · handled by ${r.assignedEmail}` : ""}</div>
          {r.note && <div className="text-xs text-fg-secondary mt-0.5 italic truncate">"{r.note}"</div>}
        </div>
      ),
    },
    ...(canAssign ? [{
      key: "assign" as const, header: "Assign", hideOnMobile: true, className: "flex-shrink-0",
      render: (r: UpgradeRequest) => (
        <Select compact fit className="min-w-[9rem]" value={r.assignedStaffId ?? ""} disabled={busy === r.id}
          onChange={e => void doAssign(r, e.target.value)} options={[{ value: "", label: "\u2014 Assign to \u2014" }, ...staff.map(s => ({ value: s.id, label: s.email || s.name }))]} />
      ),
    }] : []),
    {
      key: "actions", header: "Status", className: "flex-shrink-0",
      render: r => (
        <div className="flex items-center gap-1">
          {(["open", "in_progress", "closed"] as UpgradeStatus[]).map(st => (
            <Button key={st} size="sm" variant={r.status === st ? "primary" : "secondary"} disabled={busy === r.id} onClick={() => void doStatus(r, st)}>
              {STATUS_LABEL[st]}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold">Upgrade requests</h1>
          <p className="text-sm text-fg-secondary mt-1">Orgs asking to move up a plan. {canAssign ? "Assign to a staff or take it yourself, then track to close." : "Your assigned requests."}</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Icon name="download" size={14} />} onClick={onExport} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-error-tint border border-error p-3 text-[13px] text-error flex items-start gap-2">
          <Icon name="alert" size={15} className="text-error mt-0.5" /> {error}
        </div>
      )}

      {loading ? <UpgradeSkeleton /> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Open" value={summary.open} sub="needs action" />
          <StatCard label="In progress" value={summary.inProgress} sub="assigned" />
          <StatCard label="Closed" value={summary.closed} sub="resolved" />
          <StatCard label="Active total" value={summary.openTotal} sub={`${canAssign ? "all staff" : "your queue"}`} />
        </div>
      )}

      {!loading && (
        <Card className="overflow-hidden">
          <DataTable dense columns={columns} rows={rows} rowKey={r => r.id} emptyMessage={`No upgrade requests ${page > 0 ? "on this page." : "yet."}`} />
        </Card>
      )}
      {rows.length > 0 && <Pager page={page} hasNext={rows.length === UPGRADE_PAGE_SIZE} busy={loading} onPrev={() => setPage(p => Math.max(0, p - 1))} onNext={() => setPage(p => p + 1)} />}
    </div>
  );
}
