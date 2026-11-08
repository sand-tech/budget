// Service worker: caches the app shell so the app opens offline.
// Same-origin files: served from cache, refreshed in the background
// (stale-while-revalidate), so a new deploy shows up on the next launch.
// Bump VERSION to force a clean re-download of everything.
const VERSION = 'v3';
const SHELL_CACHE = `budget-shell-${VERSION}`;
const FONT_CACHE = 'budget-fonts-v1';

const SHELL = [
  './',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/ui.js',
  'js/state.js',
  'js/storage.js',
  'js/format.js',
  'js/chart.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== SHELL_CACHE && k !== FONT_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(cacheFirst(FONT_CACHE, request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Every page of the app is index.html; the hash picks the screen.
    const shellUrl = new URL('./', self.registration.scope).href;
    event.respondWith(staleWhileRevalidate(SHELL_CACHE, new Request(shellUrl), event));
    return;
  }
  event.respondWith(staleWhileRevalidate(SHELL_CACHE, request, event));
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(cacheName, request, event) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: true });
  const update = fetch(request)
    .then((res) => {
      if (res.ok && !res.redirected) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  const res = await update;
  return res || new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
}
