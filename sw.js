// Swerve service worker: makes the game work offline.
//
// Strategy: NETWORK FIRST. When online, every file is fetched fresh from the
// site (so updates arrive right away) and a copy is saved. When offline, the
// saved copy is used. Do not switch this to cache-first.
//
// The cache name includes the app version, which main.js passes in the URL
// (sw.js?v=1.0.0). A new version means a new service worker and a new cache.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_PREFIX = 'swerve-';
const CACHE_NAME = CACHE_PREFIX + VERSION;

// Every file the game needs, so the first offline launch works.
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/config.js',
  './js/main.js',
  './js/game.js',
  './js/flight.js',
  './js/flightSpawner.js',
  './js/render3d.js',
  './js/levels.js',
  './js/spawner.js',
  './js/collision.js',
  './js/render.js',
  './js/input.js',
  './js/audio.js',
  './js/storage.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch other sites
  event.respondWith(networkFirst(request, url));
});

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // 'no-cache' asks the site whether the file changed, skipping stale browser copies.
    const fresh = await fetch(new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }));
    if (fresh.ok) {
      if (!url.pathname.endsWith('/sw.js')) cache.put(stripSearch(url), fresh.clone());
      return fresh;
    }
    // The site answered with an error (e.g. 404 while GitHub Pages is down):
    // keep playing from the saved copy if there is one.
    const saved = await savedCopy(cache, request, url);
    return saved || fresh;
  } catch (err) {
    // Offline: use the saved copy.
    const saved = await savedCopy(cache, request, url);
    if (saved) return saved;
    throw err;
  }
}

async function savedCopy(cache, request, url) {
  const cached = await cache.match(stripSearch(url));
  if (cached) return cached;
  if (request.mode === 'navigate') {
    return (await cache.match('./')) || (await cache.match('./index.html')) || null;
  }
  return null;
}

// "?debug=1" and similar shouldn't create separate cached copies.
function stripSearch(url) {
  const copy = new URL(url.href);
  copy.search = '';
  copy.hash = '';
  return copy.href;
}
