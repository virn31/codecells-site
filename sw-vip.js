// Service worker mínimo — requerido por los navegadores para permitir
// "Agregar a pantalla de inicio" / instalación como PWA.
// No cachea contenido clínico; solo el shell básico para que la instalación
// funcione. Los datos siempre se piden frescos a Airtable vía /api/airtable.

const CACHE_NAME = 'codecells-vip-shell-v1';
const SHELL_FILES = [
  '/portal-vip.html',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_FILES).catch(function(){ /* no bloquear instalación si falla */ });
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Network-first: siempre intenta traer datos frescos; solo usa cache como
// respaldo si no hay conexión (nunca sirve datos clínicos viejos a propósito).
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
