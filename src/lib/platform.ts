/**
 * SiteTrack Pro — runtime platform detection.
 *
 * The SAME Vite bundle runs in a browser (Vercel PWA) and inside the
 * Capacitor native shell (Android/iOS). Native-only behaviour (skip the web
 * service worker, native camera/geolocation plugins later, safe-area insets)
 * branches here instead of scattering Capacitor imports across features.
 *
 * Detection: Capacitor injects `window.Capacitor` with `isNativePlatform()`
 * inside its WebView; it is absent on the open web. No import needed, so this
 * module stays dependency-free and tree-shakeable.
 */

export type AppPlatform = "web" | "android" | "ios";

interface CapGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function cap(): CapGlobal | undefined {
  return (typeof window !== "undefined" ? (window as unknown as { Capacitor?: CapGlobal }).Capacitor : undefined);
}

export function isNativeMobile(): boolean {
  return cap()?.isNativePlatform?.() ?? false;
}

export function getPlatform(): AppPlatform {
  if (!isNativeMobile()) return "web";
  return cap()?.getPlatform?.() === "ios" ? "ios" : "android";
}
