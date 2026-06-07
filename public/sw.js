// SiteTrack Pro — service worker DISABLED (self-destruct stub).
//
// The previous implementation was cache-first ("return cached || fetch"), which
// served a STALE app shell + hashed JS chunks after every deploy. When a cached
// index.html referenced chunk hashes that no longer existed on the new build,
// the SW handed back index.html in place of the missing .js — the app failed to
// boot and hung forever on "Loading your workspace…".
//
// For a pre-launch SPA that deploys constantly, asset precaching does more harm
// than good. This stub takes over from any previously-installed SW, purges all
// of its caches, unregisters itself, and reloads open tabs so returning
// visitors recover automatically without a manual hard-refresh.
//
// (Offline DPR capture does NOT depend on this — that uses IndexedDB via
// src/lib/offlineQueue.js. A correct network-first PWA can be re-added later.)

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: "window" });
        clients.forEach((c) => c.navigate(c.url));
      } catch (_) {
        /* best-effort cleanup — never throw from activate */
      }
    })()
  );
});

// No "fetch" handler — every request goes straight to the network.
