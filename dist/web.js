/* Web-only setup: register the offline shell when Ruang runs from a web server (not in the desktop app). */
if(!window.desktop&&'serviceWorker' in navigator&&/^https?:$/.test(location.protocol))
  addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
