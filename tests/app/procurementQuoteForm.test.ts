// SiteTrack Pro — VNext P2.2: procurement-quote form schema parity.
import { describe, it, expect } from "vitest";
import { quoteFormSchema, QUOTE_STATUSES, type QuoteFormLabels } from "@/app/queries/procurementQuotes";
import { defaultValues, validateForm } from "@/app/engines/formEngine";

const labels: QuoteFormLabels = {
  fieldVendor: "Vendor",
  fieldItem: "Item",
  fieldUnitPrice: "Unit price",
  fieldQty: "Qty",
  fieldLeadDays: "Lead (days)",
  fieldValidUntil: "Valid until",
  fieldNotes: "Notes",
  vendorPlaceholder: "— Select vendor —",
  itemPlaceholder: "Item name",
  unitPriceRequired: "Unit price is required.",
  qtyRequired: "Qty is required.",
};

const groups = [
  { label: "Cement", options: [{ value: "c1", label: "Sri Cements" }, { value: "c2", label: "Ultra" }] },
  { label: "Steel", options: [{ value: "s1", label: "Tata Steel" }] },
];

describe("quoteFormSchema", () => {
  it("declares the procurement-quote id with all seven fields", () => {
    const s = quoteFormSchema(labels, groups);
    expect(s.id).toBe("procurement-quote");
    expect(s.fields.map(f => f.name)).toEqual([
      "vendorId", "itemName", "unitPrice", "qty", "leadDays", "validUntil", "notes",
    ]);
  });

  it("wires vendor select with the placeholder option + vendor groups", () => {
    const s = quoteFormSchema(labels, groups);
    const vendor = s.fields.find(f => f.name === "vendorId");
    expect(vendor?.options?.map(o => o.value)).toEqual([""]);
    expect(vendor?.options?.[0].label).toBe("— Select vendor —");
    expect(vendor?.groups?.map(g => g.label)).toEqual(["Cement", "Steel"]);
    expect(vendor?.groups?.[0].options).toHaveLength(2);
    expect(vendor?.optional).toBe(true);
  });

  it("unit price is required with a ₹ prefix and min 0", () => {
    const s = quoteFormSchema(labels, groups);
    const price = s.fields.find(f => f.name === "unitPrice");
    expect(price?.type).toBe("number");
    expect(price?.prefix).toBe("₹");
    expect(price?.validate?.required).toBe(true);
    expect(price?.validate?.min).toBe(0);
    expect(price?.requiredMessage).toBe("Unit price is required.");
  });

  it("qty defaults to 1, is required with min 1", () => {
    const s = quoteFormSchema(labels, groups);
    const qty = s.fields.find(f => f.name === "qty");
    expect(qty?.defaultValue).toBe(1);
    expect(qty?.validate?.required).toBe(true);
    expect(qty?.validate?.min).toBe(1);
    expect(qty?.requiredMessage).toBe("Qty is required.");
  });

  it("optional numeric/date/text fields carry their adornments and bounds", () => {
    const s = quoteFormSchema(labels, groups);
    const lead = s.fields.find(f => f.name === "leadDays");
    expect(lead?.optional).toBe(true);
    expect(lead?.validate?.min).toBe(0);
    const validUntil = s.fields.find(f => f.name === "validUntil");
    expect(validUntil?.type).toBe("date");
    expect(validUntil?.optional).toBe(true);
    const item = s.fields.find(f => f.name === "itemName");
    expect(item?.placeholder).toBe("Item name");
    expect(item?.optional).toBe(true);
  });

  it("defaults prefill the placeholder vendor, qty 1, empty price", () => {
    const s = quoteFormSchema(labels, groups);
    const d = defaultValues(s);
    expect(d.vendorId).toBe("");
    expect(d.qty).toBe(1);
    expect(d.unitPrice).toBe("");
    expect(d.itemName).toBe("");
    expect(d.leadDays).toBe("");
  });

  it("validation rejects a missing unit price", () => {
    const s = quoteFormSchema(labels, groups);
    const { valid, errors } = validateForm(s, { vendorId: "", itemName: "", unitPrice: "", qty: "1" });
    expect(valid).toBe(false);
    expect(errors.unitPrice).toBe("Unit price is required.");
  });

  it("validation rejects a negative unit price and a sub-1 qty", () => {
    const s = quoteFormSchema(labels, groups);
    const { errors } = validateForm(s, { vendorId: "", itemName: "", unitPrice: "-1", qty: "0" });
    expect(errors.unitPrice).toBe("Must be at least 0.");
    expect(errors.qty).toBe("Must be at least 1.");
  });

  it("validation passes a complete valid quote", () => {
    const s = quoteFormSchema(labels, groups);
    const { valid, errors } = validateForm(s, {
      vendorId: "c1", itemName: "Cement 43", unitPrice: "350", qty: "50", leadDays: "", validUntil: "", notes: "",
    });
    expect(valid).toBe(true);
    expect(errors).toEqual({});
  });

  it("keeps QUOTE_STATUSES as the canonical status ladder", () => {
    expect(QUOTE_STATUSES).toEqual(["requested", "received", "selected", "rejected"]);
  });
});
