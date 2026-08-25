// SiteTrack Pro — project Materials tab (v3 port, Batch 2, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listMaterials, createMaterial, setMaterialStatus, deleteMaterial, type Material, type MaterialStatus } from "@/app/siteOpsQueries";
import { listMaterialRequests, createMaterialRequest, setMaterialRequestStatus, deleteMaterialRequest, requestTotals, REQUEST_NEXT, REQUEST_STATUS_LABEL, type MaterialRequest, type RequestStatus } from "@/app/materialRequestQueries";

 
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const ST = [{ value: "expected", label: "Expected" }, { value: "received", label: "Received" }, { value: "rejected", label: "Rejected" }];

export function MaterialsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("material:add", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Material[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [m, setM] = useState(""); const [qty, setQty] = useState(""); const [sup, setSup] = useState(""); const [dd, setDd] = useState("");
  const [rm, setRm] = useState(""); const [runit, setRunit] = useState(""); const [rqty, setRqty] = useState(""); const [rdd, setRdd] = useState(""); const [rreason, setRreason] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listMaterials(client, projectId); if (res.ok) setRows(res.data); else setError(res.error);
    const mr = await listMaterialRequests(client, projectId); if (mr.ok) setRequests(mr.data); else setError(mr.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!m.trim() || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createMaterial(c, { projectId, material: m.trim(), quantity: qty.trim() || undefined, supplier: sup.trim() || undefined, deliveryDate: dd || null, loggedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, material: m.trim(), quantity: qty.trim() || null, supplier: sup.trim() || null, deliveryDate: dd || null, status: "expected" as MaterialStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setM(""); setQty(""); setSup(""); setDd("");
  };

  const addRequest = async () => {
    if (!rm.trim()) return;
    const q = Number(rqty);
    if (!Number.isFinite(q) || q <= 0) return;
    const tmpId = "tmp-" + Date.now();
    await run("req", c => createMaterialRequest(c, { projectId, item: rm.trim(), unit: runit.trim() || undefined, qty: q, needDate: rdd || null, reason: rreason.trim() || null }), {
      apply: () => setRequests(prev => [{ id: tmpId, item: rm.trim(), unit: runit.trim() || null, qty: q, needDate: rdd || null, reason: rreason.trim() || null, status: "requested" as RequestStatus, requestedByName: null, approvedByName: null, poId: null, notes: null, createdAt: "" }, ...prev]),
      rollback: () => setRequests(prev => prev.filter(x => x.id !== tmpId)),
    });
    setRm(""); setRunit(""); setRqty(""); setRdd(""); setRreason("");
  };

  const advanceRequest = async (r: MaterialRequest) => {
    const next = REQUEST_NEXT[r.status]; if (!next) return;
    await run(`rs-${r.id}`, c => setMaterialRequestStatus(c, r.id, next, session?.user.id ?? null), {
      apply: () => setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: next } : x)),
      rollback: () => setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)),
    });
  };

  const totals = requestTotals(requests);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Materials</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      <Card padding="md" className="border border-default bg-elevated" title={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Material requests</div>
          <div className="text-sm font-semibold text-fg-primary">{totals.open} open · {totals.received} received</div>
        </div>
      } action={
        <div className="flex gap-4 text-[11px] text-fg-secondary">
          <span>Requested {totals.requested}</span><span>Approved {totals.approved}</span><span>Ordered {totals.ordered}</span><span>Received {totals.received}</span>
        </div>
      }>
        <div className="space-y-3">
        {canEdit && (
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Item</span><Input className="mt-1" placeholder="e.g. River sand" value={rm} onChange={e => setRm(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Unit</span><Input fit className="mt-1 w-16" placeholder="cft" value={runit} onChange={e => setRunit(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Qty</span><Input fit className="mt-1 w-24" type="number" min={0} value={rqty} onChange={e => setRqty(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Needed by</span><Input className="mt-1" type="date" value={rdd} onChange={e => setRdd(e.target.value)} /></div>
            <div className="flex-1 min-w-[120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Reason</span><Input className="mt-1" value={rreason} onChange={e => setRreason(e.target.value)} placeholder="e.g. slab pour next week" /></div>
            <Button onClick={() => void addRequest()} disabled={busy === "req" || !rm.trim() || !(Number(rqty) > 0)}>{busy === "req" ? <Spinner size={14} /> : "Request"}</Button>
          </div>
        )}
        {requests.length === 0 ? (
          <div className="text-sm text-fg-tertiary">No material requests yet.</div>
        ) : (
          <div className="space-y-1.5">
            {requests.map(r => (
              <div key={r.id} className="rounded-lg bg-card border border-default px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-fg-primary truncate">{r.item}<span className="text-fg-secondary font-medium"> · {r.qty}{r.unit ? ` ${r.unit}` : ""}</span></div>
                  <div className="text-[11px] text-fg-tertiary truncate">{[r.needDate && `by ${r.needDate}`, r.reason, r.requestedByName && `raised by ${r.requestedByName}`, REQUEST_STATUS_LABEL[r.status]].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canEdit && r.status !== "received" ? (
                    <Button size="sm" disabled={busy === `rs-${r.id}`} onClick={() => void advanceRequest(r)}>
                      {busy === `rs-${r.id}` ? <Spinner size={12} /> : REQUEST_STATUS_LABEL[r.status] === "Ordered" ? "Mark received" : `Mark ${REQUEST_STATUS_LABEL[REQUEST_NEXT[r.status] ?? r.status]}`}
                    </Button>
                  ) : (
                    <span className="text-xs text-fg-secondary">{r.status}</span>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => void run(`rd-${r.id}`, c => deleteMaterialRequest(c, r.id), { apply: () => setRequests(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRequests(prev => [...prev, r]) })}>
                      <span className="text-error">✕</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </Card>
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Material</span><Input className="mt-1" placeholder="e.g. TMT 12mm" value={m} onChange={e => setM(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Qty</span><Input fit className="mt-1 w-24" placeholder="5 ton" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Supplier</span><Input fit className="mt-1 w-32" value={sup} onChange={e => setSup(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Delivery</span><Input className="mt-1" type="date" value={dd} onChange={e => setDd(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !m.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No materials logged.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.material}</div>
                <div className="text-[11px] text-fg-tertiary">{[r.quantity, r.supplier, r.deliveryDate && `due ${r.deliveryDate}`].filter(Boolean).join(" · ") || "—"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select fit className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as MaterialStatus; void run(`s-${r.id}`, c => setMaterialStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={ST} />
                  : <span className="text-xs text-fg-secondary">{r.status}</span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteMaterial(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><span className="text-error">✕</span></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
