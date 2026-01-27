// Service Worker - Postcard PWA
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  return self.clients.claim();
});

// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Initialize Firebase in service worker
firebase.initializeApp({
  apiKey: "AIzaSyCVCSTiYb0oj-qiWrQA6PNJw3L1LcQcN2k",
  authDomain: "postcard-d055d.firebaseapp.com",
  projectId: "postcard-d055d",
  storageBucket: "postcard-d055d.firebasestorage.app",
  messagingSenderId: "241151731606",
  appId: "1:241151731606:web:1cac2069b350b1543a1fb7"
});

const messaging = firebase.messaging();

// Handle background messages (when app is closed or in background)
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background message received:', payload);
  
  const notificationTitle = payload.notification.title || 'Postcard';
  const notificationOptions = {
    body: payload.notification.body || '',
    icon: payload.notification.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.data ? payload.data.type : 'postcard',
    data: payload.data
  };
  
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  // Open the app when notification is clicked
  event.waitUntil(
    clients.openWindow('/')
  );
});
