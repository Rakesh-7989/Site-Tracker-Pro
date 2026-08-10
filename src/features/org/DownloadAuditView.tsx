// SiteTrack Pro — deliverable / drawing download audit (v4 E4).
//
// Org-wide register of who downloaded which file from the shared deliverables
// storage bucket (deliverables vs drawings), across the caller's member
// projects. Append-only events are logged on every signed-URL download in the
// Deliverables / Drawings tabs. Mirrors the CrossProjectPOsView + RevenueView
// org-rollup pattern.
//
// Gates: manager reads only — deliverable:manage OR deliverable:approve OR
// drawings:upload (any-of) via <AccessDenied>. Nav shows for consultancy /
// architecture / interior / multiple segments (no segment gate), module
// consultancy OR design (ANY-of in nav-config + route).

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useOrgSwitcher, useCan } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";
import { Card, Spinner, Alert, AccessDenied, Badge } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatBytes } from "@/app/deliverableStorageQueries";
import { listOrgDownloadEvents, downloadTotals, type DecoratedDownloadEvent, type DownloadRegister } from "@/app/downloadAuditQueries";

const REGISTER_LABEL: Record<DownloadRegister, string> = { deliverable: "Deliverable", drawing: "Drawing" };
const REGISTER_TONE: Record<DownloadRegister, "info" | "success"> = { deliverable: "info", drawing: "success" };
const FILTERS = [{ value: "all", label: "All" }, { value: "deliverable", label: "Deliverables" }, { value: "drawing", label: "Drawings" }];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DownloadAuditView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const ctx = { orgId: activeOrg?.orgId };
  const canDeliver = useCan("deliverable:manage", ctx);
  const canApprove = useCan("deliverable:approve", ctx);
  const canDraw = useCan("drawings:upload", ctx);
  const canView = canDeliver || canApprove || canDraw;

  const [rows, setRows] = useState<DecoratedDownloadEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    if (!activeOrg?.orgId) { setError("No active organization."); setLoading(false); return; }
    const res = await listOrgDownloadEvents(client, activeOrg.orgId, 200, memberProjectScope(session));
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [activeOrg?.orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const totals = useMemo(() => downloadTotals(rows), [rows]);
  const shown = filter === "all" ? rows : rows.filter(r => r.register === filter);

  if (!canView) return <AccessDenied message="You don't have permission to view the download audit." />;

  const columns: Column<DecoratedDownloadEvent>[] = [
    {
      key: "fileName", header: "File", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="font-medium text-fg-primary text-sm truncate">{r.fileName}</div>
          <div className="text-[11px] text-fg-tertiary truncate font-mono">{r.filePath}</div>
        </div>
      ),
    },
    {
      key: "projectName", header: "Project", hideOnMobile: true, className: "flex-shrink-0",
      render: r => (
        <div>
          <div className="text-sm text-fg-primary">{r.projectName ?? "—"}</div>
          {r.projectType ? <div className="text-[10px] text-fg-tertiary capitalize">{r.projectType}</div> : null}
        </div>
      ),
    },
    {
      key: "register", header: "Register", className: "flex-shrink-0",
      render: r => <Badge tone={REGISTER_TONE[r.register]}>{REGISTER_LABEL[r.register]}</Badge>,
    },
    {
      key: "downloadedByName", header: "Downloaded by", hideOnMobile: true, className: "flex-shrink-0",
      render: r => <span className="text-sm text-fg-primary">{r.downloadedByName ?? "Unknown"}</span>,
    },
    {
      key: "sizeBytes", header: "Size", hideOnMobile: true, className: "flex-shrink-0 text-right",
      render: r => <span className="text-xs text-fg-tertiary">{r.sizeBytes > 0 ? formatBytes(r.sizeBytes) : "—"}</span>,
    },
    {
      key: "downloadedAt", header: "Downloaded", className: "flex-shrink-0 text-right",
      render: r => <span className="text-xs text-fg-secondary whitespace-nowrap">{fmtDate(r.downloadedAt)}</span>,
    },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Register Audit</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Download Audit</h1>
        <p className="text-fg-secondary text-sm mt-2">Who downloaded which deliverable / drawing file across the org's projects, and when. Events are logged automatically on every file download.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Downloads</div>
          <div className="font-display text-2xl font-bold text-fg-primary mt-1">{totals.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Deliverables</div>
          <div className="font-display text-2xl font-bold text-info mt-1">{totals.deliverable}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Drawings</div>
          <div className="font-display text-2xl font-bold text-success mt-1">{totals.drawing}</div>
        </Card>
        <Card className="p-4 flex flex-col justify-center">
          <Select className="w-full" value={filter} onChange={e => setFilter(e.target.value)} options={FILTERS} />
        </Card>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : shown.length === 0 ? (
        <Card className="p-10 text-center text-sm text-fg-secondary">
          {rows.length === 0 ? "No downloads recorded yet. Downloads from the Deliverables / Drawings tabs will appear here." : `No ${filter} downloads recorded yet.`}
        </Card>
      ) : (
        <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-default">
          <DataTable columns={columns} rows={shown} rowKey={r => r.id} />
        </div>
      )}
    </div>
  );
}