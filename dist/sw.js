/* Offline shell for the web version. The app files are cached so Ruang opens without a connection;
   anything that needs a model or a server still needs the network and says so in the interface.
   Bump VERSION whenever app files change so installed copies pick up the new shell. */
const VERSION='ruang-shell-0.13.0';
const SHELL=['./','index.html','manifest.webmanifest','style.css','desktop.css','room.css','office-v4.css','office-windows.css','office-full.css','inbox.css','palette.css','connections.css','code-workspace.css',
  'core.js','app.js','gateway-client.js','artifact-client.js','task-runner.js','office-chat.js','desktop.js','pixel-assets.js','office-layout.js','office-engine.js','v2/sprites.js','v2-sprites.js','skins.js','room-v4.js','inbox.js','palette.js','connections.js','code-documents.js','code-workspace.js','web.js',
  'v2/office.webp','v2/employee-0.png','v2/employee-1.png','v2/employee-2.png','v2/employee-3.png','v2/employee-4.png','v2/icons.png','v2/logo-symbol.png','v2/logo-wordmark.png','v2/app-icon.png','v2/icon-192.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Same-origin GET only. Pages: network first so updates arrive, falling back to the cached shell offline.
// Everything else: cache first, filling the cache as files are used (the large editor bundle loads on demand).
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==location.origin)return;
  if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('index.html')));return}
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy))}return res})))});
