// Service Worker - Postcard PWA
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  return self.clients.claim();
});
