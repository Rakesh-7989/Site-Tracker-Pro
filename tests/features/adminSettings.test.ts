import { describe, it, expect } from "vitest";
import { paymentSettingsValid } from "@/features/admin/UpiSettingsCard";

describe("paymentSettingsValid", () => {
  it("allows empty UPI (clears the setting)", () => {
    expect(paymentSettingsValid("")).toBeNull();
    expect(paymentSettingsValid("   ")).toBeNull();
  });

  it("accepts a well-formed VPA", () => {
    expect(paymentSettingsValid("name@okhdfcbank")).toBeNull();
    expect(paymentSettingsValid("rakesh.boyapati@ybl")).toBeNull();
  });

  it("rejects malformed VPA strings", () => {
    expect(paymentSettingsValid("notavpa")).toMatch(/valid UPI ID/i);
    expect(paymentSettingsValid("noat-sign")).toMatch(/valid UPI ID/i);
    expect(paymentSettingsValid("@nohandle")).toMatch(/valid UPI ID/i);
    expect(paymentSettingsValid("a@b")).toMatch(/valid UPI ID/i);
  });
});