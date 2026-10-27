// Service worker mínimo — requerido por los navegadores para permitir
// "Agregar a pantalla de inicio" / instalación como PWA.
// No cachea contenido clínico; solo el shell básico para que la instalación
// funcione. Los datos siempre se piden frescos a Airtable/NOVA vía /api.

const CACHE_NAME = 'codecells-paciente-shell-v1';
const SHELL_FILES = [
  '/mi-nivel.html',
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

// ─── Notificaciones del teléfono (lib/avisosPush.js) ─────────────
// El servidor manda { title, body, url, tag } cifrado; aquí solo se muestra.
// El texto ya viene sin datos clínicos si el paciente eligió "discreto", y
// nunca trae el contenido de un mensaje del médico.
self.addEventListener('push', function(event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
  // Acuse al servidor (solo el id del aviso y si se mostró): sin él no hay
  // forma de saber si un aviso se perdió en el camino o en el teléfono.
  var acuse = function(estado) {
    if (!/^[0-9a-f]{12}$/.test(d.id || '')) return Promise.resolve();
    return fetch('/api/nova', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'aviso_recibido', id: d.id, estado: estado }) }).catch(function(){});
  };
  var permiso = (self.Notification && self.Notification.permission) || '?';
  event.waitUntil(self.registration.showNotification(d.title || 'CODE CELLS™', {
    body: d.body || '',
    tag: d.tag || 'codecells',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    data: { url: d.url || '/mi-nivel.html' }
  }).then(function(){ return acuse('mostrado (permiso ' + permiso + ')'); },
          function(e){ return acuse('error al mostrar: ' + ((e && e.name) || '?') + ' (permiso ' + permiso + ')'); }));
});

// Tocar el aviso abre la app (o la trae al frente si ya estaba abierta).
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var destino = new URL((event.notification.data && event.notification.data.url) || '/mi-nivel.html', self.location.origin);
  if (destino.origin !== self.location.origin) destino = new URL('/mi-nivel.html', self.location.origin);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(lista) {
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i];
      if (new URL(c.url).pathname === '/mi-nivel.html' && 'focus' in c) {
        if ('navigate' in c) c.navigate(destino.href);
        return c.focus();
      }
    }
    return self.clients.openWindow(destino.href);
  }));
});
