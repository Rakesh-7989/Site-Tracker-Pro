import { useState, useEffect } from "react";
import { PlanGate } from "@/auth";
import { Icon } from "@/components/ui/atoms";
import { COMMODITIES, fetchQuotes, bestQuote, savings } from "@/lib/materialPrices";

export function MaterialPricesView(): JSX.Element {
  return <PlanGate feature="material_aggregator"><MaterialPricesInner /></PlanGate>;
}

function MaterialPricesInner(): JSX.Element {
  const [commodity, setCommodity] = useState("steel");
  const [grade, setGrade] = useState("Fe500");
  const [qty, setQty] = useState(10);
  const [location, setLocation] = useState("");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const grades = (COMMODITIES as any)[commodity]?.grades || [];
  useEffect(() => { setGrade(grades[0] || ""); }, [commodity]);

  const fetch = async () => {
    setLoading(true);
    const q = await fetchQuotes({ commodity, grade, qty: Number(qty) || 1, location } as any);
    setQuotes(q); setLoading(false);
  };
  const best = bestQuote(quotes);
  const sav = savings(quotes);

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Procurement</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Material Prices</h1>
        <p className="text-fg-secondary text-sm mt-2">Live vendor comparison across 6 suppliers. Total landed cost includes GST + freight where applicable.</p>
      </div>
      <div className="bg-panel rounded-2xl p-5 mb-5 grid sm:grid-cols-5 gap-3 shadow-editorial border-default">
            <div><label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary mb-1.5 block">Commodity</label><select value={commodity} onChange={e => setCommodity(e.target.value)} className="w-full p-2.5 border border-default rounded-xl text-sm outline-none focus:border-accent">{Object.entries(COMMODITIES).map(([k, v]: any) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div><label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary mb-1.5 block">Grade</label><select value={grade} onChange={e => setGrade(e.target.value)} className="w-full p-2.5 border border-default rounded-xl text-sm outline-none focus:border-accent">{grades.map((g: string) => <option key={g} value={g}>{g}</option>)}</select></div>
            <div><label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary mb-1.5 block">Qty ({(COMMODITIES as any)[commodity]?.unit})</label><input type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} className="w-full p-2.5 border border-default rounded-xl text-sm outline-none focus:border-accent" /></div>
            <div><label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary mb-1.5 block">Location hint</label><input value={location} onChange={e => setLocation(e.target.value)} placeholder="South India / Pune…" className="w-full p-2.5 border border-default rounded-xl text-sm outline-none focus:border-accent" /></div>
            <div className="flex items-end"><button onClick={fetch} disabled={loading} className="w-full px-4 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide disabled:opacity-60">{loading ? "Fetching…" : "Compare prices"}</button></div>
          </div>
          {quotes.length > 0 && <>
            {sav > 0 && best && <div className="mb-5 bg-success-tint border-l-4 border-success rounded-r-2xl p-4 flex items-center gap-4 shadow-editorial"><div className="w-10 h-10 bg-success-tint rounded-xl flex items-center justify-center"><Icon name="wallet" size={18} className="text-success" /></div><div className="flex-1"><div className="font-display font-semibold text-fg-primary text-base tracking-editorial">Save ₹{sav.toLocaleString("en-IN", { maximumFractionDigits: 0 })} by choosing {best.vendor}</div><div className="text-success text-xs mt-1">Lowest total landed cost across {quotes.length} vendors today.</div></div></div>}
            <div className="bg-panel rounded-2xl overflow-x-auto shadow-editorial border-default">
              <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-secondary/60 text-[10px] font-bold uppercase tracking-[0.18em] text-fg-secondary border-b border-default">
                <div className="col-span-3">Vendor</div><div className="col-span-2 text-right">Unit ₹</div><div className="col-span-2 text-right">GST + Freight</div><div className="col-span-2 text-right">Total landed</div><div className="col-span-2">Lead</div><div className="col-span-1 text-right">Valid till</div>
              </div>
              {quotes.map((q: any, i: number) => (<div key={q.vendor_id} className={`grid grid-cols-12 gap-3 px-5 py-4 items-center text-sm${i < quotes.length - 1 ? " border-b border-default" : ""}`}>
                <div className="col-span-4 md:col-span-3"><div className="font-display font-semibold text-fg-primary tracking-editorial">{q.vendor}{i === 0 && <span className="ml-2 text-[10px] font-bold tracking-wider uppercase bg-success-tint text-success px-2 py-0.5 rounded-full">Best</span>}</div><div className="text-[11px] text-fg-secondary">{q.grade} · per {q.unit}</div></div>
                <div className="col-span-3 md:col-span-2 text-right font-mono">₹{q.price_per_unit.toLocaleString("en-IN")}</div>
                <div className="hidden md:block md:col-span-2 text-right text-[12px] text-fg-secondary">{q.gst_pct}% GST{q.freight_included ? " · freight in" : " · +4% freight"}</div>
                <div className="col-span-3 md:col-span-2 text-right font-display font-bold text-fg-primary">₹{Math.round(q.total).toLocaleString("en-IN")}</div>
                <div className="hidden lg:block lg:col-span-2 text-[12px] text-fg-secondary">{q.lead_time_days} days</div>
                <div className="hidden lg:block lg:col-span-1 text-right text-[11px] text-fg-secondary">{q.valid_until}</div>
              </div>))}
            </div>
          </>}
          {quotes.length === 0 && !loading && <div className="bg-panel rounded-2xl p-12 text-center" style={{ border: "1px dashed var(--st-line)" }}><div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-warning-tint flex items-center justify-center"><Icon name="truck" size={24} className="text-warning" /></div><div className="font-display text-lg font-semibold text-fg-primary tracking-editorial mb-2">Pick commodity + grade + qty to fetch live quotes</div><p className="text-fg-secondary text-sm max-w-md mx-auto">Steel: JSW · Tata · Essar. Cement: UltraTech · ACC · Ambuja. More vendors via API on request.</p></div>}
    </div>
  );
}
