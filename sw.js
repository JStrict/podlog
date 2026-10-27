/* PodLog service worker — offline-first app shell */
const CACHE = 'podlog-v35';
const ASSETS = [
  './', './index.html',
  './css/styles.css',
  './js/scoring.js', './js/store.js', './js/app.js',
  './manifest.json',
  './assets/icon-tile.png', './assets/PODLOG-QUILL-LOGO-OUTLINE.png',
  './assets/PODLOG-TEXT-BLACKwOUTLINE.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const p = url.pathname;
  // App shell (page, JS, CSS): network-first so updates apply on next online
  // launch without waiting for a service worker update to be detected.
  const isShell = e.request.mode === 'navigate' ||
    p.endsWith('.js') || p.endsWith('.css') || p.endsWith('.html') ||
    p.endsWith('/podlog/') || p.endsWith('/podlog');
  if (isShell) {
    e.respondWith(fetch(e.request, { cache: 'reload' }).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  // Assets (images, icons): cache-first, they rarely change.
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
