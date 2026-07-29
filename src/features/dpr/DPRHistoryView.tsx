import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useOrgSwitcher, useCan } from "@/auth";
import { Card, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";
import { listDprMessages, type DprMessageRow, type DprStatus } from "@/app/dprQueries";
import { DPRStatusBadge } from "./DPRStatusBadge";
import { BuildNowBadge } from "./BuildNowBadge";


import { getClient } from "@/lib/supabase";
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const STATUS_ORDER: Record<DprStatus, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
const sortByStatus = (a: DprMessageRow, b: DprMessageRow): number => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
const sortByDate = (a: DprMessageRow, b: DprMessageRow): number => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export function DPRHistoryView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("dpr:view");

  if (!session) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canView) return <Alert variant="warning">Your role can't view DPR history.</Alert>;

  return <DPRHistoryInner orgId={activeOrg.orgId} />;
}

function DPRHistoryInner({ orgId }: { orgId: string }): JSX.Element {
  const [rows, setRows] = useState<DprMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"date" | "status">("date");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listDprMessages(client, orgId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const sorted = sort === "status" ? [...rows].sort(sortByStatus) : [...rows].sort(sortByDate);

  const sentCount = rows.filter(r => r.status !== "queued").length;
  const failedCount = rows.filter(r => r.status === "failed").length;
  const deliveredCount = rows.filter(r => r.status === "delivered" || r.status === "read").length;

  return (
    <div className="max-w-3xl mx-auto space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">DPR History</h1>
          <p className="text-sm text-fg-secondary mt-0.5">{rows.length} total � {sentCount} sent � {deliveredCount} delivered � {failedCount} failed</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="text-xs border border-default rounded-lg px-2 py-1.5 bg-panel"
            value={sort} onChange={e => setSort(e.target.value as "date" | "status")}>
            <option value="date">Newest first</option>
            <option value="status">By status</option>
          </select>
          <Link to="/dpr" className="text-sm font-semibold text-accent hover:text-accent-2">+ New DPR</Link>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="grid place-items-center py-12"><Spinner size={24} /></div>
      ) : sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-fg-secondary">
          <Icon name="clipboard" size={24} className="mx-auto text-fg-tertiary mb-2" />
          No DPRs yet. <Link to="/dpr" className="text-accent font-semibold">Send your first one</Link>.
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map(r => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DPRStatusBadge status={r.status} lang={(r.language as any) ?? "en"} size="sm" attempts={r.attempts} />
                    {r.language && <Badge tone="neutral">{r.language.toUpperCase()}</Badge>}
                  </div>
                  {r.transcript && (
                    <p className="text-sm text-fg-primary mt-1.5 line-clamp-2">{r.transcript}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-fg-tertiary flex-wrap">
                    <span>{fmtDate(r.createdAt)}</span>
                    {r.supervisorName && <span>{r.supervisorName}</span>}
                    {r.promoterPhone && <span>to {r.promoterPhone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.photoUrl && (
                    <a href={r.photoUrl} target="_blank" rel="noopener noreferrer" title="View photo">
                      <Icon name="image" size={16} className="text-fg-tertiary hover:text-fg-secondary" />
                    </a>
                  )}
                  {r.voiceUrl && (
                    <audio src={r.voiceUrl} controls className="h-6 w-24" />
                  )}
                </div>
              </div>
              {r.lat && r.lon && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-fg-tertiary">
                  <Icon name="map" size={12} />
                  <span>{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</span>
                  {r.status === "delivered" && <BuildNowBadge state="verified" lang={(r.language as any) ?? "en"} size="xs" showLink={false} />}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
