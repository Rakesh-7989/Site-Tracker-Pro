// SiteTrack Pro — GSTN E-Invoice (IRN) builder + adapter.
//
// Mandatory for B2B invoices when org annual turnover > ₹5 crore. We don't
// hit GSTN directly from the browser — token rotation + IP whitelisting
// makes that impossible. Instead, the SPA builds the canonical IRP payload
// here, hands it to the gstn-einvoice Edge Function, and the EF talks to a
// licensed GSP (NIC / ClearTax / TaxPro). This file is the PURE payload
// builder + GSTIN validator.

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/;

export function validateGstin(g) {
  if (!g) return { ok: false, reason: "empty" };
  const t = String(g).trim().toUpperCase();
  const ok = GSTIN_REGEX.test(t);
  return { ok, canonical: t, reason: ok ? "" : "format-mismatch" };
}

// HSN code stub validator — between 2 and 8 digits.
export function validateHsn(h) {
  if (!h) return { ok: false, reason: "empty" };
  const t = String(h).replace(/\s/g, "");
  if (!/^\d{2,8}$/.test(t)) return { ok: false, reason: "format" };
  return { ok: true, canonical: t };
}

const SUPPLY_TYPES = Object.freeze({ B2B: "B2B", B2C: "B2C", SEZWP: "SEZWP", EXPWP: "EXPWP" });

/**
 * Build an IRP request body matching the NIC E-Invoice schema v1.1.
 * Returns { ok, payload } or { ok: false, reason, field }.
 */
export function buildEInvoicePayload({
  invoice, seller, buyer, items, supplyType = "B2B",
}) {
  if (!invoice?.no) return { ok: false, reason: "invoice-no-required" };
  if (!seller?.gstin) return { ok: false, reason: "seller-gstin-required" };
  if (!buyer?.gstin && supplyType === "B2B") return { ok: false, reason: "buyer-gstin-required-for-b2b" };
  if (!Array.isArray(items) || items.length === 0) return { ok: false, reason: "items-required" };
  if (!SUPPLY_TYPES[supplyType]) return { ok: false, reason: "invalid-supply-type" };

  const sellerGst = validateGstin(seller.gstin);
  if (!sellerGst.ok) return { ok: false, reason: "seller-gstin-invalid", field: "seller.gstin" };
  if (buyer?.gstin) {
    const buyerGst = validateGstin(buyer.gstin);
    if (!buyerGst.ok) return { ok: false, reason: "buyer-gstin-invalid", field: "buyer.gstin" };
  }

  const validatedItems = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it?.description) return { ok: false, reason: "item-description-required", field: `items[${i}]` };
    if (!it.hsn_code) return { ok: false, reason: "item-hsn-required", field: `items[${i}]` };
    if (!validateHsn(it.hsn_code).ok) return { ok: false, reason: "item-hsn-format", field: `items[${i}].hsn_code` };
    if (!(it.qty > 0)) return { ok: false, reason: "item-qty-positive", field: `items[${i}].qty` };
    if (!(it.unit_price >= 0)) return { ok: false, reason: "item-price-nonneg", field: `items[${i}].unit_price` };
    const total = +(it.qty * it.unit_price).toFixed(2);
    const cgst = +((total * (it.gst_rate ?? 18)) / 200).toFixed(2);
    const sgst = cgst;
    const igst = 0;
    validatedItems.push({
      SlNo: String(i + 1),
      PrdDesc: it.description.slice(0, 300),
      IsServc: it.is_service ? "Y" : "N",
      HsnCd: validateHsn(it.hsn_code).canonical,
      Qty: it.qty,
      Unit: it.unit || "NOS",
      UnitPrice: it.unit_price,
      TotAmt: total,
      Discount: it.discount ?? 0,
      AssAmt: total - (it.discount ?? 0),
      GstRt: it.gst_rate ?? 18,
      CgstAmt: cgst,
      SgstAmt: sgst,
      IgstAmt: igst,
      TotItemVal: +(total + cgst + sgst).toFixed(2),
    });
  }

  const totalValue = validatedItems.reduce((s, it) => s + (it.TotItemVal || 0), 0);
  const totalCgst = validatedItems.reduce((s, it) => s + (it.CgstAmt || 0), 0);
  const totalSgst = validatedItems.reduce((s, it) => s + (it.SgstAmt || 0), 0);

  return {
    ok: true,
    payload: {
      Version: "1.1",
      TranDtls: {
        TaxSch: "GST",
        SupTyp: supplyType,
        IgstOnIntra: "N",
        RegRev: "N",
      },
      DocDtls: {
        Typ: "INV",
        No: invoice.no,
        Dt: invoice.issued_date || new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
      },
      SellerDtls: {
        Gstin: sellerGst.canonical,
        LglNm: seller.name || seller.legal_name,
        Addr1: seller.address || "",
        Loc: seller.city || "",
        Pin: seller.pin || "",
        Stcd: seller.state_code || String(sellerGst.canonical).slice(0, 2),
      },
      BuyerDtls: buyer?.gstin ? {
        Gstin: validateGstin(buyer.gstin).canonical,
        LglNm: buyer.name || buyer.legal_name,
        Pos: buyer.place_of_supply || String(buyer.state_code || "").padStart(2, "0"),
        Addr1: buyer.address || "",
        Loc: buyer.city || "",
        Pin: buyer.pin || "",
        Stcd: buyer.state_code || String(validateGstin(buyer.gstin).canonical).slice(0, 2),
      } : undefined,
      ItemList: validatedItems,
      ValDtls: {
        AssVal: +(totalValue - totalCgst - totalSgst).toFixed(2),
        CgstVal: totalCgst,
        SgstVal: totalSgst,
        IgstVal: 0,
        TotInvVal: totalValue,
      },
    },
  };
}

/** Mock adapter for tests + demo. */
export const mockGstnAdapter = {
  async submit() {
    return {
      ok: true,
      irn: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ack_no: String(Date.now()),
      ack_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      qr_code: "mock-qr-base64",
      status: "ACT",
    };
  },
};

/** Real adapter calls our gstn-einvoice EF. */
export const gstnAdapter = {
  async submit(payload, { endpoint, token } = {}) {
    if (!endpoint) return { ok: false, reason: "endpoint-missing" };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    return await res.json();
  },
};

export { SUPPLY_TYPES };
