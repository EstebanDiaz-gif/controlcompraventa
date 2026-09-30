var C='ventas-v2',G='https://www.gstatic.com/firebasejs/10.12.2/';
var F=['./','./index.html','./firebase-config.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
var X=[G+'firebase-app.js',G+'firebase-auth.js',G+'firebase-firestore.js'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(F).then(function(){return Promise.all(X.map(function(u){return c.add(u).catch(function(){})}))})}));self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(n){return n!==C}).map(function(n){return caches.delete(n)}))}));self.clients.claim()});
self.addEventListener('fetch',function(e){
var u=e.request.url;
if(e.request.method!=='GET'||!(u.indexOf(self.location.origin)===0||u.indexOf(G)===0))return;
e.respondWith(caches.match(e.request).then(function(r){
var net=fetch(e.request).then(function(res){if(res&&res.ok){var cp=res.clone();caches.open(C).then(function(c){c.put(e.request,cp)})}return res}).catch(function(){return r});
return r||net}))});
