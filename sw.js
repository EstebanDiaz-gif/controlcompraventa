var C='ventas-v92',G='https://www.gstatic.com/firebasejs/10.12.2/';
var F=['./','./index.html','./app.html','./firebase-config.js','./access.js','./plans.js','./almacen.js','./almacen-calc.js','./caja.js','./traspasos.js','./repartos.js','./vendedores.js','./pagos-config.js','./scanner.js','./planilla.js','./agenda.js','./turnos.js','./fotos.js','./temas.js','./intro.js','./promos.js','./promos-ui.js','./demo.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
var X=[G+'firebase-app.js',G+'firebase-auth.js',G+'firebase-firestore.js',G+'firebase-functions.js'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return Promise.all(F.map(function(u){return fetch(u,{cache:'reload'}).then(function(r){return c.put(u,r)})})).then(function(){return Promise.all(X.map(function(u){return c.add(u).catch(function(){})}))})}));self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(n){return n!==C}).map(function(n){return caches.delete(n)}))}));self.clients.claim()});
// Notificaciones al celular (las manda el servidor de pagos: worker/src/push.js)
self.addEventListener('push',function(e){var d={};try{d=e.data?e.data.json():{}}catch(x){d={t:'Pekeron',b:e.data?e.data.text():''}}
e.waitUntil(self.registration.showNotification(d.t||'Pekeron',{body:d.b||'',icon:'./icon-192.png',tag:d.tag||undefined,renotify:!!d.tag,data:{u:d.u||'./app.html'}}))});
self.addEventListener('notificationclick',function(e){e.notification.close();var u=(e.notification.data&&e.notification.data.u)||'./app.html';
e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){for(var i=0;i<l.length;i++){if(l[i].url.indexOf('app.html')>=0&&'focus' in l[i])return l[i].focus()}return self.clients.openWindow(u)}))});
self.addEventListener('fetch',function(e){
var u=e.request.url;
if(e.request.method!=='GET')return;
if(u.indexOf(G)===0){
e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request).then(function(res){if(res&&res.ok){var cp=res.clone();caches.open(C).then(function(c){c.put(e.request,cp)})}return res})}));
return}
if(u.indexOf(self.location.origin)!==0)return;
e.respondWith(fetch(e.request,{cache:'no-cache'}).then(function(res){if(res&&res.ok){var cp=res.clone();caches.open(C).then(function(c){c.put(e.request,cp)})}return res}).catch(function(){return caches.match(e.request,{ignoreSearch:true})}))});
