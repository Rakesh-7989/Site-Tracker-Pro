/**
 * SiteTrack Pro — native-shell bootstrap (Capacitor).
 *
 * Runs ONLY inside the Capacitor WebView (no-ops on the open web). Owns the
 * two things a responsive web app cannot express by itself:
 *   1. Status-bar styling matched to the brand (edge-to-edge era).
 *   2. The Android hardware BACK button contract:
 *        drawer open  -> close drawer
 *        history      -> navigate back
 *        root         -> exit app
 *
 * Wired from main.tsx (status bar) and ShellLayout (back button, which needs
 * the router). All plugin imports are dynamic so the web bundle never pays
 * for them.
 */

import { isNativeMobile, getPlatform } from "./platform";

export async function initNativeShell(): Promise<void> {
  if (!isNativeMobile()) return;

  // Flag CSS hooks (tap-highlight/overscroll scoping) before first paint work.
  document.documentElement.classList.add("native-shell");

  try {
    const [{ StatusBar, Style }] = await Promise.all([import("@capacitor/status-bar")]);
    if (getPlatform() === "ios") {
      // iOS overlays the bar; keep dark icons over our light surfaces.
      await StatusBar.setStyle({ style: Style.Light });
    } else {
      // Android: brand-cream bar behind system UI (best-effort — SDK 35+
      // edge-to-edge may ignore setBackgroundColor; safe-area padding covers us).
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: "#FDFBF6" }).catch(() => {});
    }
  } catch {
    // Status-bar API unavailable (web preview / older device) — cosmetic only.
  }
}

/**
 * Register the Android hardware-back contract. `consume()` returns true when
 * the caller handled the press (drawer close / route pop); false = at the app
 * root -> the OS should exit.
 */
export async function attachAndroidBackButton(consume: () => boolean): Promise<() => void> {
  if (!isNativeMobile() || getPlatform() !== "android") return () => {};
  const { App } = await import("@capacitor/app");
  const sub = await App.addListener("backButton", () => {
    if (!consume()) App.exitApp().catch(() => {});
  });
  return () => void sub.remove();
}
