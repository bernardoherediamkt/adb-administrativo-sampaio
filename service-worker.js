const CACHE_NAME = 'adb-administrativo-v3-controle-financeiro-2026';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
    return response;
  }).catch(() => caches.match(event.request)));
});
