// Folio v2 service worker: works offline. Cache 55013a3450
const CACHE='folio2-55013a3450';
const FILES=["./", "boot-check.js", "icon-1024.png", "icon-180.png", "icon-192.png", "icon-2048.png", "icon-512.png", "index.html", "jbig2_nowasm_fallback.js", "logo-256.png", "manifest.json", "openjpeg_nowasm_fallback.js", "pdfjs.min.js", "pdfjs.worker.min.js", "app.js", "cc.js", "ccengine.js", "ccrates.js", "checklists.js", "cols.js", "crypto.js", "data.js", "dates.js", "db.js", "editor.js", "entities.js", "focus.js", "formula.js", "github.js", "home.js", "hub.js", "import.js", "inbox.js", "kbar.js", "kpi.js", "lock.js", "longtext.js", "main.js", "model.js", "notify.js", "page.js", "popedit.js", "project.js", "push.js", "search.js", "settings.js", "store.js", "sync.js", "table.js", "ui.js", "views.js", "styles.css"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return res}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./'))))});
// push notifications sent by the GitHub job in folio-data (8:00 summary, ECPAR rejection emails), even when Folio is closed
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){d={body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.title||'Folio',{body:d.body||'',tag:d.tag||'folio',renotify:true,icon:'icon-192.png',badge:'icon-192.png',data:{url:d.url||'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c){if(c.navigate)c.navigate(u).catch(()=>{});return c.focus()}}return self.clients.openWindow(u)}))});
