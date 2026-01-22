// firebase-messaging-sw.js
// STEP 1: Save this file as "firebase-messaging-sw.js" in the SAME folder as your index.html

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Your Firebase config (SAME as in index.html)
firebase.initializeApp({
  apiKey: "AIzaSyCVCSTiYb0oj-qiWrQA6PNJw3L1LcQcN2k",
  authDomain: "postcard-d055d.firebaseapp.com",
  projectId: "postcard-d055d",
  storageBucket: "postcard-d055d.firebasestorage.app",
  messagingSenderId: "241151731606",
  appId: "1:241151731606:web:1cac2069b350b1543a1fb7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification?.title || 'New notification';
  const options = {
    body: payload.notification?.body || '',
    icon: '/icon-192.png'
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
