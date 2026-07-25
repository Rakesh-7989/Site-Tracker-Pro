import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { listVendors, createVendor, setVendorRating, deleteVendor, type Vendor } from "@/app/vendorQueries";

import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

export function VendorsView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("vendor:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canManage) return <AccessDenied message="Vendor directory is restricted to org admins and prospectors." />;
  return <Inner orgId={activeOrg.orgId} canManage={canManage} />;
}

function Inner({ orgId, canManage }: { orgId: string; canManage: boolean }): JSX.Element {
  const [rows, setRows] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState(""); const [category, setCategory] = useState(""); const [phone, setPhone] = useState(""); const [gst, setGst] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listVendors(client, orgId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!name.trim()) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createVendor(c, { orgId, name: name.trim(), category: category.trim() || undefined, phone: phone.trim() || undefined, gst: gst.trim() || undefined }), {
      apply: () => setRows(prev => [{ id: tmpId, name: name.trim(), category: category.trim() || null, phone: phone.trim() || null, gst: gst.trim() || null, contact: null, rating: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setName(""); setCategory(""); setPhone(""); setGst("");
  };

  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter(r => r.name.toLowerCase().includes(term) || (r.category ?? "").toLowerCase().includes(term)) : rows;

  const columns = [
    { key: "name", header: "Vendor", render: (v: Vendor) => (
      <div>
        <div className="flex items-center gap-2"><span className="font-semibold text-ink-800 truncate">{v.name}</span>{v.category && <Badge tone="neutral">{v.category}</Badge>}</div>
        <div className="text-[11px] text-ink-400">{[v.phone, v.gst && `GST ${v.gst}`].filter(Boolean).join(" \u00b7 ") || "\u2014"}</div>
      </div>
    )},
    { key: "rating", header: "Rating", render: (v: Vendor) => (
      canManage ? (
        <select className="text-xs bg-transparent text-amber-600" value={v.rating ?? 0} onChange={e => { const n = Number(e.target.value); void run(`r-${v.id}`, c => setVendorRating(c, v.id, n), { apply: () => setRows(prev => prev.map(x => x.id === v.id ? { ...x, rating: n } : x)), rollback: () => setRows(prev => prev.map(x => x.id === v.id ? { ...x, rating: v.rating } : x)) }); }}>
          <option value={0}>Rate\u2026</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} \u2605</option>)}
        </select>
      ) : (
        <span className="text-amber-500 text-sm">{v.rating == null ? <span className="text-ink-300">\u2014</span> : "\u2605".repeat(Math.round(v.rating)) + "\u2606".repeat(Math.max(0, 5 - Math.round(v.rating)))}</span>
      )
    )},
    ...(canManage ? [{ key: "actions", header: "", render: (v: Vendor) => (
      <Button size="sm" variant="ghost" onClick={() => void run(`d-${v.id}`, c => deleteVendor(c, v.id), { apply: () => setRows(prev => prev.filter(x => x.id !== v.id)), rollback: () => setRows(prev => [...prev, v]) })}><Icon name="trash" size={14} className="text-rose-500" /></Button>
    )}] : []),
  ];

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
      {!loading && rows.length > 0 && <Input placeholder="Search vendors\u2026" value={q} onChange={e => setQ(e.target.value)} />}
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={v => v.id}
        loading={loading}
        error={error}
        emptyMessage={term ? `No vendors match "${term}".` : "No vendors yet."}
        variant="card"
      />
    </div>
  );
}
