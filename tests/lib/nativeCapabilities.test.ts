// Unit tests for native capability bridges — web fallbacks + native paths
// (Capacitor modules mocked via hoisted factories with call counters).

import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ native: false, photoCalls: 0, geoCalls: 0 }));

vi.mock("@capacitor/camera", () => ({
  Camera: {
    checkPermissions: async () => ({ camera: state.native ? "granted" : "denied" }),
    getPhoto: async () => {
      state.photoCalls++;
      return { webPath: "blob:http://localhost/fake" };
    },
  },
  CameraResultType: { Uri: "uri" },
  CameraSource: { Camera: "CAMERA" },
}));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    getCurrentPosition: async () => {
      state.geoCalls++;
      return { coords: { latitude: 17.4, longitude: 78.4, accuracy: 12 } };
    },
  },
}));

type CapStub = { isNativePlatform?: () => boolean; getPlatform?: () => string };
function stubShell(native: boolean): void {
  (window as unknown as { Capacitor?: CapStub }).Capacitor = {
    isNativePlatform: () => native,
    getPlatform: () => (native ? "android" : "web"),
  };
}

afterEach(() => {
  stubShell(false);
  state.native = false;
  state.photoCalls = 0;
  state.geoCalls = 0;
});

describe("nativeTakePhoto", () => {
  it("returns null on the web WITHOUT invoking the plugin", async () => {
    const { nativeTakePhoto } = await import("@/lib/native-capabilities");
    await expect(nativeTakePhoto()).resolves.toBeNull();
    expect(state.photoCalls).toBe(0);
  });

  it("returns a Blob from the native camera result", async () => {
    stubShell(true);
    state.native = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      // jsdom has no Response class — shape only what the wrapper consumes.
      blob: async () => new Blob(["img"], { type: "image/jpeg" }),
    })));
    const { nativeTakePhoto } = await import("@/lib/native-capabilities");
    const blob = await nativeTakePhoto();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("image/jpeg");
    expect(state.photoCalls).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe("nativeGetPosition", () => {
  it("returns null on the web WITHOUT invoking the plugin", async () => {
    const { nativeGetPosition } = await import("@/lib/native-capabilities");
    await expect(nativeGetPosition()).resolves.toBeNull();
    expect(state.geoCalls).toBe(0);
  });

  it("maps native coords", async () => {
    stubShell(true);
    state.native = true;
    const { nativeGetPosition } = await import("@/lib/native-capabilities");
    await expect(nativeGetPosition()).resolves.toEqual({ lat: 17.4, lon: 78.4, accuracy: 12 });
    expect(state.geoCalls).toBe(1);
  });
});
