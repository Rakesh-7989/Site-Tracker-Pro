// SiteTrack Pro — org Vendor directory (/vendors). Material suppliers /
// subcontractors shared across the org's projects. DB-wired (migration 84).

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { listVendors, createVendor, setVendorRating, deleteVendor, type Vendor } from "@/app/vendorQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const Stars = ({ n }: { n: number | null }): JSX.Element => (
  <span className="text-amber-500 text-sm">{n == null ? <span className="text-ink-300">—</span> : "★".repeat(Math.round(n)) + "☆".repeat(Math.max(0, 5 - Math.round(n)))}</span>
);

export function VendorsView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("vendor:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} canManage={canManage} />;
}

function Inner({ orgId, canManage }: { orgId: string; canManage: boolean }): JSX.Element {
  const [rows, setRows] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState(""); const [category, setCategory] = useState(""); const [phone, setPhone] = useState(""); const [gst, setGst] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listVendors(client, orgId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { if (!name.trim()) return; await run("add", c => createVendor(c, { orgId, name: name.trim(), category: category.trim() || undefined, phone: phone.trim() || undefined, gst: gst.trim() || undefined })); setName(""); setCategory(""); setPhone(""); setGst(""); };

  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter(r => r.name.toLowerCase().includes(term) || (r.category ?? "").toLowerCase().includes(term)) : rows;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold text-ink-900">Vendors</h1>
        <span className="text-sm text-ink-500">{rows.length} total</span>
      </div>
      <p className="text-sm text-ink-500 -mt-2">Material suppliers &amp; subcontractors shared across your projects.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {canManage && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Vendor name</span><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sri Cement Traders" /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Category</span><Input className="mt-1 w-28" value={category} onChange={e => setCategory(e.target.value)} placeholder="Cement" /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Phone</span><Input className="mt-1 w-32" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">GSTIN</span><Input className="mt-1 w-36" value={gst} onChange={e => setGst(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !name.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {!loading && rows.length > 0 && <Input placeholder="Search vendors…" value={q} onChange={e => setQ(e.target.value)} />}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : shown.length === 0 ? <Card className="p-8 text-center text-sm text-ink-500"><Icon name="truck" size={24} className="mx-auto text-ink-300 mb-2" />No vendors{term ? " match your search." : " yet."}</Card>
        : <div className="space-y-2">{shown.map(v => (
            <Card key={v.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="font-semibold text-ink-800 truncate">{v.name}</span>{v.category && <Badge tone="neutral">{v.category}</Badge>}</div>
                <div className="text-[11px] text-ink-400">{[v.phone, v.gst && `GST ${v.gst}`].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {canManage ? (
                  <select className="text-xs bg-transparent text-amber-600" value={v.rating ?? 0} onChange={e => void run(`r-${v.id}`, c => setVendorRating(c, v.id, Number(e.target.value)))}>
                    <option value={0}>Rate…</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★</option>)}
                  </select>
                ) : <Stars n={v.rating} />}
                {canManage && <Button size="sm" variant="ghost" onClick={() => void run(`d-${v.id}`, c => deleteVendor(c, v.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>
          ))}</div>}
    </div>
  );
}
