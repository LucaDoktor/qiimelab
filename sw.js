/* Service worker de QiimeLab — caché en tiempo de ejecución, sin lista fija.
 *
 * La app es "un módulo ES por archivo" y no tiene build step: una lista de
 * precache escrita a mano se desincronizaría con cada módulo nuevo. En su
 * lugar cacheamos lo que el navegador pide de verdad:
 *
 *   - navegación / HTML  → network-first (si hay red, la versión fresca gana;
 *                          sin red, servimos el shell cacheado)
 *   - resto del mismo origen (css, js, fuentes, svg, json)
 *                        → cache-first + revalidación en segundo plano
 *
 * El nombre de caché lleva versión; `activate` borra las viejas. Cuando este
 * archivo cambia, el navegador instala un SW nuevo que queda "en espera" y la
 * app muestra el aviso de recargar (ver js/lib/pwa.js).
 */

// Súbelo a mano cuando quieras forzar un vaciado de caché (normalmente no hace
// falta: el propio cambio de bytes de este archivo ya instala un SW nuevo).
const VERSION = 'v2';
const CACHE = 'qiimelab-' + VERSION;

// El shell mínimo que garantiza que la app arranca sin red la primera vez que
// ya se visitó. Son rutas estables (no módulos de análisis): si alguna falla
// la instalación NO se aborta. Las fuentes van aquí porque ahora son locales
// (css/fonts.css) y el shell sin ellas parpadea a la tipografía del sistema.
const SHELL = [
  './',
  './index.html',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/fonts.css',
  './fonts/IBMPlexSans-var.latin.woff2',
  './fonts/IBMPlexSans-var.latin-ext.woff2',
  './fonts/IBMPlexSerif-SemiBold.latin.woff2',
  './fonts/IBMPlexMono-Regular.latin.woff2',
  './js/app.js',
  './manifest.json',
  './favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    // no llamamos a skipWaiting(): dejamos que el usuario decida cuándo recargar
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('qiimelab-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// La página pide activar el SW en espera (tras confirmar el aviso de recarga).
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isHTMLRequest(req) {
  return req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) Navegación / HTML → network-first, con el shell como red de seguridad.
  if (isHTMLRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) ||
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          Response.error();
      }
    })());
    return;
  }

  // 2) Resto del mismo origen (css/js/fuentes/svg/json/woff2) → cache-first +
  //    revalidación en segundo plano. Ya no hay orígenes externos que atender.
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.ok && (res.status === 200)) cache.put(req, res.clone());
        return res;
      }).catch(() => null);

      if (cached) {
        event.waitUntil(network); // actualiza para la próxima visita
        return cached;
      }
      const res = await network;
      return res || Response.error();
    })());
  }
});
