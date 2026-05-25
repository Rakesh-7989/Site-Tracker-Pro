// SiteTrack Pro — Material price aggregator.
//
// Inspired by TripGZio's 78-provider gateway: oka unified shape, oka
// pluggable adapter per vendor. Procurement teams open BOQ → see live
// price comparison from JSW / Tata / Essar (steel) + UltraTech / ACC /
// Ambuja (cement) → pick the best deal, audit trail captures choice.
//
// Adapter contract:
//   async fetchQuote({ commodity, grade, qty, location }) →
//     { vendor, vendor_logo?, price_per_unit, unit, lead_time_days, currency,
//       valid_until, freight_included, gst_pct, fetched_at, mock? }
//
// Current implementation: deterministic mock values (so demos always show
// consistent numbers). Real adapters drop into adapters/<vendor>.js with
// the SAME contract and the aggregator works unchanged.
//
// Commodities supported in v1:
//   steel  — grades: Fe415, Fe500, Fe550, Fe600
//   cement — grades: OPC43, OPC53, PPC, PSC, SRPC

const STEEL_BASE = { Fe415: 56000, Fe500: 58500, Fe550: 61000, Fe600: 63500 };
const CEMENT_BASE = { OPC43: 380, OPC53: 405, PPC: 360, PSC: 350, SRPC: 470 };

const STEEL_VENDORS = [
  { id: "jsw",   name: "JSW Steel",  spread: -1.2, lead: 3, freight: true,  gst: 18 },
  { id: "tata",  name: "Tata Steel", spread:  0.0, lead: 4, freight: true,  gst: 18 },
  { id: "essar", name: "Essar Steel", spread: +1.8, lead: 2, freight: false, gst: 18 },
];
const CEMENT_VENDORS = [
  { id: "ultratech", name: "UltraTech",     spread: +1.5, lead: 1, freight: true,  gst: 28 },
  { id: "acc",       name: "ACC Cement",    spread:  0.0, lead: 2, freight: true,  gst: 28 },
  { id: "ambuja",    name: "Ambuja Cement", spread: -0.8, lead: 2, freight: false, gst: 28 },
];

/** Public list of supported commodities + grades — used by UI dropdowns. */
export const COMMODITIES = {
  steel:  { label: "Steel TMT Rebar",  grades: Object.keys(STEEL_BASE),  unit: "MT" },
  cement: { label: "Cement",           grades: Object.keys(CEMENT_BASE), unit: "Bag (50kg)" },
};

/** Async aggregator — calls every adapter in parallel, returns sorted by total cost. */
export async function fetchQuotes({ commodity, grade, qty = 1, location = "" } = {}) {
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

async function quoteFromVendor(vendor, commodity, grade, base, qty, location) {
  // Mock: deterministic offset per vendor + a small synthetic regional adjustment.
  const regional = location && location.toLowerCase().includes("south") ? -0.6 : 0;
  const spreadPct = vendor.spread + regional;
  const unit = COMMODITIES[commodity].unit;
  const price = Math.round(base * (1 + spreadPct / 100));
  // Simulate network — yield so the UI can spinner. Tests can override.
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

/** Pick the single best quote — by total landed cost (price + GST + freight if any). */
export function bestQuote(quotes) {
  if (!Array.isArray(quotes) || !quotes.length) return null;
  return quotes[0]; // already sorted
}

/** Savings vs the most expensive quote — useful for the "savings" badge. */
export function savings(quotes) {
  if (!Array.isArray(quotes) || quotes.length < 2) return 0;
  return quotes[quotes.length - 1].total - quotes[0].total;
}

/** Cache key for memoizing — commodity+grade+qty+location. */
export function quoteCacheKey(opts) {
  return `${opts.commodity || ""}|${opts.grade || ""}|${opts.qty || 1}|${opts.location || ""}`;
}
