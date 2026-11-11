// Avisos para los clientes del catálogo (sin cuenta ni app): solo muestra la notificación del pedido y abre su seguimiento.
// No controla ninguna página (se registra con un alcance que no existe), así no se mezcla con sw.js de la app.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { t: 'Tu pedido', b: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.t || 'Tu pedido', { body: d.b || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { u: d.u || './' } }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close(); var u = (e.notification.data && e.notification.data.u) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
    for (var i = 0; i < l.length; i++) { if (l[i].url.indexOf(u.split('&ped=')[1] || '§') >= 0 && 'focus' in l[i]) return l[i].focus(); }
    return self.clients.openWindow(u);
  }));
});
