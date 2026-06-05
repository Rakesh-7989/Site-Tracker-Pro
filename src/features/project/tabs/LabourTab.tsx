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
async function getClient(): Promise<any | null> { const mod = await import("../../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }

export function LabourTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("labour:manage", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<LabourEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState(""); const [trade, setTrade] = useState(""); const [wage, setWage] = useState(""); const [aadhaar, setAadhaar] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listLabour(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { if (!name.trim()) return; const w = wage.trim() ? Number(wage) : undefined; await run("add", c => createLabour(c, { projectId, name: name.trim(), trade: trade.trim() || undefined, wage: Number.isFinite(w) ? w : undefined, aadhaar: aadhaar.trim() || undefined })); setName(""); setTrade(""); setWage(""); setAadhaar(""); };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Labour register</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Worker name</span><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Trade</span><Input className="mt-1 w-28" placeholder="Mason" value={trade} onChange={e => setTrade(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Daily wage ₹</span><Input className="mt-1 w-24" type="number" value={wage} onChange={e => setWage(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Aadhaar</span><Input className="mt-1 w-36" placeholder="optional" value={aadhaar} onChange={e => setAadhaar(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !name.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No workers registered.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate">{r.name}{r.trade ? <span className="text-ink-400 font-normal"> · {r.trade}</span> : null}</div>
                <div className="text-[11px] text-ink-400">{[r.aadhaarMasked, r.joined && `joined ${r.joined}`].filter(Boolean).join(" · ") || "—"}</div></div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {r.wage != null && <span className="text-sm font-semibold text-ink-900">{fmtRupees(r.wage)}<span className="text-[11px] text-ink-400 font-normal">/day</span></span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteLabour(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
