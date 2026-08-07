// SiteTrack Pro — service worker (network-first PWA, re-enabled as ST-013).
//
// The previous cache-first SW served a stale app shell + hashed JS chunks after
// every deploy and hung on "Loading your workspace…". We therefore disabled it
// (index.html unregisters + stub sw.js). ST-013 re-adds a *safe* PWA using a
// NETWORK-FIRST strategy:
//
//   - HTML/navigation requests: always try the network first, fall back to a
//     stale copy only when offline. This means every online visit fetches the
//     latest index.html, whose hashed /assets/* chunks reference the newest
//     build — no stale-shell hang. The old bug came from cache-*first* (serving
//     a cached index.html ahead of the network); network-first cannot produce
//     that because the network always wins while connected.
//   - Immutable /assets/* chunks: still goes to network first, then we cache
//     the response for offline reuse. Because chunk filenames are content-hashed,
//     a new deploy references different URLs, so the cache never returns stale JS.
//   - Everything else (API, other origins): network only, never cached.
//
// NOTE: DPR offline capture uses IndexedDB via src/lib/dprOfflineSync.ts and is
// independent of this SW. This worker only provides the installable-PWA + app
// shell offline fallback.

const SHELL_CACHE = "sitetrack-shell-v1";
const ASSET_CACHE = "sitetrack-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const isAsset = (url) => url.pathname.startsWith("/assets/");
const isSameOrigin = (url) => url.origin === self.location.origin;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (!isSameOrigin(url)) return; // pass through: supabase etc.

  // Immutable hashed assets: always try network, cache success for offline.
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        const fresh = await fetch(req).catch(() => null);
        if (fresh && fresh.ok) {
          const cache = await caches.open(ASSET_CACHE);
          void cache.put(req, fresh.clone());
          return fresh;
        }
        if (cached) return cached;
        return fresh || new Response("", { status: 503 });
      })(),
    );
    return;
  }

  // HTML / navigation: network-first with stale-shield fallback.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          if (req.mode === "navigate" || req.destination === "document") void cache.put(req.clone().url, fresh.clone());
          return fresh;
        }
        const cached = await cache.match(url.href) || await cache.match("/");
        if (cached) return cached;
        return fresh;
      } catch {
        const cached = await cache.match(url.href) || await cache.match("/");
        return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })(),
  );
});