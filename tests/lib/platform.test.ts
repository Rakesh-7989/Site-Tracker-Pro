// Unit tests for runtime platform detection (Capacitor global probing).

import { afterEach, describe, expect, it } from "vitest";
import { getPlatform, isNativeMobile } from "@/lib/platform/platform";

type CapStub = { isNativePlatform?: () => boolean; getPlatform?: () => string };

function stubCapacitor(value: CapStub | undefined): void {
  const w = window as unknown as { Capacitor?: CapStub };
  if (value === undefined) delete w.Capacitor;
  else w.Capacitor = value;
}

afterEach(() => stubCapacitor(undefined));

describe("isNativeMobile", () => {
  it("is false on the open web (no window.Capacitor)", () => {
    expect(isNativeMobile()).toBe(false);
  });

  it("is true inside the Capacitor shell", () => {
    stubCapacitor({ isNativePlatform: () => true, getPlatform: () => "android" });
    expect(isNativeMobile()).toBe(true);
  });

  it("is false when Capacitor exists but reports web", () => {
    stubCapacitor({ isNativePlatform: () => false, getPlatform: () => "web" });
    expect(isNativeMobile()).toBe(false);
  });
});

describe("getPlatform", () => {
  it("defaults to web without the global", () => {
    expect(getPlatform()).toBe("web");
  });

  it("maps android and ios shells", () => {
    stubCapacitor({ isNativePlatform: () => true, getPlatform: () => "android" });
    expect(getPlatform()).toBe("android");
    stubCapacitor({ isNativePlatform: () => true, getPlatform: () => "ios" });
    expect(getPlatform()).toBe("ios");
  });
});
