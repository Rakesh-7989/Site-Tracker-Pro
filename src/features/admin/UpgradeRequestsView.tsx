// SiteTrack Pro — plan-upgrade requests (/admin/upgrades). Platform staff.
import { getClient } from "@/lib/supabase";
//
// Owner/Head see all requests (and can assign them to a staff); an assigned
// staff member sees + works their own. Status: open → in_progress → closed.

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/auth";
import { Card, Button, Icon, Badge, Spinner } from "@/components/ui/atoms";
import { listUpgradeRequests, assignUpgradeRequest, setUpgradeStatus, type UpgradeRequest, type UpgradeStatus } from "@/app/upgradeQueries";
import { listStaff, type StaffMember } from "@/app/staffQueries";
import { Pager } from "@/components/ui/Pager";

const UPGRADE_PAGE_SIZE = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const STATUS_TONE: Record<UpgradeStatus, "warning" | "info" | "success"> = { open: "warning", in_progress: "info", closed: "success" };
const STATUS_LABEL: Record<UpgradeStatus, string> = { open: "Open", in_progress: "In progress", closed: "Closed" };

export function UpgradeRequestsView(): JSX.Element {
  const { session } = useAuth();
  const tier = session?.user.staffTier ?? null;
  const isStaff = session?.user.identityRole === "superadmin" || tier === "owner" || tier === "head" || tier === "member";
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

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold">Upgrade requests</h1>
        <p className="text-sm text-fg-secondary mt-1">Orgs asking to move up a plan. {canAssign ? "Assign to a staff or take it yourself, then track to close." : "Your assigned requests."}</p>
      </div>

      {error && (
        <div className="rounded-lg bg-error-tint border border-error p-3 text-[13px] text-error flex items-start gap-2">
          <Icon name="alert" size={15} className="text-error mt-0.5" /> {error}
        </div>
      )}

      {loading ? <div className="grid place-items-center py-12 text-accent"><Spinner size={24} /></div>
        : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-fg-secondary"><Icon name="trend" size={24} className="mx-auto text-fg-tertiary mb-2" />No upgrade requests {page > 0 ? "on this page." : "yet."}</Card>
        ) : <>{rows.map(r => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-fg-primary">{r.orgName}</span>
                  <Badge tone="neutral">{r.currentPlan ?? "?"} → {r.desiredPlan ?? "?"}</Badge>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <div className="text-[12px] text-fg-secondary mt-0.5">by {r.requesterEmail ?? "—"} · {r.createdAt.slice(0, 10)}{r.assignedEmail ? ` · handled by ${r.assignedEmail}` : ""}</div>
                {r.note && <div className="text-[12px] text-fg-secondary mt-1 italic">"{r.note}"</div>}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-default pt-3 flex-wrap">
              {canAssign && (
                <select className="text-sm border border-default rounded-lg px-2.5 py-2 bg-panel" value={r.assignedStaffId ?? ""} disabled={busy === r.id}
                  onChange={e => void doAssign(r, e.target.value)}>
                  <option value="">— Assign to —</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.email || s.name}</option>)}
                </select>
              )}
              <div className="flex items-center gap-1.5">
                {(["open", "in_progress", "closed"] as UpgradeStatus[]).map(st => (
                  <Button key={st} size="sm" variant={r.status === st ? "primary" : "secondary"} disabled={busy === r.id} onClick={() => void doStatus(r, st)}>
                    {STATUS_LABEL[st]}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        ))}
        <Pager page={page} hasNext={rows.length === UPGRADE_PAGE_SIZE} busy={loading} onPrev={() => setPage(p => Math.max(0, p - 1))} onNext={() => setPage(p => p + 1)} />
        </>}
    </div>
  );
}
