// SiteTrack Pro — Measurement Book (/measurement-book).
// Append-only BOQ measurement entries. Gated by boq:edit capability.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listMeasurementBook, createMbEntry, setMbStatus, type MbEntry, type MbStatus } from "@/app/siteOpsQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

const STATUS_OPTS = [{ value: "recorded", label: "Recorded" }, { value: "verified", label: "Verified" }, { value: "billed", label: "Billed" }, { value: "disputed", label: "Disputed" }, { value: "cancelled", label: "Cancelled" }];
const UNIT_OPTS = [{ value: "cum", label: "Cu.m" }, { value: "sqm", label: "Sq.m" }, { value: "rmt", label: "Rmt" }, { value: "nos", label: "Nos" }, { value: "kg", label: "Kg" }, { value: "lump", label: "Lump" }];
const statusTone = (s: MbStatus): "neutral" | "success" | "info" | "danger" | "warning" =>
  s === "verified" ? "success" : s === "billed" ? "info" : s === "disputed" || s === "cancelled" ? "danger" : "neutral";

export function MeasurementBookView(): JSX.Element {
  const canView = useCan("boq:edit");
  const canEdit = useCan("boq:edit");
  const { activeOrg } = useOrgSwitcher();
  const { session } = useAuth();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [rows, setRows] = useState<MbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mbNo, setMbNo] = useState("");
  const [pageNo, setPageNo] = useState("");
  const [desc, setDesc] = useState("");
  const [location, setLocation] = useState("");
  const [unit, setUnit] = useState("cum");
  const [len, setLen] = useState("");
  const [br, setBr] = useState("");
  const [dep, setDep] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");

  const loadProjects = useCallback(async () => {
    if (!activeOrg?.orgId) return;
    const client = await getClient();
    if (!client) return;
    const { data } = await client.from("projects").select("id, name").eq("org_id", activeOrg.orgId);
    setProjects(data ?? []);
    if (data?.length) setSelProject(data[0].id);
  }, [activeOrg?.orgId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const reload = useCallback(async () => {
    if (!selProject) { setRows([]); setLoading(false); return; }
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listMeasurementBook(client, selProject);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [selProject]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!mbNo.trim() || !desc.trim() || !qty.trim() || !session || !selProject) return;
    const q = parseFloat(qty);
    if (isNaN(q) || q < 0) { setError("Invalid quantity."); return; }
    const tmpId = "tmp-" + Date.now();
    const r = rate.trim() ? parseFloat(rate) : undefined;
    const l = len.trim() ? parseFloat(len) : undefined;
    const b = br.trim() ? parseFloat(br) : undefined;
    const d = dep.trim() ? parseFloat(dep) : undefined;
    await run("add", c => createMbEntry(c, {
      projectId: selProject, mbNo: mbNo.trim(), pageNo: pageNo.trim() ? parseInt(pageNo) : undefined,
      description: desc.trim(), location: location.trim() || undefined, unit: unit || undefined,
      length: l, breadth: b, depth: d, qty: q, rate: r,
    }), {
      apply: () => setRows(prev => [{ id: tmpId, mbNo: mbNo.trim(), pageNo: pageNo.trim() ? parseInt(pageNo) : null, description: desc.trim(), location: location.trim() || null, unit: unit || null, length: l ?? null, breadth: b ?? null, depth: d ?? null, qty: q, rate: r ?? null, amount: r ? q * r : null, status: "recorded" as MbStatus, measuredAt: new Date().toISOString().slice(0, 10), verifiedAt: null, notes: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setMbNo(""); setPageNo(""); setDesc(""); setLocation(""); setQty(""); setRate("");
  };

  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold text-ink-900">Measurement Book</h1>
      {!canView && <Alert variant="danger">You do not have permission to view the measurement book.</Alert>}
      {canView && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-ink-700">Project</label>
            <select value={selProject} onChange={e => setSelProject(e.target.value)} className="px-3 py-1.5 bg-bg-secondary border border-border rounded-lg text-sm text-ink-900 outline-none focus:border-safety-500">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {rows.length > 0 && <span className="text-sm text-ink-500 ml-auto">Total: ₹{totalAmount.toLocaleString("en-IN")}</span>}
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
          {canEdit && selProject && (
            <Card className="p-3 space-y-3">
              <div className="flex gap-2 flex-wrap items-end">
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">MB No.</span><Input className="mt-1 w-28" placeholder="MB-001" value={mbNo} onChange={e => setMbNo(e.target.value)} /></div>
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Page</span><Input className="mt-1 w-20" type="number" placeholder="1" value={pageNo} onChange={e => setPageNo(e.target.value)} /></div>
                <div className="flex-1 min-w-[200px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Description</span><Input className="mt-1" placeholder="RCC slab" value={desc} onChange={e => setDesc(e.target.value)} /></div>
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Location</span><Input className="mt-1 w-32" placeholder="Tower A" value={location} onChange={e => setLocation(e.target.value)} /></div>
              </div>
              <div className="flex gap-2 flex-wrap items-end">
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Unit</span><Select className="mt-1 w-auto" value={unit} onChange={e => setUnit(e.target.value)} options={UNIT_OPTS} /></div>
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">L</span><Input className="mt-1 w-20" type="number" placeholder="0" value={len} onChange={e => setLen(e.target.value)} /></div>
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">B</span><Input className="mt-1 w-20" type="number" placeholder="0" value={br} onChange={e => setBr(e.target.value)} /></div>
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">D</span><Input className="mt-1 w-20" type="number" placeholder="0" value={dep} onChange={e => setDep(e.target.value)} /></div>
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Qty</span><Input className="mt-1 w-24" type="number" placeholder="10.5" value={qty} onChange={e => setQty(e.target.value)} /></div>
                <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Rate</span><Input className="mt-1 w-28" type="number" placeholder="4500" value={rate} onChange={e => setRate(e.target.value)} /></div>
                <Button onClick={() => void add()} disabled={busy === "add" || !mbNo.trim() || !desc.trim() || !qty.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
              </div>
            </Card>
          )}
          {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
            : rows.length === 0 ? <div className="text-sm text-ink-500">No entries.</div>
            : <div className="space-y-2">{rows.map(r => (
                <Card key={r.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-800 truncate">{r.mbNo}{r.pageNo ? ` / p.${r.pageNo}` : ""} &mdash; {r.description}</div>
                    <div className="text-[11px] text-ink-400">
                      {[r.location, r.unit ? `${r.qty} ${r.unit}` : `${r.qty}`].filter(Boolean).join(" · ")}
                      {r.rate ? ` @ ₹${r.rate}` : ""}{r.amount != null ? ` = ₹${r.amount.toLocaleString("en-IN")}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as MbStatus; void run(`s-${r.id}`, c => setMbStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STATUS_OPTS} />
                      : <Badge tone={statusTone(r.status)}>{r.status}</Badge>}
                  </div>
                </Card>))}
            </div>
          }
        </>
      )}
    </div>
  );
}