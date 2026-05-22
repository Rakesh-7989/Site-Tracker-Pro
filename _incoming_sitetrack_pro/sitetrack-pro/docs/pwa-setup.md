# SiteTrack PWA Setup Guide
# Run this to convert your app into an installable mobile PWA

## Step 1: manifest.json
## Place this file in your /public folder

```json
{
  "name": "SiteTrack Pro",
  "short_name": "SiteTrack",
  "description": "Construction site management and tracking",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#f97316",
  "orientation": "any",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "screenshots": [
    { "src": "/screenshot1.png", "sizes": "1280x720", "type": "image/png" }
  ],
  "categories": ["business", "productivity"],
  "lang": "en-IN"
}
```

## Step 2: service-worker.js
## Place in /public folder

```javascript
const CACHE_NAME = 'sitetrack-v1';
const STATIC_ASSETS = ['/', '/index.html', '/static/js/main.js', '/static/css/main.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// Push notification handler
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(data.title || 'SiteTrack Update', {
    body: data.body || 'New site activity',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'view') {
    e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
  }
});
```

## Step 3: Register SW in index.html
## Add before </body>

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#f97316" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="SiteTrack" />
<link rel="apple-touch-icon" href="/icon-192.png" />

<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.log('SW failed:', err));
    });
  }
</script>
```

## Step 4: Deploy to Vercel/Netlify (free)

```bash
# Install Vite + React
npm create vite@latest sitetrack -- --template react
cd sitetrack

# Copy sitetrack.jsx into src/App.jsx
# Install dependencies
npm install recharts

# Build
npm run build

# Deploy to Vercel
npm i -g vercel
vercel --prod
```

## Step 5: Install on Phone
1. Open the deployed URL on mobile Chrome / Safari
2. Chrome: Menu → "Add to Home Screen"
3. Safari (iOS): Share → "Add to Home Screen"
4. App installs like a native app — works offline too!

## Generate app icons
Use https://realfavicongenerator.net to generate icon-192.png and icon-512.png
from your logo image.
