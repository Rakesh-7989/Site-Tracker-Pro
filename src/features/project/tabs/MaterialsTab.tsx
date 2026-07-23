// SiteTrack Pro â€” project Materials tab (v3 port, Batch 2, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listMaterials, createMaterial, setMaterialStatus, deleteMaterial, type Material, type MaterialStatus } from "@/app/siteOpsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const ST = [{ value: "expected", label: "Expected" }, { value: "received", label: "Received" }, { value: "rejected", label: "Rejected" }];

export function MaterialsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("material:add", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [m, setM] = useState(""); const [qty, setQty] = useState(""); const [sup, setSup] = useState(""); const [dd, setDd] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listMaterials(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { if (!m.trim() || !session) return; await run("add", c => createMaterial(c, { projectId, material: m.trim(), quantity: qty.trim() || undefined, supplier: sup.trim() || undefined, deliveryDate: dd || null, loggedBy: session.user.id })); setM(""); setQty(""); setSup(""); setDd(""); };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Materials</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Material</span><Input className="mt-1" placeholder="e.g. TMT 12mm" value={m} onChange={e => setM(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Qty</span><Input className="mt-1 w-24" placeholder="5 ton" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Supplier</span><Input className="mt-1 w-32" value={sup} onChange={e => setSup(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Delivery</span><Input className="mt-1" type="date" value={dd} onChange={e => setDd(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !m.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No materials logged.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate">{r.material}</div>
                <div className="text-[11px] text-ink-400">{[r.quantity, r.supplier, r.deliveryDate && `due ${r.deliveryDate}`].filter(Boolean).join(" Â· ") || "â€”"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => void run(`s-${r.id}`, c => setMaterialStatus(c, r.id, e.target.value as MaterialStatus))} options={ST} />
                  : <span className="text-xs text-ink-500">{r.status}</span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteMaterial(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
