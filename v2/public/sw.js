const SHELL_CACHE = "stv2-shell-v1";
const ASSET_CACHE = "stv2-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
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
  if (!isSameOrigin(url)) return;

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

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          if (req.mode === "navigate" || req.destination === "document") {
            void cache.put(req.clone().url, fresh.clone());
          }
          return fresh;
        }
        const cached = (await cache.match(url.href)) || (await cache.match("/"));
        return cached || fresh;
      } catch {
        const cached = (await cache.match(url.href)) || (await cache.match("/"));
        if (cached) return cached;
        return new Response("Offline", { status: 503 });
      }
    })(),
  );
});
