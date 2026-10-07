const CACHE = 'sticha-v4-offline';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './sticha-logo.png', './sticha-fabric-hero.svg', './supabase-config.js', './supabase-client.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(async cache => {
        await Promise.all(ASSETS.map(async asset => {
          try { await cache.add(asset); } catch (e) { console.warn('STICHA cache skipped:', asset); }
        }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isSupabaseScript = url.href === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  if (url.origin !== self.location.origin && !isSupabaseScript) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
