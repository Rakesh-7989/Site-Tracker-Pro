import { describe, it, expect } from "vitest";
import {
  validateGstin, validateHsn, buildEInvoicePayload,
  mockGstnAdapter, gstnAdapter, SUPPLY_TYPES,
} from "../src/lib/gstn.js";

describe("gstn — validateGstin", () => {
  it("accepts a canonical GSTIN", () => {
    const r = validateGstin("29ABCDE1234F1Z5");
    expect(r.ok).toBe(true);
    expect(r.canonical).toBe("29ABCDE1234F1Z5");
  });

  it("lowercases input but canonicalizes upper", () => {
    expect(validateGstin("29abcde1234f1z5").ok).toBe(true);
  });

  it("rejects empty", () => {
    expect(validateGstin("").ok).toBe(false);
    expect(validateGstin(null).ok).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateGstin("29ABCDE1234F").ok).toBe(false);
  });
});

describe("gstn — validateHsn", () => {
  it("accepts 2 to 8 digit HSN", () => {
    expect(validateHsn("85").ok).toBe(true);
    expect(validateHsn("85234567").ok).toBe(true);
  });

  it("rejects non-digit", () => {
    expect(validateHsn("ABCD").ok).toBe(false);
  });

  it("rejects out-of-range length", () => {
    expect(validateHsn("1").ok).toBe(false);
    expect(validateHsn("123456789").ok).toBe(false);
  });
});

describe("gstn — buildEInvoicePayload", () => {
  const seller = { gstin: "29ABCDE1234F1Z5", name: "Builders Co", address: "Hyd" };
  const buyer = { gstin: "27ABCDE1234F1Z6", name: "Client Co", state_code: "27" };
  const items = [
    { description: "RCC slab work", hsn_code: "9954", qty: 12.5, unit_price: 5200, gst_rate: 18 },
  ];

  it("builds a valid payload for B2B", () => {
    const r = buildEInvoicePayload({
      invoice: { no: "INV-001", issued_date: "31/05/2026" },
      seller, buyer, items, supplyType: "B2B",
    });
    expect(r.ok).toBe(true);
    expect(r.payload.DocDtls.No).toBe("INV-001");
    expect(r.payload.SellerDtls.Gstin).toBe("29ABCDE1234F1Z5");
    expect(r.payload.ItemList.length).toBe(1);
  });

  it("rejects when seller gstin missing", () => {
    const r = buildEInvoicePayload({ invoice: { no: "I1" }, seller: {}, buyer, items });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("seller-gstin-required");
  });

  it("rejects when buyer gstin missing for B2B", () => {
    const r = buildEInvoicePayload({ invoice: { no: "I1" }, seller, buyer: {}, items });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("buyer-gstin-required-for-b2b");
  });

  it("rejects when no items", () => {
    const r = buildEInvoicePayload({ invoice: { no: "I1" }, seller, buyer, items: [] });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("items-required");
  });

  it("rejects bad supply type", () => {
    const r = buildEInvoicePayload({ invoice: { no: "I1" }, seller, buyer, items, supplyType: "XXX" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid-supply-type");
  });

  it("rejects item without HSN", () => {
    const bad = [{ description: "x", qty: 1, unit_price: 1 }];
    const r = buildEInvoicePayload({ invoice: { no: "I1" }, seller, buyer, items: bad });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("item-hsn-required");
  });

  it("rejects negative price", () => {
    const bad = [{ description: "x", hsn_code: "85", qty: 1, unit_price: -1 }];
    const r = buildEInvoicePayload({ invoice: { no: "I1" }, seller, buyer, items: bad });
    expect(r.ok).toBe(false);
  });

  it("computes CGST + SGST split", () => {
    const r = buildEInvoicePayload({
      invoice: { no: "INV-002" }, seller, buyer, items,
    });
    expect(r.ok).toBe(true);
    const item = r.payload.ItemList[0];
    expect(item.CgstAmt).toBeCloseTo(item.SgstAmt, 2);
    expect(item.IgstAmt).toBe(0);
  });

  it("supports SEZWP supply type", () => {
    const r = buildEInvoicePayload({
      invoice: { no: "INV-003" }, seller, buyer, items, supplyType: "SEZWP",
    });
    expect(r.ok).toBe(true);
    expect(r.payload.TranDtls.SupTyp).toBe("SEZWP");
  });

  it("exposes SUPPLY_TYPES", () => {
    expect(SUPPLY_TYPES.B2B).toBe("B2B");
    expect(SUPPLY_TYPES.SEZWP).toBe("SEZWP");
  });
});

describe("gstn — mockGstnAdapter", () => {
  it("returns IRN on submit", async () => {
    const r = await mockGstnAdapter.submit();
    expect(r.ok).toBe(true);
    expect(r.irn.length).toBe(64);
    expect(r.status).toBe("ACT");
  });
});

describe("gstn — real adapter", () => {
  it("rejects when endpoint missing", async () => {
    const r = await gstnAdapter.submit({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("endpoint-missing");
  });
});
