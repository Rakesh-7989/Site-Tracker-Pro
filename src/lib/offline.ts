// SiteTrack Pro — connectivity primitives (canonical network surface).
//
// This module used to host THREE concerns (IndexedDB blob cache, a
// localStorage sync queue, and connectivity). The blob cache had no
// consumers and the localStorage queue was superseded by the real
// IndexedDB engine in `offlineQueue.ts` (status machine + retry/backoff +
// GC). Both halves were removed — see AGENTS.md "offline consolidation".
//
// Queue depth for UI indicators: use `queueDepth()` from ./offlineQueue.
// Offline write path: submitDpr -> enqueue() -> drainDprQueue().
//
// Inside the Capacitor shell the online source upgrades to the native
// Network plugin (`initNetworkBridge()` — called once from main.tsx);
// browsers keep navigator.onLine + events.

import { isNativeMobile } from "./platform";

let nativeOnline: boolean | null = null;
let bridgeStarted = false;

/** Upgrade the online source to @capacitor/network inside the native shell. */
export function initNetworkBridge(): void {
  if (bridgeStarted || !isNativeMobile()) return;
  bridgeStarted = true;
  void (async () => {
    try {
      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();
      nativeOnline = status.connected;
      await Network.addListener("networkStatusChange", s => {
        nativeOnline = s.connected;
      });
    } catch {
      // Plugin unavailable — keep browser events as the source.
      nativeOnline = null;
    }
  })();
}

export function isOnline(): boolean {
  if (nativeOnline != null) return nativeOnline;
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export function onConnectivityChange(handler: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const up = () => handler(true);
  const down = () => handler(false);
  window.addEventListener("online", up);
  window.addEventListener("offline", down);

  // Mirror native network transitions into the same handler stream.
  let removeNative: (() => void) | undefined;
  if (isNativeMobile()) {
    void (async () => {
      try {
        const { Network } = await import("@capacitor/network");
        const sub = await Network.addListener("networkStatusChange", s => handler(s.connected));
        removeNative = () => void sub.remove();
      } catch { /* browser events already cover it */ }
    })();
  }

  return () => {
    window.removeEventListener("online", up);
    window.removeEventListener("offline", down);
    removeNative?.();
  };
}
