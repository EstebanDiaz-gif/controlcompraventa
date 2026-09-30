var C='ventas-v3',G='https://www.gstatic.com/firebasejs/10.12.2/';
var F=['./','./index.html','./firebase-config.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
var X=[G+'firebase-app.js',G+'firebase-auth.js',G+'firebase-firestore.js'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return Promise.all(F.map(function(u){return fetch(u,{cache:'reload'}).then(function(r){return c.put(u,r)})})).then(function(){return Promise.all(X.map(function(u){return c.add(u).catch(function(){})}))})}));self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(n){return n!==C}).map(function(n){return caches.delete(n)}))}));self.clients.claim()});
self.addEventListener('fetch',function(e){
var u=e.request.url;
if(e.request.method!=='GET')return;
if(u.indexOf(G)===0){
e.respondWith(caches.match(e.request).then(function(r){return r||fetch(e.request).then(function(res){if(res&&res.ok){var cp=res.clone();caches.open(C).then(function(c){c.put(e.request,cp)})}return res})}));
return}
if(u.indexOf(self.location.origin)!==0)return;
e.respondWith(fetch(e.request,{cache:'no-cache'}).then(function(res){if(res&&res.ok){var cp=res.clone();caches.open(C).then(function(c){c.put(e.request,cp)})}return res}).catch(function(){return caches.match(e.request,{ignoreSearch:true})}))});
