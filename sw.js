var C='ventas-v97',G='https://www.gstatic.com/firebasejs/10.12.2/';
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
var guardar=function(req,res){if(res&&res.ok&&res.type==='basic'&&!res.redirected){var cp=res.clone();caches.open(C).then(function(c){c.put(req,cp)})}return res};
// Páginas (abrir un link, el catálogo, pekeronapp.com/minombre): nunca dejamos al navegador sin respuesta.
// 1) se pide normal; 2) si falla, se reintenta sin caché; 3) la copia guardada; 4) un cartel de "sin conexión" con reintentar.
if(e.request.mode==='navigate'){
e.respondWith(fetch(e.request).then(function(res){return guardar(e.request,res)}).catch(function(){
return fetch(u,{cache:'no-store',credentials:'same-origin'}).then(function(res){if(res.redirected)return Response.redirect(res.url,302);return guardar(e.request,res)})}).catch(function(){
return caches.match(e.request).then(function(r){return r||caches.match(e.request,{ignoreSearch:true})}).then(function(r){return r||new Response(OFF,{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}})})}));
return}
e.respondWith(fetch(e.request,{cache:'no-cache'}).then(function(res){return guardar(e.request,res)}).catch(function(){return caches.match(e.request,{ignoreSearch:true}).then(function(r){return r||fetch(e.request)})}))});
var OFF='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f6f4;color:#16161a;text-align:center;padding:90px 22px}b{display:block;font-size:22px;margin:14px 0 8px}p{color:#666;margin:0 0 18px;line-height:1.4}button{border:0;border-radius:14px;background:#111;color:#fff;font:inherit;font-weight:800;padding:14px 26px}</style></head><body><div style="font-size:46px">📶</div><b>No se pudo cargar la página</b><p>Revisá tu conexión a internet y probá de nuevo.</p><button onclick="location.reload()">Reintentar</button><script>addEventListener("online",function(){location.reload()})</script></body></html>';
