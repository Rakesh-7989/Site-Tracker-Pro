import { describe, it, expect } from "vitest";
import { detectVendor, parseCsv, toCanonicalBatches } from "../src/lib/contractorMigration";

describe("contractorMigration — detectVendor", () => {
  it("detects Powerplay projects export", () => {
    const r = detectVendor(["project_id", "project_name", "client_name", "site_address", "budget_inr"]);
    expect(r.vendor).toBe("powerplay");
    expect(r.target).toBe("projects");
  });

  it("detects BuildSupply BOQ export", () => {
    const r = detectVendor(["code", "description", "unit_of_measurement", "quantity", "unit_rate", "category"]);
    expect(r.vendor).toBe("buildsupply");
    expect(r.target).toBe("boq");
  });

  it("detects Falconbrick labour export", () => {
    const r = detectVendor(["worker_id", "name", "aadhaar", "trade", "daily_wage"]);
    expect(r.vendor).toBe("falconbrick");
    expect(r.target).toBe("labour");
  });

  it("returns unknown for foreign header set", () => {
    const r = detectVendor(["something", "totally", "different"]);
    expect(r.vendor).toBe("unknown");
  });
});

describe("contractorMigration — parseCsv (Powerplay BOQ)", () => {
  const csv = [
    "item_code,description,uom,qty,rate,category",
    "C001,RCC slab,cum,12.5,5200,Civil",
    "C002,Brickwork,cum,40,4500,Civil",
  ].join("\n");

  it("parses two rows into normalized form", () => {
    const r = parseCsv(csv);
    expect(r.vendor).toBe("powerplay");
    expect(r.target).toBe("boq");
    expect(r.rows.length).toBe(2);
    expect(r.errors.length).toBe(0);
    expect(r.rows[0].code).toBe("C001");
    expect(parseFloat(r.rows[0].qty)).toBe(12.5);
  });
});

describe("contractorMigration — parseCsv (Falconbrick labour)", () => {
  const csv = [
    "worker_id,name,aadhaar,trade,daily_wage",
    "W1,Ramesh K,123412341234,Mason,650",
    "W2,Lakshmi P,, Carpenter ,550",       // missing aadhaar OK
    "W3,Bad Aadhaar,12-34,Mason,550",      // bad aadhaar
  ].join("\n");

  it("accepts missing aadhaar but rejects malformed one", () => {
    const r = parseCsv(csv);
    expect(r.vendor).toBe("falconbrick");
    expect(r.rows.length).toBe(2);                      // W1 and W2
    expect(r.errors.length).toBe(1);                    // W3
    expect(r.errors[0].reason).toBe("aadhaar-format");
  });
});

describe("contractorMigration — parseCsv (BuildSupply vendors)", () => {
  const csv = [
    "supplier_code,supplier_name,gstin,rating,category,contact_phone",
    "V1,Acme Steel,29ABCDE1234F1Z5,4.5,Steel,9876543210",
    "V2,No GSTIN Co,,3.5,Cement,1234567890",
    "V3,Bad GSTIN Co,INVALIDGSTIN1,2.0,Other,5555555555",
  ].join("\n");

  it("validates GSTIN format", () => {
    const r = parseCsv(csv);
    expect(r.target).toBe("vendors");
    expect(r.rows.length).toBe(2);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].reason).toBe("invalid-gstin");
  });
});

describe("contractorMigration — quoted fields", () => {
  it("respects double quotes around comma-bearing values", () => {
    const csv = [
      "item_code,description,uom,qty,rate",
      'C001,"slab, RCC type-A",cum,10,5000',
    ].join("\n");
    const r = parseCsv(csv);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].description).toBe("slab, RCC type-A");
  });

  it("respects escaped double quotes", () => {
    const csv = [
      "item_code,description,uom,qty,rate",
      'C001,"hello ""world""",cum,1,1',
    ].join("\n");
    const r = parseCsv(csv);
    expect(r.rows[0].description).toBe('hello "world"');
  });
});

describe("contractorMigration — toCanonicalBatches", () => {
  it("maps Powerplay BOQ rows into Supabase shape with project_id", () => {
    const r = parseCsv([
      "item_code,description,uom,qty,rate,category",
      "C001,RCC slab,cum,12.5,5200,Civil",
    ].join("\n"));
    const batches = toCanonicalBatches(r.target, r.rows, { project_id: "p1" });
    expect(batches.boq.length).toBe(1);
    expect(batches.boq[0].project_id).toBe("p1");
    expect(batches.boq[0].qty).toBe(12.5);
    expect(batches.boq[0].rate).toBe(5200);
  });

  it("maps BuildSupply vendors with org_id stamped", () => {
    const r = parseCsv([
      "supplier_code,supplier_name,gstin,rating,category,contact_phone",
      "V1,Acme,29ABCDE1234F1Z5,4.5,Steel,99999",
    ].join("\n"));
    const b = toCanonicalBatches(r.target, r.rows, { org_id: "o1" });
    expect(b.vendors.length).toBe(1);
    expect(b.vendors[0].org_id).toBe("o1");
    expect(b.vendors[0].rating).toBe(4.5);
  });
});

describe("contractorMigration — edge cases", () => {
  it("returns unknown-format for foreign CSV", () => {
    const r = parseCsv("a,b,c\n1,2,3");
    expect(r.vendor).toBe("unknown");
    expect(r.errors[0].reason).toBe("unknown-format");
  });

  it("returns empty-input for empty string", () => {
    const r = parseCsv("");
    expect(r.errors[0].reason).toBe("empty-input");
  });

  it("returns no-data-rows when only header", () => {
    const r = parseCsv("project_id,project_name,client_name,site_address,budget_inr");
    expect(r.errors[0].reason).toBe("no-data-rows");
  });
});
