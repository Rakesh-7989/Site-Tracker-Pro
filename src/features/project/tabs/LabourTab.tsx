// SiteTrack Pro — project Labour register tab (v3 port, DB-wired). Statutory
// register; Aadhaar is shown masked (last 4 only) and RLS confines rows to the
// project's org/members.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listLabour, createLabour, deleteLabour, type LabourEntry } from "@/app/siteAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
export function LabourTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("labour:manage", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<LabourEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(""); const [trade, setTrade] = useState(""); const [wage, setWage] = useState(""); const [aadhaar, setAadhaar] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listLabour(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!name.trim()) return;
    const w = wage.trim() ? Number(wage) : undefined;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createLabour(c, { projectId, name: name.trim(), trade: trade.trim() || undefined, wage: Number.isFinite(w) ? w : undefined, aadhaar: aadhaar.trim() || undefined }), {
      apply: () => setRows(prev => [{ id: tmpId, name: name.trim(), trade: trade.trim() || undefined, wage: Number.isFinite(w) ? w : undefined, aadhaarMasked: aadhaar.trim() ? "****" + aadhaar.trim().slice(-4) : undefined, joined: new Date().toISOString().slice(0, 10) } as LabourEntry, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setName(""); setTrade(""); setWage(""); setAadhaar("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Labour register</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Worker name</span><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Trade</span><Input className="mt-1 w-28" placeholder="Mason" value={trade} onChange={e => setTrade(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Daily wage ₹</span><Input className="mt-1 w-24" type="number" value={wage} onChange={e => setWage(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Aadhaar</span><Input className="mt-1 w-36" placeholder="optional" value={aadhaar} onChange={e => setAadhaar(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !name.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No workers registered.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.name}{r.trade ? <span className="text-fg-tertiary font-normal"> · {r.trade}</span> : null}</div>
                <div className="text-[11px] text-fg-tertiary">{[r.aadhaarMasked, r.joined && `joined ${r.joined}`].filter(Boolean).join(" · ") || "—"}</div></div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {r.wage != null && <span className="text-sm font-semibold text-fg-primary">{fmtRupees(r.wage)}<span className="text-[11px] text-fg-tertiary font-normal">/day</span></span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteLabour(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
