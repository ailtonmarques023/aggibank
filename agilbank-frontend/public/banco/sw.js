const CACHE_VERSION = 'agilbank-pwa-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_URLS = [
  '/banco/manifest.webmanifest',
  '/banco/icons/icon-192.png',
  '/banco/icons/icon-512.png',
  '/banco/icons/apple-touch-icon.png',
  '/banco/js/pwa-register.js'
];

function isApiRequest(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

function isSafeStaticAsset(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/banco/')) return false;
  if (isApiRequest(url)) return false;
  if (url.search) return false;
  if (request.headers.has('authorization')) return false;

  return /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname) ||
    url.pathname === '/banco/manifest.webmanifest';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('agilbank-pwa-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isApiRequest(url) || !isSafeStaticAsset(request, url)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const copy = response.clone();
        caches.open(STATIC_CACHE).then((cache) => {
          cache.put(request, copy);
        });
        return response;
      });
    })
  );
});
