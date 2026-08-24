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

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export function onConnectivityChange(handler: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const up = () => handler(true);
  const down = () => handler(false);
  window.addEventListener("online", up);
  window.addEventListener("offline", down);
  return () => {
    window.removeEventListener("online", up);
    window.removeEventListener("offline", down);
  };
}
