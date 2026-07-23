export interface QuoteRequest {
  commodity?: string;
  grade?: string;
  qty?: number;
  location?: string;
}

export interface QuoteResult {
  vendor: string;
  vendor_id: string;
  commodity: string;
  grade: string;
  price_per_unit: number;
  unit: string;
  qty: number;
  currency: string;
  lead_time_days: number;
  freight_included: boolean;
  gst_pct: number;
  valid_until: string;
  fetched_at: string;
  mock: boolean;
  total?: number;
}

interface VendorDef {
  id: string;
  name: string;
  spread: number;
  lead: number;
  freight: boolean;
  gst: number;
}

interface CommodityDef {
  label: string;
  grades: string[];
  unit: string;
}

const STEEL_BASE: Record<string, number> = { Fe415: 56000, Fe500: 58500, Fe550: 61000, Fe600: 63500 };
const CEMENT_BASE: Record<string, number> = { OPC43: 380, OPC53: 405, PPC: 360, PSC: 350, SRPC: 470 };

const STEEL_VENDORS: VendorDef[] = [
  { id: "jsw",   name: "JSW Steel",  spread: -1.2, lead: 3, freight: true,  gst: 18 },
  { id: "tata",  name: "Tata Steel", spread:  0.0, lead: 4, freight: true,  gst: 18 },
  { id: "essar", name: "Essar Steel", spread: +1.8, lead: 2, freight: false, gst: 18 },
];
const CEMENT_VENDORS: VendorDef[] = [
  { id: "ultratech", name: "UltraTech",     spread: +1.5, lead: 1, freight: true,  gst: 28 },
  { id: "acc",       name: "ACC Cement",    spread:  0.0, lead: 2, freight: true,  gst: 28 },
  { id: "ambuja",    name: "Ambuja Cement", spread: -0.8, lead: 2, freight: false, gst: 28 },
];

export const COMMODITIES: Record<string, CommodityDef> = {
  steel:  { label: "Steel TMT Rebar",  grades: Object.keys(STEEL_BASE),  unit: "MT" },
  cement: { label: "Cement",           grades: Object.keys(CEMENT_BASE), unit: "Bag (50kg)" },
};

export async function fetchQuotes(opts: QuoteRequest = {}): Promise<QuoteResult[]> {
  const { commodity = "", grade = "", qty = 1, location = "" } = opts;
  const base = commodity === "steel" ? STEEL_BASE[grade] : CEMENT_BASE[grade];
  if (!base) return [];
  const vendors = commodity === "steel" ? STEEL_VENDORS : CEMENT_VENDORS;
  const out = await Promise.all(
    vendors.map(v => quoteFromVendor(v, commodity, grade, base, qty, location)),
  );
  return out
    .map(q => ({ ...q, total: q.price_per_unit * qty * (1 + q.gst_pct / 100) + (q.freight_included ? 0 : q.price_per_unit * qty * 0.04) }))
    .sort((a, b) => a.total - b.total);
}

async function quoteFromVendor(
  vendor: VendorDef,
  commodity: string,
  grade: string,
  base: number,
  qty: number,
  location: string,
): Promise<QuoteResult> {
  const regional = location && location.toLowerCase().includes("south") ? -0.6 : 0;
  const spreadPct = vendor.spread + regional;
  const unit = COMMODITIES[commodity]?.unit || "";
  const price = Math.round(base * (1 + spreadPct / 100));
  await new Promise(r => setTimeout(r, 0));
  return {
    vendor: vendor.name,
    vendor_id: vendor.id,
    commodity,
    grade,
    price_per_unit: price,
    unit,
    qty,
    currency: "INR",
    lead_time_days: vendor.lead,
    freight_included: vendor.freight,
    gst_pct: vendor.gst,
    valid_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString().split("T")[0],
    fetched_at: new Date().toISOString(),
    mock: true,
  };
}

export function bestQuote(quotes: QuoteResult[] | null | undefined): QuoteResult | null {
  if (!Array.isArray(quotes) || !quotes.length) return null;
  return quotes[0];
}

export function savings(quotes: QuoteResult[] | null | undefined): number {
  if (!Array.isArray(quotes) || quotes.length < 2) return 0;
  return (quotes[quotes.length - 1].total || 0) - (quotes[0].total || 0);
}

export function quoteCacheKey(opts: QuoteRequest): string {
  return `${opts.commodity || ""}|${opts.grade || ""}|${opts.qty || 1}|${opts.location || ""}`;
}
