// SiteTrack Pro — Vendor Portal view (/vendor). Tabbed vendor dashboard.

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";

interface PO { id: string; no: string; amount: number; status: string; project_name: string; created: string; }
interface MPrice { id: string; material: string; price: number; updated: string; }

async function getClient() {
  const mod = await import("../../lib/supabase.js");
  return await (mod as any).getSupabaseClient();
}

const fmtCur = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

export function VendorPortalView(): JSX.Element {
  const [tab, setTab] = useState("dashboard");
  const [pos, setPos] = useState<PO[]>([]);
  const [prices, setPrices] = useState<MPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const { data: poData, error: poErr } = await client.from("purchase_orders")
      .select("id, no, amount, status, project:project_id(name), created_at").order("created_at", { ascending: false }).limit(20);
    if (poErr) { setError(String(poErr.message ?? poErr)); } else {
      setPos((poData ?? []).map((r: any) => ({ id: r.id, no: r.no ?? "", amount: r.amount ?? 0, status: r.status ?? "", project_name: r.project?.name ?? "", created: r.created_at ?? "" })));
    }
    const { data: mpData, error: mpErr } = await client.from("material_prices")
      .select("id, material, price, updated_at").order("material").limit(50);
    if (mpErr) { setError(String(mpErr.message ?? mpErr)); } else {
      setPrices((mpData ?? []).map((r: any) => ({ id: r.id, material: r.material ?? "", price: r.price ?? 0, updated: r.updated_at ?? "" })));
    }
    setLoading(false);
  }, []);

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
        <Icon name="truck" size={22} className="text-safety-500" />
        <h1 className="text-2xl font-black text-ink-900">Vendor Portal</h1>
        <Badge tone="info">Vendor</Badge>
      </div>

      <div className="flex gap-1 mb-6 bg-cream-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}
          >
            <Icon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="p-4"><div className="text-xs text-ink-400 font-semibold uppercase">Pending POs</div><div className="text-3xl font-black text-ink-900 mt-1">{pos.filter(p => p.status === "pending").length}</div></Card>
            <Card className="p-4"><div className="text-xs text-ink-400 font-semibold uppercase">Total POs</div><div className="text-3xl font-black text-ink-900 mt-1">{pos.length}</div></Card>
            <Card className="p-4"><div className="text-xs text-ink-400 font-semibold uppercase">Materials</div><div className="text-3xl font-black text-ink-900 mt-1">{prices.length}</div></Card>
          </div>
          <h2 className="font-bold text-ink-900 text-base mb-3">Recent Purchase Orders</h2>
          {pos.slice(0, 5).map(po => (
            <Card key={po.id} className="p-4 mb-2">
              <div className="flex items-start justify-between">
                <div><span className="text-xs font-mono font-bold text-safety-600">{po.no}</span><div className="font-semibold text-ink-900 text-sm mt-0.5">{po.project_name}</div></div>
                <div className="text-right"><div className="text-base font-black text-ink-900">{fmtCur(po.amount)}</div><Badge tone={po.status === "active" ? "success" : po.status === "pending" ? "warning" : "neutral"}>{po.status}</Badge></div>
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
                <div><span className="text-xs font-mono font-bold text-safety-600">{po.no}</span><div className="font-bold text-ink-900 text-sm mt-1">{po.project_name}</div></div>
                <div className="text-right shrink-0"><div className="text-base font-black text-ink-900">{fmtCur(po.amount)}</div><Badge tone={po.status === "active" ? "success" : po.status === "pending" ? "warning" : "neutral"}>{po.status}</Badge></div>
              </div>
              <div className="text-xs text-ink-400 mt-2"><Icon name="calendar" size={11} className="inline mr-1" />{fmtDate(po.created)}</div>
            </Card>
          ))}
          {pos.length === 0 && <div className="text-center py-16 text-ink-400"><Icon name="clipboard" size={32} className="mx-auto mb-3 opacity-30" /><p>No purchase orders</p></div>}
        </div>
      )}

      {tab === "prices" && (
        <div className="space-y-2">
          {prices.map(mp => (
            <Card key={mp.id} className="p-4 flex items-center justify-between">
              <div className="font-semibold text-ink-900 text-sm">{mp.material}</div>
              <div className="text-right"><div className="font-black text-ink-900">{fmtCur(mp.price)}</div><div className="text-[10px] text-ink-400">{fmtDate(mp.updated)}</div></div>
            </Card>
          ))}
          {prices.length === 0 && <div className="text-center py-16 text-ink-400"><Icon name="trend" size={32} className="mx-auto mb-3 opacity-30" /><p>No material prices</p></div>}
        </div>
      )}
    </div>
  );
}
