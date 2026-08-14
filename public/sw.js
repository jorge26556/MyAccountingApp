/**
 * Service worker de MyContabilidadApp.
 *
 * Regla que no se negocia: NADA de Supabase se cachea. Son datos financieros
 * bajo sesion; guardarlos en la CacheStorage los dejaria legibles en el disco
 * del dispositivo despues de cerrar sesion, y ademas mostraria saldos viejos
 * como si fueran actuales.
 *
 * Estrategia:
 *   - navegacion (HTML) → red primero, cache como respaldo sin conexion
 *   - assets con hash de Vite → cache primero (el nombre cambia en cada build)
 *   - todo lo demas → red
 */

const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cualquier cosa que no sea de nuestro origen (Supabase, fuentes) va directo
  // a la red y jamas se cachea.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then(cached => cached ?? Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        cached =>
          cached ??
          fetch(request).then(response => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then(cache => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});
