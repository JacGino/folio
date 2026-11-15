// Folio v2 service worker: works offline. Cache be65013712
const CACHE='folio2-be65013712';
const FILES=["./", "boot-check.js", "icon-1024.png", "icon-180.png", "icon-192.png", "icon-2048.png", "icon-512.png", "index.html", "manifest.json", "app.js", "crypto.js", "data.js", "dates.js", "db.js", "editor.js", "entities.js", "formula.js", "github.js", "home.js", "hub.js", "import.js", "kbar.js", "lock.js", "main.js", "model.js", "notify.js", "page.js", "popedit.js", "project.js", "search.js", "settings.js", "store.js", "sync.js", "table.js", "ui.js", "styles.css"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return res}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./'))))});
