const CACHE_NAME = 'gigsync-app-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/images/gigsync_icon.png',
  './assets/images/hero_bg.jpg',
  './assets/images/home_deep_clean.jpg',
  './assets/images/kitchen_clean.jpg',
  './assets/images/sofa_clean.jpg',
  './assets/images/bathroom_clean.jpg',
  './assets/images/pest_control.jpg',
  './assets/images/office_clean.jpg',
  './assets/images/before_kitchen.jpg',
  './assets/images/after_kitchen.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
