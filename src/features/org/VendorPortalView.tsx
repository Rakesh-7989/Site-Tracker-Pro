// SiteTrack Pro — Vendor Portal view (/vendor). Tabbed vendor dashboard.

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";
import { listVendorPOs, listMaterialPrices, type PO, type MPrice } from "@/app/vendorPortalQueries";
import { useSession } from "@/auth/OrganizationContext";


import { getClient } from "@/lib/supabase";
const fmtCur = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

export function VendorPortalView(): JSX.Element {
  const session = useSession();
  const [tab, setTab] = useState("dashboard");
  const [pos, setPos] = useState<PO[]>([]);
  const [prices, setPrices] = useState<MPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const orgId = session.activeOrgId;
    if (!orgId) { setLoading(false); return; }
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [poRes, mpRes] = await Promise.all([listVendorPOs(client), listMaterialPrices(client, orgId)]);
    if (poRes.ok) setPos(poRes.data); else setError(poRes.error);
    if (mpRes.ok) setPrices(mpRes.data); else setError(mpRes.error);
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: "dashboard" as const },
    { key: "pos", label: "Purchase Orders", icon: "clipboard" as const },
    { key: "prices", label: "Material Prices", icon: "trend" as const },
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
    </div>
  );
}
