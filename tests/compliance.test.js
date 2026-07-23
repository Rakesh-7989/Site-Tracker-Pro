import { describe, it, expect } from "vitest";
import {
  validateRera, validateGstin, validatePan, validateEpfo,
  checkReraStatus, checkGstinStatus, checkEpfoStatus,
  projectComplianceStatus,
} from "../src/lib/compliance";

describe("compliance.validateRera", () => {
  it("accepts well-formed RERA numbers", () => {
    expect(validateRera("TS/RERA/PROJECT/12345").ok).toBe(true);
    expect(validateRera("MH/RERA/A0000001234").ok).toBe(true);
  });
  it("rejects empty + malformed", () => {
    expect(validateRera("").ok).toBe(false);
    expect(validateRera("not-a-number").ok).toBe(false);
  });
});

describe("compliance.validateGstin", () => {
  it("accepts a well-formed 15-char GSTIN", () => {
    const r = validateGstin("36AAACT2727Q1ZZ");
    expect(r.ok).toBe(true);
    expect(r.state).toBe("Telangana");
    expect(r.pan_embedded).toBe("AAACT2727Q");
  });
  it("rejects wrong length or pattern", () => {
    expect(validateGstin("36ABCDE").ok).toBe(false);
    expect(validateGstin("xxxxxxxxxxxxxxx").ok).toBe(false);
  });
});

describe("compliance.validatePan", () => {
  it("accepts AAAPL1234C-style PANs", () => {
    expect(validatePan("ABCDE1234F").ok).toBe(true);
  });
  it("rejects PANs with wrong layout", () => {
    expect(validatePan("ABCD12345E").ok).toBe(false);
    expect(validatePan("").ok).toBe(false);
  });
});

describe("compliance.validateEpfo", () => {
  it("accepts standard EPFO code", () => {
    expect(validateEpfo("TN/CHN/0123456").ok).toBe(true);
    expect(validateEpfo("KA/BNG/0098765/000").ok).toBe(true);
  });
  it("rejects malformed", () => {
    expect(validateEpfo("XX").ok).toBe(false);
  });
});

describe("compliance.checkReraStatus", () => {
  it("returns verified+active for even last-digit (mock determinism)", async () => {
    const r = await checkReraStatus("TS/RERA/PROJECT/12342");
    expect(r.verified).toBe(true);
    expect(r.status).toBe("REGISTERED_ACTIVE");
  });
  it("returns expired for odd last-digit", async () => {
    const r = await checkReraStatus("TS/RERA/PROJECT/12345");
    expect(r.status).toBe("REGISTRATION_EXPIRED");
  });
  it("fails when format invalid", async () => {
    const r = await checkReraStatus("garbage");
    expect(r.verified).toBe(false);
  });
});

describe("compliance.checkGstinStatus + checkEpfoStatus", () => {
  it("checkGstinStatus returns name + state for valid GSTIN", async () => {
    const r = await checkGstinStatus("36AAACT2727Q1ZZ");
    expect(r.verified).toBe(true);
    expect(r.state).toBe("Telangana");
    expect(r.status).toBe("ACTIVE");
  });
  it("checkEpfoStatus returns compliant for valid code", async () => {
    const r = await checkEpfoStatus("TN/CHN/0123456");
    expect(r.verified).toBe(true);
    expect(r.status).toBe("COMPLIANT");
  });
});

describe("compliance.projectComplianceStatus", () => {
  it("all three compliant → emerald", () => {
    const r = projectComplianceStatus({
      rera: { verified: true, status: "REGISTERED_ACTIVE" },
      gst:  { verified: true, status: "ACTIVE" },
      epfo: { verified: true, status: "COMPLIANT" },
    });
    expect(r.color).toBe("emerald");
  });
  it("partial → amber", () => {
    const r = projectComplianceStatus({
      rera: { verified: true, status: "REGISTERED_ACTIVE" },
      gst:  { verified: false },
      epfo: { verified: false },
    });
    expect(r.color).toBe("amber");
  });
  it("none verified → red", () => {
    expect(projectComplianceStatus({}).color).toBe("red");
  });
  it("null → stone", () => {
    expect(projectComplianceStatus(null).color).toBe("stone");
  });
});
