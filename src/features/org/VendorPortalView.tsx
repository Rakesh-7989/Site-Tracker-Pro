// SiteTrack Pro — Vendor Portal view (/vendor). Tabbed vendor dashboard.

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner, Alert, Icon, Badge, Button } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listVendorPOs, listMaterialPrices, type PO, type MPrice } from "@/app/vendorPortalQueries";
import { listOrgQuotes, upsertQuote, type ProcurementQuote } from "@/app/procurementQuotes";
import { listVendors, type Vendor } from "@/app/vendorQueries";
import { useSession } from "@/auth/OrganizationContext";


import { getClient } from "@/lib/supabase";
const fmtCur = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

export function VendorPortalView(): JSX.Element {
  const session = useSession();
  const [tab, setTab] = useState("dashboard");
  const [pos, setPos] = useState<PO[]>([]);
  const [prices, setPrices] = useState<MPrice[]>([]);
  const [quotes, setQuotes] = useState<ProcurementQuote[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ vendorId: "", itemName: "", unitPrice: "", qty: "1", leadDays: "", validUntil: "", notes: "" });

  const load = useCallback(async () => {
    const orgId = session.activeOrgId;
    if (!orgId) { setLoading(false); return; }
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [poRes, mpRes, qRes, vRes] = await Promise.all([
      listVendorPOs(client), listMaterialPrices(client, orgId),
      listOrgQuotes(client, orgId), listVendors(client, orgId),
    ]);
    if (poRes.ok) setPos(poRes.data); else setError(poRes.error);
    if (mpRes.ok) setPrices(mpRes.data); else setError(mpRes.error);
    if (qRes.ok) setQuotes(qRes.data); else setError(qRes.error);
    if (vRes.ok) setVendors(vRes.data); else setError(vRes.error);
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const submitQuote = async () => {
    const orgId = session.activeOrgId;
    if (!orgId) return;
    const price = Number(form.unitPrice);
    if (!Number.isFinite(price) || price < 0) return;
    if (!form.itemName.trim()) return;
    setSaving(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setSaving(false); return; }
    const res = await upsertQuote(client, {
      orgId,
      vendorId: form.vendorId || null,
      itemName: form.itemName.trim(),
      unitPrice: price,
      qty: Math.max(1, Number(form.qty) || 1),
      leadDays: form.leadDays ? Number(form.leadDays) : null,
      validUntil: form.validUntil || null,
      status: "requested",
      notes: form.notes.trim() || null,
    });
    if (!res.ok) setError(res.error); else setForm({ vendorId: form.vendorId, itemName: "", unitPrice: "", qty: "1", leadDays: "", validUntil: "", notes: "" });
    setSaving(false);
    await load();
  };

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: "dashboard" as const },
    { key: "pos", label: "Purchase Orders", icon: "clipboard" as const },
    { key: "prices", label: "Material Prices", icon: "trend" as const },
    { key: "quotes", label: "Submit Quote", icon: "wallet" as const },
  ];

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (error) return <div className="p-8"><Alert variant="danger">{error}</Alert></div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Icon name="truck" size={22} className="text-accent" />
        <h1 className="text-2xl font-black text-fg-primary">Vendor Portal</h1>
        <Badge tone="info">Vendor</Badge>
      </div>

      <div className="flex gap-1 mb-6 bg-secondary rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? "bg-panel text-fg-primary shadow-sm" : "text-fg-secondary hover:text-fg-primary"}`}
          >
            <Icon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card className="p-4"><div className="text-xs text-fg-tertiary font-semibold uppercase">Pending POs</div><div className="text-3xl font-black text-fg-primary mt-1">{pos.filter(p => p.status === "pending").length}</div></Card>
            <Card className="p-4"><div className="text-xs text-fg-tertiary font-semibold uppercase">Total POs</div><div className="text-3xl font-black text-fg-primary mt-1">{pos.length}</div></Card>
            <Card className="p-4"><div className="text-xs text-fg-tertiary font-semibold uppercase">Materials</div><div className="text-3xl font-black text-fg-primary mt-1">{prices.length}</div></Card>
          </div>
          <h2 className="font-bold text-fg-primary text-base mb-3">Recent Purchase Orders</h2>
          {pos.slice(0, 5).map(po => (
            <Card key={po.id} className="p-4 mb-2">
              <div className="flex items-start justify-between">
                <div><span className="text-xs font-mono font-bold text-accent">{po.no}</span><div className="font-semibold text-fg-primary text-sm mt-0.5">{po.project_name}</div></div>
                <div className="text-right"><div className="text-base font-black text-fg-primary">{fmtCur(po.amount)}</div><Badge tone={po.status === "active" ? "success" : po.status === "pending" ? "warning" : "neutral"}>{po.status}</Badge></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "pos" && (
        <div className="space-y-3">
          {pos.map(po => (
            <Card key={po.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div><span className="text-xs font-mono font-bold text-accent">{po.no}</span><div className="font-bold text-fg-primary text-sm mt-1">{po.project_name}</div></div>
                <div className="text-right shrink-0"><div className="text-base font-black text-fg-primary">{fmtCur(po.amount)}</div><Badge tone={po.status === "active" ? "success" : po.status === "pending" ? "warning" : "neutral"}>{po.status}</Badge></div>
              </div>
              <div className="text-xs text-fg-tertiary mt-2"><Icon name="calendar" size={11} className="inline mr-1" />{fmtDate(po.created)}</div>
            </Card>
          ))}
          {pos.length === 0 && <div className="text-center py-16 text-fg-tertiary"><Icon name="clipboard" size={32} className="mx-auto mb-3 opacity-30" /><p>No purchase orders</p></div>}
        </div>
      )}

      {tab === "prices" && (
        <div className="space-y-2">
          {prices.map(mp => (
            <Card key={mp.id} className="p-4 flex items-center justify-between">
              <div className="font-semibold text-fg-primary text-sm">{mp.material}</div>
              <div className="text-right"><div className="font-black text-fg-primary">{fmtCur(mp.price)}</div><div className="text-[10px] text-fg-tertiary">{fmtDate(mp.updated)}</div></div>
            </Card>
          ))}
          {prices.length === 0 && <div className="text-center py-16 text-fg-tertiary"><Icon name="trend" size={32} className="mx-auto mb-3 opacity-30" /><p>No material prices</p></div>}
        </div>
      )}

      {tab === "quotes" && (
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-bold text-fg-primary text-base mb-1">Submit a quote</h2>
            <p className="text-xs text-fg-tertiary mb-3">Your quote lands in the org's procurement register as "requested"; a manager attaches it to a spec'd item and can raise a PO against it.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 items-end">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Vendor</span>
                <Select className="mt-1" value={form.vendorId}
                  options={[{ value: "", label: "— Select your company —" }, ...vendors.map(v => ({ value: v.id, label: v.name }))]}
                  onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Item</span>
                <Input className="mt-1" placeholder="e.g. Auditorium chairs (300×500mm)" value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Unit price (₹)</span>
                <Input className="mt-1" type="number" min={0} value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Qty</span>
                <Input className="mt-1" type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Lead (days)</span>
                <Input className="mt-1" type="number" min={0} value={form.leadDays} onChange={e => setForm(f => ({ ...f, leadDays: e.target.value }))} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Valid until</span>
                <Input className="mt-1" type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notes</span>
                <Input className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div>
                <Button className="w-full" disabled={saving || !form.itemName.trim() || !(Number(form.unitPrice) >= 0)} onClick={() => void submitQuote()}>
                  {saving ? <Spinner size={14} /> : "Submit quote"}
                </Button>
              </div>
            </div>
          </Card>

          <h2 className="font-bold text-fg-primary text-base mb-1">Your submitted quotes</h2>
          {quotes.length === 0 && <div className="text-center py-12 text-fg-tertiary"><Icon name="wallet" size={32} className="mx-auto mb-3 opacity-30" /><p>No quotes submitted yet</p></div>}
          {quotes.map(q => (
            <Card key={q.id} className="p-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-fg-primary text-sm">{q.itemName || "Item"}</span>
                  <Badge tone={q.status === "selected" ? "success" : q.status === "rejected" ? "danger" : q.status === "received" ? "info" : "neutral"}>{q.status}</Badge>
                </div>
                <div className="text-[11px] text-fg-tertiary mt-1">
                  {q.qty} × {fmtCur(q.unitPrice)} = {fmtCur(q.qty * q.unitPrice)}
                  {q.leadDays != null ? ` · ${q.leadDays}d lead` : ""}
                  {q.validUntil ? ` · valid till ${q.validUntil}` : ""}
                  {q.createdAt ? ` · submitted ${fmtDate(q.createdAt)}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0 text-base font-black text-fg-primary">{fmtCur(q.qty * q.unitPrice)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
