/* ============================================================
   Hi-Market Service Worker
   - Interface (HTML/JS/CSS/images) : réseau d'abord, cache en secours hors-ligne.
   - API (/api/…) : JAMAIS mise en cache (stocks, ventes, droits : toujours frais et propres à l'utilisateur).
   ============================================================ */

const CACHE_NAME = 'himarket-v2';
const SCOPE = self.registration.scope; // ex. https://boutique.com/  ou  https://user.github.io/MARAKAFA/

const PRECACHE_ASSETS = [SCOPE, SCOPE + 'manifest.json', SCOPE + 'icons/icon-192.png', SCOPE + 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Uniquement les GET de même origine, et jamais l'API
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match(SCOPE) : undefined))
      )
  );
});
