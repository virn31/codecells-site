// Service Worker mínimo del Portal Médico CODE CELLS®.
// Su único propósito es cumplir el requisito técnico que Chrome/Android
// exige para ofrecer el prompt nativo de "Instalar app". No cachea nada
// todavía — cada carga sigue yendo a la red, como hasta ahora.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Passthrough intencional: no interceptamos ni cacheamos peticiones.
});
