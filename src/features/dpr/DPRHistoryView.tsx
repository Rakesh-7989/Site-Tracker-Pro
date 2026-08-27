import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useOrgSwitcher, useCan } from "@/auth";
import { Card, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { useT } from "@/i18n/I18nProvider";
import { listDprMessages, type DprMessageRow, type DprStatus } from "@/app/queries/dprQueries";
import { DPRStatusBadge } from "./DPRStatusBadge";


import { getClient } from "@/lib/supabase/supabase";
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const STATUS_ORDER: Record<DprStatus, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
export const sortByStatus = (a: DprMessageRow, b: DprMessageRow): number => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
export const sortByDate = (a: DprMessageRow, b: DprMessageRow): number => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export function DPRHistoryView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("dpr:view");
  const t = useT();

  if (!session) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;
  if (!activeOrg) return <Alert variant="warning">{t("dpr.history.noOrg")}</Alert>;
  if (!canView) return <Alert variant="warning">{t("dpr.history.noPermission")}</Alert>;

  return <DPRHistoryInner orgId={activeOrg.orgId} />;
}

function DPRHistoryInner({ orgId }: { orgId: string }): JSX.Element {
  const t = useT();
  const [rows, setRows] = useState<DprMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"date" | "status">("date");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError(t("dpr.history.backendUnconfigured")); setLoading(false); return; }
    const res = await listDprMessages(client, orgId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [orgId, t]);

  useEffect(() => { void reload(); }, [reload]);

  const sorted = sort === "status" ? [...rows].sort(sortByStatus) : [...rows].sort(sortByDate);

  const sentCount = rows.filter(r => r.status !== "queued").length;
  const failedCount = rows.filter(r => r.status === "failed").length;
  const deliveredCount = rows.filter(r => r.status === "delivered" || r.status === "read").length;

  return (
    <div className="max-w-3xl mx-auto space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">{t("dpr.history.title")}</h1>
          <p className="text-sm text-fg-secondary mt-0.5">{t("dpr.history.summary", { total: rows.length, sent: sentCount, delivered: deliveredCount, failed: failedCount })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select compact fit className="w-40" value={sort} onChange={e => setSort(e.target.value as "date" | "status")} options={[{ value: "date", label: t("dpr.history.sortNewest") }, { value: "status", label: t("dpr.history.sortStatus") }]} />
          <Link to="/dpr" className="text-sm font-semibold text-accent hover:text-accent-2">{t("dpr.history.newDpr")}</Link>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="grid place-items-center py-12"><Spinner size={24} /></div>
      ) : sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-fg-secondary">
          <Icon name="clipboard" size={24} className="mx-auto text-fg-tertiary mb-2" />
          {t("dpr.history.empty")} <Link to="/dpr" className="text-accent font-semibold">{t("dpr.history.emptyCta")}</Link>.
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map(r => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DPRStatusBadge status={r.status} lang={(r.language as any) ?? "en"} size="sm" attempts={r.attempts} />
                    {r.language && <Badge tone="neutral">{r.language.toUpperCase()}</Badge>}
                  </div>
                  {r.transcript && (
                    <Link to={`/dpr/${r.id}`} className="block">
                      <p className="text-sm text-fg-primary mt-1.5 line-clamp-2 hover:text-accent">{r.transcript}</p>
                    </Link>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-fg-tertiary flex-wrap">
                    <span>{fmtDate(r.createdAt)}</span>
                    {r.supervisorName && <span>{r.supervisorName}</span>}
                    {r.promoterPhone && <span>{t("dpr.history.toPhone", { phone: r.promoterPhone })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link to={`/dpr/${r.id}`} className="text-xs font-semibold text-accent hover:text-accent-2 whitespace-nowrap" title={t("dpr.history.details")}>
                    {t("dpr.history.details")}
                  </Link>
                  {r.photoUrl && (
                    <a href={r.photoUrl} target="_blank" rel="noopener noreferrer" title="View photo">
                      <Icon name="image" size={16} className="text-fg-tertiary hover:text-fg-secondary" />
                    </a>
                  )}
                  {r.voiceUrl && (
                    <audio src={r.voiceUrl} controls className="h-6 w-24 max-w-full" />
                  )}
                </div>
              </div>
              {r.lat && r.lon && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-fg-tertiary">
                  <Icon name="map" size={12} />
                  <span>{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
