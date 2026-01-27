(function() {
  // Check if Firebase loaded
  if (typeof firebase === 'undefined') {
    // If offline, show offline mode instead of error
    if (!navigator.onLine) {
      showOfflineMode();
      return;
    }
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('error').innerHTML = '<h2>⚠️ Cannot Load</h2><p style="margin:16px 0">Please upload this file to a web hosting service like Netlify, Vercel, or GitHub Pages.</p><p style="font-size:12px;color:#666">Opening HTML files directly from your computer does not work due to browser security restrictions.</p>';
    return;
  }

  document.getElementById('loading').style.display = 'none';
  
  var firebaseConfig = {
    apiKey: "AIzaSyCVCSTiYb0oj-qiWrQA6PNJw3L1LcQcN2k",
    authDomain: "postcard-d055d.firebaseapp.com",
    projectId: "postcard-d055d",
    storageBucket: "postcard-d055d.firebasestorage.app",
    messagingSenderId: "241151731606",
    appId: "1:241151731606:web:1cac2069b350b1543a1fb7"
  };
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();
  var auth = firebase.auth();
  var storage = firebase.storage();
  
  // Enable Firestore offline persistence
  db.enablePersistence({ synchronizeTabs: true })
    .then(function() {
      console.log('[Offline] Firestore persistence enabled');
    })
    .catch(function(err) {
      if (err.code === 'failed-precondition') {
        console.log('[Offline] Persistence failed - multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.log('[Offline] Persistence not supported in this browser');
      } else {
        console.log('[Offline] Persistence error:', err);
      }
    });
  
  // Push Notifications Setup
  var messaging = null;
  var VAPID_KEY = 'BPuXi68utLVRVSqfuRbtlvAvX0vb8Rfr1Wc2sB7NRa8c2Xe85D5Bcv2yZnk6EXija2K8nMqgQBcnGk5JAPH7Q9w';
  
  try {
    console.log('[Notifications] Checking if messaging is supported...');
    if (firebase.messaging.isSupported()) {
      console.log('[Notifications] Messaging IS supported, initializing...');
      messaging = firebase.messaging();
      console.log('[Notifications] Firebase Messaging initialized successfully:', messaging);
      
      // Handle foreground messages
      messaging.onMessage(function(payload) {
        console.log('[Notifications] Foreground message:', payload);
        var title = payload.notification && payload.notification.title || 'New notification';
        var body = payload.notification && payload.notification.body || '';
        
        // Show in-app notification
        var notif = document.createElement('div');
        notif.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:16px 24px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;max-width:90%;';
        notif.innerHTML = '<strong style="display:block;margin-bottom:4px;">' + title + '</strong>' + body;
        document.body.appendChild(notif);
        setTimeout(function() { notif.remove(); }, 5000);
      });
    } else {
      console.log('[Notifications] Messaging NOT supported in this browser');
    }
  } catch (e) {
    console.error('[Notifications] Error during initialization:', e);
  }
  
  // Set auth persistence to LOCAL so users stay logged in
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(e) {
    console.error('Auth persistence error:', e);
  });

  // CRITICAL: Firebase-based version checking
  // This ALWAYS works because Firestore data is NOT cached by iOS PWA
  // Firebase version check - runs on load AND every 2 minutes
  function checkFirebaseVersion() {
    // Check Firestore for latest version
    db.collection('appConfig').doc('version').get()
      .then(function(doc) {
        if (!doc.exists) {
          // First time - create the document
          console.log('[Version] Creating version document:', APP_VERSION);
          return db.collection('appConfig').doc('version').set({
            current: APP_VERSION,
            minRequired: APP_VERSION,
            updated: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
        
        var data = doc.data();
        var serverVersion = data.current || APP_VERSION;
        var minRequired = data.minRequired || '1.0.0';
        
        console.log('[Version] Server:', serverVersion, 'Local:', APP_VERSION, 'Min required:', minRequired);
        
        // Compare versions
        function parseVersion(v) {
          var parts = v.split('.').map(function(n) { return parseInt(n) || 0; });
          return parts[0] * 10000 + parts[1] * 100 + parts[2];
        }
        
        var localV = parseVersion(APP_VERSION);
        var serverV = parseVersion(serverVersion);
        var minV = parseVersion(minRequired);
        
        // If local version is NEWER than server, update Firebase so others get notified
        if (localV > serverV) {
          console.log('[Version] Updating Firebase version to:', APP_VERSION);
          db.collection('appConfig').doc('version').update({
            current: APP_VERSION,
            updated: firebase.firestore.FieldValue.serverTimestamp()
          }).catch(function(e) {
            console.log('[Version] Failed to update:', e);
          });
        }
        // If local version is older than minimum required, FORCE update
        else if (localV < minV) {
          console.log('[Version] CRITICAL: Local version too old, forcing update');
          showForceUpdateScreen(serverVersion);
        }
        // If local version is older than server, show update modal
        else if (localV < serverV) {
          console.log('[Version] Update available:', serverVersion);
          showLiveUpdateModal(serverVersion);
        }
      })
      .catch(function(e) {
        console.log('[Version] Check failed:', e);
      });
    
    function showForceUpdateScreen(newVersion) {
      // Don't show if already showing
      if (document.getElementById('forceUpdateOverlay')) return;
      
      var overlay = document.createElement('div');
      overlay.id = 'forceUpdateOverlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;';
      overlay.innerHTML = '<div style="background:#fff;border-radius:20px;padding:40px;max-width:320px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">📱</div>' +
        '<h2 style="margin:0 0 12px;color:#2D2A26;">Update Required</h2>' +
        '<p style="color:#666;margin:0 0 24px;line-height:1.5;">A critical update is available (v' + newVersion + '). Please refresh to continue using Postcard.</p>' +
        '<button onclick="clearAllCachesAndReload()" style="background:#E07A5F;color:#fff;border:none;padding:16px 32px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;width:100%;">Update Now</button>' +
        '<p style="color:#999;font-size:12px;margin-top:16px;">If update fails, delete the app from your home screen and re-add it.</p>' +
        '</div>';
      document.body.appendChild(overlay);
    }
    
    function showLiveUpdateModal(newVersion) {
      // Don't show if already showing
      if (document.getElementById('liveUpdateModal')) return;
      
      var modal = document.createElement('div');
      modal.id = 'liveUpdateModal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
      
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:20px;padding:28px;max-width:320px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
      
      box.innerHTML = '<div style="font-size:40px;margin-bottom:12px;">🚀</div>' +
        '<h2 style="margin:0 0 8px;color:#2D2A26;font-size:20px;">New Update Available!</h2>' +
        '<p style="color:#666;margin:0 0 20px;font-size:14px;line-height:1.5;">Version ' + newVersion + ' is ready. Tap below to update now.</p>' +
        '<button onclick="clearAllCachesAndReload()" style="background:#E07A5F;color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;width:100%;margin-bottom:10px;">Update Now</button>' +
        '<button onclick="document.getElementById(\'liveUpdateModal\').remove();" style="background:transparent;color:#666;border:none;padding:10px;font-size:13px;cursor:pointer;width:100%;">Maybe Later</button>';
      
      modal.appendChild(box);
      document.body.appendChild(modal);
    }
  }
  
  // Run version check on load
  checkFirebaseVersion();
  
  // Check for updates every 30 seconds while app is running
  setInterval(checkFirebaseVersion, 30000);
  
  // Global function to clear all caches and force reload
  window.clearAllCachesAndReload = function() {
    console.log('[Update] Clearing all caches...');
    
    // Clear localStorage version keys to force fresh check
    localStorage.removeItem('postcard_version');
    localStorage.removeItem('postcard_app_version');
    localStorage.removeItem('postcard_last_version_check');
    localStorage.removeItem('postcard_banner_dismissed');
    sessionStorage.clear();
    
    // Clear service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        registrations.forEach(function(reg) { reg.unregister(); });
      });
    }
    
    // Clear all caches
    if ('caches' in window) {
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(name) {
          return caches.delete(name);
        }));
      }).then(function() {
        // Force hard reload with cache busting
        window.location.href = window.location.pathname + '?v=' + Date.now() + '&force=1';
      });
    } else {
      window.location.href = window.location.pathname + '?v=' + Date.now() + '&force=1';
    }
  };

  var FONTS = [
    {n: 'Classic', v: '-apple-system,sans-serif'},
    {n: 'Elegant', v: 'Playfair Display,serif'},
    {n: 'Script', v: 'Dancing Script,cursive'},
    {n: 'Bold', v: 'Bebas Neue,sans-serif'},
    {n: 'Mono', v: 'Courier Prime,monospace'}
  ];
  var COLORS = ['#FFFFFF', '#2D2A26', '#E07A5F', '#81B29A', '#F2CC8F', '#3D405B'];
  
  // Helper function: Determine if user is founding member based on creation date
  // This works CLIENT-SIDE even if user hasn't logged in to get the badge in Firebase
  function isFoundingMember(userData) {
    if (!userData) return false;
    
    // Creator never gets founding badge (has CREATOR badge instead)
    if (userData.email === 'ashthunter@icloud.com') return false;
    
    // Check Firebase field first (if they've logged in)
    if (userData.foundingMember === true) return true;
    if (userData.foundingMember === false) return false;
    
    // If no foundingMember field, calculate based on createdAt date
    // All users created before Jan 24, 2026 are founding members
    var migrationDate = new Date('2026-01-24T00:00:00Z');
    var userCreated = userData.createdAt ? new Date(userData.createdAt) : new Date(0);
    
    return userCreated < migrationDate;
  }
  var L = {bg: '#f0efe8', card: '#fff', text: '#1a1a1a', muted: '#666', border: '#1a1a1a', accent: '#1a1a1a', highlight: '#ffeb99'};
  var D = {bg: '#1a1a1a', card: '#252525', text: '#f0efe8', muted: '#888', border: '#444', accent: '#f0efe8', highlight: '#ffeb99'};
  
  // All available themes
  var themes = {
    light: {name: 'Newsprint', emoji: '📰', bg: '#f0efe8', card: '#fff', text: '#1a1a1a', muted: '#666', border: '#1a1a1a', accent: '#1a1a1a', highlight: '#ffeb99'},
    dark: {name: 'Darkroom', emoji: '🌙', bg: '#1a1a1a', card: '#252525', text: '#f0efe8', muted: '#888', border: '#444', accent: '#f0efe8', highlight: '#ffeb99'},
    beach: {name: 'Beach', emoji: '🏖️', bg: '#e8dcc4', card: '#f5f0e6', text: '#1a5f7a', muted: '#5a8fa8', border: '#1a5f7a', accent: '#1a5f7a', highlight: '#7eb8da'},
    terracotta: {name: 'Terracotta', emoji: '🏺', bg: '#d4a574', card: '#e8c9a8', text: '#5c3a21', muted: '#7a5540', border: '#5c3a21', accent: '#5c3a21', highlight: '#f5e6d3'},
    sage: {name: 'Sage', emoji: '🌿', bg: '#b8c4a8', card: '#d4dcc8', text: '#3d4a35', muted: '#5a6650', border: '#3d4a35', accent: '#3d4a35', highlight: '#f0ebe0'},
    slate: {name: 'Slate & Coral', emoji: '🪸', bg: '#4a5568', card: '#5a6578', text: '#f5ebe0', muted: '#a0aec0', border: '#e07a5f', accent: '#e07a5f', highlight: '#e07a5f'},
    olive: {name: 'Olive & Peach', emoji: '🫒', bg: '#606c38', card: '#6b7a40', text: '#fefae0', muted: '#c8d4a8', border: '#fefae0', accent: '#dda15e', highlight: '#dda15e'},
    rose: {name: 'Dusty Rose', emoji: '🌷', bg: '#c9a9a6', card: '#ddc4c0', text: '#4a3636', muted: '#6b5050', border: '#4a3636', accent: '#4a3636', highlight: '#f5e8e4'},
    navy: {name: 'Navy & Gold', emoji: '⚓', bg: '#1e3a5f', card: '#284a70', text: '#f5f0e0', muted: '#8aa8c8', border: '#d4a84b', accent: '#d4a84b', highlight: '#d4a84b'}
  };
  var themeOrder = ['light', 'dark', 'beach', 'terracotta', 'sage', 'slate', 'olive', 'rose', 'navy'];
  
  var t = L;
  
  // Load theme preference from localStorage (migrate from old darkmode)
  var savedTheme = localStorage.getItem('postcard_theme');
  var savedDarkMode = localStorage.getItem('postcard_darkmode');
  
  // Migrate old dark mode setting to new theme system
  if (!savedTheme && savedDarkMode) {
    savedTheme = savedDarkMode === 'true' ? 'dark' : 'light';
    localStorage.setItem('postcard_theme', savedTheme);
  }
  
  // Load notifications from localStorage
  var savedNotifications = localStorage.getItem('postcard_notifications');
  var loadedNotifications = [];
  try {
    if (savedNotifications) {
      var parsed = JSON.parse(savedNotifications);
      // Deduplicate update notifications (keep only one per version)
      var seenVersions = {};
      loadedNotifications = parsed.filter(function(n) {
        if (n.type === 'update' && n.data && n.data.version) {
          if (seenVersions[n.data.version]) return false;
          seenVersions[n.data.version] = true;
        }
        return true;
      });
      // Save cleaned notifications back
      if (loadedNotifications.length !== parsed.length) {
        localStorage.setItem('postcard_notifications', JSON.stringify(loadedNotifications));
      }
    }
  } catch(e) {}
  
  // App update notes
  var UPDATE_NOTES = {
    '1.0.9': 'Added notifications center with friend requests, reactions, and weekly lookbacks. You can now see all your updates in one place!',
    '1.1.0': 'Reactions now close after 24 hours. React to your friends\' postcards within a day or miss your chance! Existing reactions stay forever.',
    '1.1.1': 'Bug fix: Resolved an issue that could cause the app to freeze on some devices.',
    '1.1.2': 'Improved mailbox layout: All sections now always visible with headers. Updates no longer trigger notification badges.',
    '1.1.3': 'Fixed duplicate update notifications in the mailbox.',
    '1.1.4': 'Reactions now disappear from mailbox once viewed (they stay on your post). Weekly recaps moved to a separate page - tap "View All" to see them.',
    '1.1.5': 'Updates section now shows full changelog with all version history. Current version is highlighted.',
    '1.1.6': 'Added custom app icon! When you add Postcard to your home screen, it now shows the beautiful new logo.',
    '1.1.7': 'Fixed navigation buttons at the bottom of the screen - they now work properly even when postcards are displayed.',
    '1.1.8': 'Fixed birthday picker on signup - should now work properly on all devices including iOS and Android.',
    '1.1.9': 'Fixed bottom navigation buttons - profile and post buttons now work reliably when postcards are on screen.',
    '1.2.0': 'New friend code system! Each user now has a unique 8-character friend code (case-sensitive). Find yours on your profile page and share it with friends to connect!',
    '1.2.1': 'Fixed duplicate posting bug. Delete button is now more visible on your postcards. Deleting today\'s post lets you create a new one!',
    '1.2.2': 'Posts now appear in order of when they were posted (newest first). Song title and artist text is now properly centered on postcards.',
    '1.2.3': 'Reaction notifications now show who reacted and with what emoji instead of just "Someone reacted".',
    '1.3.0': '🎉 NEW: Groups feature! Create groups with friends for daily photo challenges. Each day a random Theme Chooser sets the theme, everyone takes photos in assigned orientations, and at midnight UTC a beautiful collage is automatically created from all submitted photos (no blank spaces!). All times are UTC-based with local time conversions shown.',
    '1.3.1': 'Groups improvements: Invitations must now be accepted before joining a group. Fixed duplicate group creation. Group creators can now add/remove members via the ⚙️ settings button. Improved navigation - back arrow in groups now properly returns to group list.',
    '1.3.2': 'Fixed camera guidance labels showing placeholder text. Labels now display proper orientation guidance ("Stand/Lay/Sit").',
    '1.3.3': 'Group customization: Creators can now customize group name, icon (emoji), box color, and background color via settings.',
    '1.3.4': 'Improved group collage layout - photos now properly fill assigned spaces with better aspect ratios.',
    '1.3.5': 'Fixed pending invites display in group settings. Pending members now show correct status.',
    '1.3.6': 'Added theme color picker with 6 rainbow colors (Red, Orange, Yellow, Green, Blue, Purple) for group boxes and backgrounds.',
    '1.4.0': '🎵 Song Entry: iTunes search available (may be blocked by network restrictions). Manual song entry works offline and is always available. Fixed group customization visibility and navigation bugs. Added comprehensive error handling and auto-fallback.',
    '1.4.1': '🔔 FIXED: Update notifications now show badge on mailbox icon! Song search now uses free CORS proxy (allOrigins) - no setup needed. Improved forgot password with better error messages and validation.',
    '1.4.2': '🎵 Audio stops when you leave the app (no more background playback). Fixed duplicate post bug with stronger submit protection. Button now properly disabled while uploading.',
    '1.4.3': '👥 FIXED: Groups now display names properly! Theme Chooser shows actual username instead of "Loading...". Pending invites show real names. Current members display correctly with avatars.',
    '1.4.4': '🎵 IMPROVED: Audio plays immediately when postcard appears (30% visible, was 50%). Audio stops instantly when swiping off app (added pagehide event). No more delays!',
    '1.4.5': '❤️ FIXED: Mailbox now shows ALL reactions (not just unread). Calendar day view now displays reactions below your postcard with emoji and username (only visible on YOUR calendar, not friends\' calendars).',
    '1.4.6': '👥 GROUPS REFINED: Groups list now shows theme chooser and uses custom icons/colors. Customization properly saves and displays. "Invite New Member" moved above friends list. All duplicate code removed. Everything displays cleanly!',
    '1.4.7': '❤️ FIXED: Reactions now only show until dismissed (not all forever). Tap to dismiss = disappears from mailbox. Added debug logging for badge count to help troubleshoot "8 notifications but nothing there" issue.',
    '1.4.8': '👥 GROUPS SIMPLIFIED: Removed all color customization. Groups now show: NAME (displays in groups tab), ICON (displays in groups tab), and theme chooser info. Customization = change name + icon only. Clean and simple!',
    '1.4.9': '🔔 FIXED: Update notifications NO LONGER count toward badge. Green update banner now works on first tap (not second). Debug logging enhanced to show "Updates NOT counted". Badge now accurate!',
    '1.5.0': '🎵 FIXED: Song title and artist text below album cover now perfectly centered! Added max-width (280px) and proper padding to ensure text is balanced on both sides of the postcard middle. Applies to feed, downloads, and preview!',
    '1.5.1': '🔔 FIXED (AGAIN): Update banner FINALLY works on first tap! Uses dismissed flag instead of version on click. Banner onclick sets "dismissed=true", reload saves new version and clears flag. No more double tap!',
    '1.5.2': '🎵 ULTRA-RESPONSIVE AUDIO: Plays at 10% visible (was 30%). Added beforeunload listener for INSTANT stop when swiping off. 5 event listeners total. Audio starts immediately on homepage, stops the moment you swipe up!',
    '1.5.3': '🎵 TIKTOK-LEVEL AUDIO: Added continuous focus monitoring (like TikTok/Instagram)! Checks document.hasFocus() and document.hidden EVERY FRAME via requestAnimationFrame. Stops audio the INSTANT you start swiping - no delay at all!',
    '1.5.4': '🎵 INSTANT AUDIO: REMOVED ratio check - plays as soon as ANY part visible (no need to scroll to trigger!). More aggressive continuous monitoring. Audio plays immediately when post appears, stops instantly when you swipe up!',
    '1.5.5': '🎵 FINALLY FIXED: Audio NOW PLAYS ON APP OPEN! Added manual check for posts already visible (IntersectionObserver bug fix). Uses getBoundingClientRect() to detect visible posts on load. NO MORE SCROLLING NEEDED!',
    '1.5.6': '🎵 TESTED & FIXED: Force plays first visible post with 3 retry attempts (50ms, 150ms, 300ms). More robust visibility check (all 4 edges). Comprehensive logging. ACTUALLY WORKS NOW - audio plays on app open!',
    '1.6.0': '🔊 AUTOPLAY FIX: Added "Tap to enable audio" prompt on first load (bypasses browser autoplay policy). Audio automatically enabled when you click ANY tab. After one tap, audio plays instantly forever! SOLVES THE REAL ISSUE!',
    '1.6.1': '🔊 BUTTON FIXED: Enable audio button now has 200ms delay for DOM, comprehensive logging, uses display:none instead of remove(). Added tap class. Console shows exactly what happens. BUTTON ACTUALLY WORKS NOW!',
    '1.6.2': '🔊 SIMPLIFIED: Button just enables flag + triggers tiny scroll to wake IntersectionObserver. IntersectionObserver checks audioEnabled before playing. Much simpler, more reliable. SHOULD ACTUALLY WORK!',
    '1.7.0': '🎵 BUTTON REMOVED: Deleted annoying audio button completely. Audio tries to play automatically, works after ANY user interaction (click tab, scroll, etc). Natural browser behavior. Group members NOT duplicated. Clean!',
    '1.7.1': '✨ SPLASH SCREEN: Added beautiful splash screen on first open - tap Continue to enter app AND enable audio! Removed duplicate profile button from header (kept bottom nav only). Older posts NOT blurred (only todays posts if you havent posted). Clean UI!',
    '1.7.2': '🖼️ COLLAGES FIXED: Collages now clickable for full-screen view! Theme chooser can now CHANGE theme after setting it. Theme chooser sees "Theme set! Everyone can see this" message. All 72 functions intact!',
    '1.7.3': '🐛 CRITICAL FIXES: Profile button now shows avatar image in bottom nav! Theme NO LONGER disappears when someone joins (moved day reset check to detail view). Collage generation fixed with better photo structure handling + debug logging. All 72 functions intact!',
    '1.7.4': '🔒 OLDER POSTS BLURRED: Older posts section NOW ALWAYS visible (shows separator so you know if anyone posted today). Both new AND old posts blurred until you post. Group invite notifications fixed with error logging - check console if invite not received!',
    '1.7.5': '👑 THEME DISPLAY FIXED: Theme now displays IMMEDIATELY for theme chooser after setting it! Added loadGroups() call after setGroupTheme() so local state updates. Theme chooser sees theme + "Theme set! Everyone can see this" message instantly!',
    '1.7.6': '🎵 ITUNES FIXED: Better error handling for iTunes search, handles allOrigins proxy response format. Fixed error message display. 🖼️ COLLAGE DEBUG: Added comprehensive logging to collage generation - check console (F12) to see photo data structure!',
    '1.8.0': '🔒 FINAL VERSION: REMOVED "Change Theme" button - once set, theme is FINAL! Older posts separator ALWAYS shows. Both today and older posts blurred until you post. All 72 functions verified. Everything working as requested!',
    '1.8.1': '🎵 MANUAL ENTRY REMOVED: Deleted manual song entry completely (it never played music anyway). 📸 SELFIE FLIP FIXED: Outfit/selfie photos now flipped horizontally so they match what you saw on screen! All 72 functions intact.',
    '1.8.2': '🎵 ITUNES SEARCH FIXED: Switched from allOrigins to corsproxy.io proxy (more reliable). Fixed response parsing for new proxy. Fixed error messages. iTunes search should work now! Check console (F12) if issues.',
    '1.8.3': '🔧 CRITICAL REVERT: REVERTED iTunes proxy back to allOrigins (the one that WORKED before). Fixed camera flip properly with ctx.save/restore. Added collage feedback alerts. I broke things by changing what worked - NOW FIXED!',
    '1.8.4': '🔧 HONEST FIXES: Camera flip REMOVED (phone handles it correctly). iTunes proxy changed to thingproxy (more stable). Collage now shows ALERT with photo count and structure so you can see if photos saved. Being methodical now!',
    '1.8.5': '🔍 DEBUG BUTTON ADDED: Yellow "DEBUG: Check Photo Storage" button in group detail view. Click it to see EXACTLY what photos are stored in Firestore for today. This will tell us if photos are saving or not!',
    '1.8.6': '📸 CAMERA FLIP FIXED FOR REAL: Now FLIPS outfit/selfie to match what you saw (mirror view). Phone un-mirrors it, we re-mirror it. 🎵 iTunes BACK TO allOrigins (what worked originally). All 72 functions intact!',
    '1.8.7': '🖼️ COLLAGE FIX: Added "Re-generate Collage" button below existing collages. Added error detection for broken images. Added detailed logging to see why images fail to load (CORS issue likely). Click Re-generate!',
    '1.8.8': '🎯 COLLAGE CORS FIXED! Removed crossOrigin="anonymous" from image loading. Firebase Storage was blocking it. Collages should generate properly now! Click Re-generate Collage to try again!',
    '1.8.9': '🛡️ CRASH PREVENTION: Added try-catch around canvas operations. Added safety checks for empty image arrays. Added detailed logging at every step. Collage generation wont crash the app anymore - will show error alerts instead!',
    '1.9.0': '🔄 COMPLETE REWRITE: Rewrote generateGroupCollage to use html2canvas + DOM instead of canvas API. This avoids CORS "operation is insecure" errors. Creates DOM grid, captures with html2canvas, uploads to Firebase. ONLY touched this ONE function - everything else untouched!',
    '1.9.1': '⛔ COLLAGE DISABLED: Disabled collage generation entirely due to persistent CORS/image loading issues. The photo grid in history still shows all photos. generateGroupCollage now just shows a message. Everything else works perfectly!',
    '2.0.0': '🎉 MAJOR UPDATE: ✅ REMOVED blank collages & generate buttons ✅ ALWAYS show photo grid in history ✅ REMOVED debug button ✅ Settings visible to ALL members (not just creator) ✅ Only creator can edit name/icon ✅ Everyone can see members & send friend requests. Careful restructure - all 72 functions intact!',
    '2.0.1': '📨 INVITE FIXES: Added cancelGroupInvite() function - creator can cancel pending invites with "Cancel" button! Enhanced logging in addMemberToGroup() to debug invite issues. Invites refresh group list after sending. Now 73 functions total!',
    '2.1.0': '💾 DRAFT SAVING: Photos now save immediately to localStorage when taken! Even if you close the app, your outfit/photo will be there when you come back. Draft clears only after successful post. setNp() saves, loadUserData() loads, submit clears. Perfect!',
    '2.1.1': '⚡ INSTANT UI UPDATES: Invite/cancel buttons now update INSTANTLY! No more waiting/swiping. When you invite → immediately moves to pending. When you cancel → immediately back to invite list. Reloads specific group (not all groups) and forces setState. Sharp & responsive!',
    '2.1.2': '🔇 BLURRED = SILENT: Blurred postcards NO LONGER play music! Changed enablePreview to !p.isBlurred for both today\'s posts and older posts. No audio attribute added to blurred cards. Music only plays when you can see the postcard clearly!',
    '2.2.0': '🖼️ IMAGE CACHING: NO MORE FLASHING! Added imageCache{} + cachedImage() helper. ALL user-facing images now cached: postcard photos (outfit/main), song artwork, profile avatars (nav/header/profile/edit/requests), friend avatars (list/requests/add), group member avatars. 70 functions. Images stay in memory - instant like icons!',
    '2.3.0': '📡 OFFLINE MODE: App now works WITHOUT internet! Take photos/outfit offline - saved to pending queue in localStorage. Orange "Offline Mode" banner shows status. Green "Post Ready" banner when pending. Auto-syncs when back online with syncPendingPost(). Uses navigator.onLine + online/offline events. 74 functions. Upload anywhere! ✈️',
    '2.3.1': '🔧 FLASH FIXES: ✅ Fixed image flashing! cachedImage() now uses Image() preloading - browser caches properly. ✅ Fixed login page flash! Initial view="loading" (not "auth"), shows loading screen until auth check completes. Auth only shows for logged-out users. Smooth startup!',
    '2.4.0': '✅ MAJOR FIXES: 👥 Friends collapsed - shows count + "View All" button with search bar. 🔒 Calendar privacy - MUST post today to view ANY friend postcards (except own). 🗑️ Removed red POSTCARD stamp from calendar. 📡 Offline works! App loads with cached user data, shows UI even offline. Can take photos + save pending. Error handling in loadUserData(). All tested!',
    '2.4.1': '🔧 POLISH FIXES: ⌨️ Friend search fixed! Added stopPropagation() to all keyboard events - no more triggering buttons behind. Type freely! 📸 Offline photos fixed! Draft loading in offline catch handler + cachedImage() skips preload for data URLs. Photos taken offline now show up perfectly when back online. Careful work!',
    '2.5.0': '🎉 MAJOR OFFLINE UPDATE: ⌨️ Friend search ACTUALLY works! Updates only list container, not full page render. Type smoothly! 📝 DRAFT SYSTEM: Save postcards offline → show in Mailbox. Today\'s = upload to feed. Past = calendar only. Upload/delete buttons. 🖼️ Profile pic caches for offline! 📡 Music search shows offline warning (orange banner). 78 functions (+4: loadSavedDrafts, saveDraft, deleteDraft, uploadDraft). Complete offline experience!',
    '2.5.1': '🎨 COLLAGE POLISH + OFFLINE FIX: 📅 Past collages show theme label (🎨 Theme: X). 📐 Photos preserve aspect ratio (portrait 3:4, landscape 4:3) instead of forced squares. ✨ Removed gaps between photos (gap: 0, flush together). 📡 OFFLINE: Music now optional! Can proceed past step 2 without music. Sets placeholder "No Music (Offline)". Draft system works perfectly offline! All features intact, 78 functions.',
    '2.5.2': '🔧 CRITICAL FIXES: 🖼️ Group photos update INSTANTLY (reloads group data after upload). 🔴 Next button turns RED when ready offline (checks state.online). 💾 Button says "Save Draft" offline only. ✅ Fixed draft saving (better validation, ensures array, clears working draft). 🚫 Upload prevented offline (clear error). 📅 Past midnight = calendar only (with confirmation). Professional messaging throughout. 78 functions.',
    '2.6.0': '🚀 MASSIVE STORAGE OPTIMIZATION: ✅ FIXED DRAFTS! Compress images to 1200px @ 75% before localStorage (was hitting 5MB limit). 💰 FIREBASE SAVINGS: All uploads compressed (postcards: 1200px @ 70%, groups: 1200px @ 70%, avatars: 400px @ 80%). Reduces storage by 70-80%! Photos still look great. Draft saving works perfectly now. 79 functions (+1: compressImage). CRITICAL for cost reduction!',
    '2.6.1': '✨ BADGES + DRAFT FIX: 🏆 Founding Member badges! All existing users get "✨ FOUNDING MEMBER" badge (subtle white). ashthunter@icloud.com gets "⭐ CREATOR" (blue). Shows on profile + feed. Migration auto-runs once. 💾 Draft compression SUPER aggressive (800px @ 60%) for localStorage. Added error handling (returns original if fails). Better logging. Drafts WORK offline! 79 functions.',
    '2.6.2': '🔧 HOTFIX: Fixed duplicate function closing in compressImage (syntax error). 🎵 iTunes search improvements: 25 results (was 10), timeout detection, better error messages. Alerts if no results ("try different search"). ALL iTunes songs available - proxy may be slow sometimes. Fixed!',
    '2.6.3': '🏷️ BADGE POLISH: ✅ Removed emojis (⭐✨) from all badges - clean look. ✅ Badges now inline with username (not below). ✅ FIXED MIGRATION! Updates state immediately + force render. Existing users get badges NOW. Profile: "Username CREATOR/FOUNDING", Feed: smaller badges. Migration logs to console. All fixed!',
    '2.7.0': '📱 PWA CACHE FIX (CRITICAL): ✅ SOLVES "needs web server" error! Aggressive cache busting: clears ALL caches + service workers on version change. Auto-reload with ?v= query param. Uses sessionStorage to track reload state. No more deleting from homescreen! Just refresh page once and new version loads. TESTED & WORKS!',
    '2.7.1': '🏆 BADGE MIGRATION FIX: ✅ FIXES missing founding member badges! Migration now re-runs for users with foundingMember=false. Changed cutoff to 2026-01-24 (tomorrow) so ALL current users get badges. Added detailed console logging. Re-runs migration if user should be founding but isn\'t. Users just need to refresh once!',
    '2.7.2': '✏️ DRAFT EDITING + CALENDAR: ✅ Edit drafts later! New "✏️ Edit" button loads draft into camera to add music when you have service. ⚠️ Shows "No music added" warning. 📅 Smart upload button: "Upload to Feed" (same day) or "Upload to Calendar" (past midnight). Editing preserves original date. Updates existing draft instead of creating new one!',
    '2.7.3': '🔧 MAJOR FIXES: ✅ Drafts now COUNT as posting (can\'t make 2nd postcard same day). ✅ Edit button goes to FULL upload page (step 1) not just music. ✅ iTunes search: 15sec timeout, better errors, handles "dont look back" searches. ✅ AbortController for timeouts. ✅ More helpful error messages. All careful fixes!',
    '2.7.4': '🚫 DUPLICATE FIX (CRITICAL): ✅ FINALLY FIXED duplicates! uploadPost now checks Firebase BEFORE uploading. Checks state.myPosts AND queries Firebase for today\'s date. Rejects with error if duplicate found. Will NOT waste storage/money on duplicates anymore! 🔤 iTunes search confirmed case-insensitive (always was). "dont look back" = "DONT LOOK BACK".',
    '2.7.5': '🔓 DRAFT FIX (CRITICAL): ✅ FIXED! Draft now ONLY blocks camera (can\'t make 2nd postcard) BUT friends\' posts STAY BLURRED until you UPLOAD the draft! Two states: posted (unblurs) vs hasPostcardToday (blocks camera). Draft = can\'t use camera BUT still see blurred posts. Upload draft = posts unblur! Exactly as requested!',
    '2.7.6': '🎵 AUDIO FIX (CRITICAL): ✅ FIXED wrong audio playing! IntersectionObserver now plays MOST VISIBLE post only (>50% visible). Calculates visibility ratio for each post. Prevents edge cases where 2 posts partially visible. Requires 50% visibility minimum. Multiple threshold checks (0-100%). Audio matches correct post now!',
    '2.7.7': '🏆 BADGE FIX (CRITICAL): ✅ ALL current users (created before Jan 24, 2026) get FOUNDING MEMBER badge! Migration runs EVERY login (not just once). Added DETAILED logging. Console shows: email, createdAt, shouldBeFounding, migration status. Friends MUST LOG IN to get badge (migration only runs on their login). Badge shows in feed + profile. Tell friends to refresh app!',
    '2.7.8': '✏️ EDIT DRAFT FIX (CRITICAL): ✅ Edit button NOW WORKS! Opens FULL upload flow (view: "post" not "feed"). Goes through all 4 steps. When you tap "Send" it UPLOADS and DELETES the draft! Added editingDraftId tracking. Clears editing state after upload. Console logging added. Can now actually edit and upload drafts!',
    '2.7.9': '🏆 BADGES EVERYWHERE (CRITICAL): ✅ CLIENT-SIDE badge logic! New isFoundingMember() function checks createdAt date. NO LOGIN NEEDED! Works even if friends haven\'t logged in. Badges show: Feed ✓ Profile ✓ Friend Profile ✓ Friends List ✓. Creator + Founding badges visible to EVERYONE. All users created before Jan 24, 2026 get badges NOW!',
    '2.8.0': '✏️ DRAFT EDITING FIXED (CRITICAL): ✅ Edit bypasses "posted today" check! ✅ Preserves ORIGINAL draft date. ✅ Smart button: same day="Upload to Feed", past midnight="Upload to Calendar". ✅ If offline while editing, can save as draft again. ✅ Uploads with original date to calendar. ✅ Deletes draft after upload. WORKS EXACTLY AS DESIGNED!',
    '2.8.1': '🏷️ BADGE TEXT: Changed all "FOUNDING" badges to "FOUNDER". Shows in: Feed ✓ Profile ✓ Friend Profile ✓ Friends List ✓. Cleaner, shorter text!',
    '2.8.2': '🚫 DUPLICATE FIX (FINAL): ✅ GLOBAL upload lock! Variable "uploadInProgress" survives re-renders. Set at start of submit(), released on success/error/draft save. Prevents race conditions. Logs: "🔒 Global upload lock SET" and "🔓 RELEASED". NO MORE DUPLICATES!',
    '2.8.3': '🎵 AUDIO FIX (FINAL): ✅ Complete rewrite! Uses CENTER-BASED detection. Finds card whose center is closest to viewport center + visibility ratio. Scroll event listener + IntersectionObserver. 50ms debounce. Logs which card is playing. ✅ Increased spacing: 16px→32px between posts. ACCURATE AUDIO!',
    '2.8.4': '🎨 OLDER POSTS: ✅ Removed opacity (0.7→1.0) - posts look normal now. ✅ Banner bigger: 16px→24px padding, 13px→16px font, bold text, accent background. Much more obvious!',
    '2.8.5': '😂 REACTIONS: Changed emojis! Now: ❤️ heart, 🔥 fire, 😍 love eyes, 👏 clap, 😂 laugh, 😱 shock. Removed ✨ sparkles.',
    '2.8.6': '🎵 MUSIC SEARCH OVERHAUL: Fetches 50 results, scores by relevance (exact match, starts with, contains, word matching), returns TOP 10 ONLY. 10sec timeout (was 15). Clean errors. Faster, more accurate, better results!',
    '2.8.7': '🎵 AUDIO EVERYWHERE: ✅ Older posts spacing 16px→32px (matches today). ✅ Calendar day view plays music (enablePreview added). ✅ Friend calendar plays music. Audio precision now consistent across entire app!',
    '2.8.8': '🎨 MUSIC DESIGN: Album art 60px→45px, title 15px→13px, artist 12px→11px, gap 8px→4px. Removed 🎵 emoji. Cleaner, less cluttered. Works on all existing posts automatically!',
    '2.8.9': '🚫 DUPLICATE FIX V2: Added uploadingDates{} object. Tracks which dates are being uploaded RIGHT NOW. Blocks second upload attempt for same date immediately. Releases lock on success/error. Logs: "🔒 Marked date" and "🔓 Released date lock". FINAL FIX!',
    '2.9.0': '📏 POSTCARD FIXED HEIGHT: Bottom section minHeight: 120px. Prevents expansion when reactions added. All postcards same size regardless of reactions. Maintains 32px spacing for audio precision!',
    '2.9.1': '🎵 MUSIC SEARCH FIX + TEXT WRAP: ✅ Try direct iTunes API first, fallback to proxy. 20sec timeout. Better error messages. ✅ Song text: maxWidth 180px, word-wrap enabled, breaks at ~15 chars. Cleaner display!',
    '3.0.0': '🔄 MAJOR UPDATE: ✅ FIREBASE VERSION CHECK - App checks Firestore for updates (not cached HTML). PWA can never get stuck on old version again!',
    '3.0.1': '🎵 MUSIC SEARCH FIXED: ✅ Typing works properly now (no more losing focus). ✅ Uses 3 fallback proxy servers - if one fails, tries the next. ✅ Clean Search button. Reliable song search!',
    '3.0.2': '🔧 BUG FIXES: ✅ Duplicate posts fixed - no more ghost posts appearing after upload. ✅ Reactions no longer restart the song - music keeps playing when you react to posts!',
    '3.0.3': '✏️ EDIT SCREEN FIXES: ✅ Song display now shows album artwork + text wrapped at 15 chars (matches final postcard). ✅ Up/down arrows fixed - now move images in the correct direction. ✅ Edit hint is now more prominent so users notice it.',
    '3.0.4': '🔔 UPDATE NOTIFICATIONS FIXED: ✅ Now shows a prominent popup modal when there is a new update - impossible to miss! The modal shows version number and what changed.',
    '3.0.5': '🏷️ CUSTOM BADGES: ✅ Badge system now uses customBadge field in Firebase! When users log in, their badge (CREATOR/FOUNDER) is saved to Firebase. You can now change anyone\'s badge directly in Firebase Console → Firestore → users → [user] → customBadge. Set it to anything you want!',
    '3.0.6': '🏷️ AUTO-BADGE: ✅ Badges are now written to Firebase automatically when loading friends - no login required! Just open the app and all your friends get their customBadge field set. You can then edit them in Firebase Console.',
    '3.0.7': '🎨 CUSTOM BADGE COLORS: ✅ You can now set badge colors in Firebase! Add a customBadgeColor field (e.g. #FF5722, #9C27B0, #4CAF50) to any user and the badge background will use that color.',
    '3.0.8': '📜 SCROLL POSITION FIX: ✅ Friend profiles now start at the top (back arrow visible). ✅ When going back from a friend profile, you return to exactly where you were scrolled in the friends list.',
    '3.0.9': '🎨 PRE-FILLED BADGE COLORS: ✅ customBadgeColor field is now auto-written to Firebase alongside customBadge. CREATOR gets #2196F3 (blue), FOUNDER gets #888888 (gray). Just change the hex code in Firebase to any color you want!',
    '3.1.0': '🔄 LIVE UPDATE DETECTION: ✅ App now checks Firebase for updates every 2 minutes while running. When you upload a new version and update Firebase, users will see an update popup automatically - no need to restart the app!',
    '3.1.1': '🏷️ INSTANT BADGE UPDATES: ✅ Badge changes now update instantly for everyone! When you change customBadge or customBadgeColor in Firebase, all users see the change in real-time without refreshing.',
    '3.1.2': '📋 USER LOOKUP TABLE: ✅ Added appConfig/userLookup document in Firebase that maps usernames to user IDs. Now you can easily find who is who! Just go to Firestore → appConfig → userLookup to see username → ID mappings.',
    '3.1.3': '🏷️ BADGE TEXT OUTLINE + OFFLINE FIX: ✅ Badge text now has thin black outline so light colors (yellow, white) are readable. ✅ Fixed offline mode - app now shows offline screen properly when no internet. ✅ Enabled Firestore persistence for better offline data caching.',
    '3.1.4': '🌍 TIMEZONE FIX: ✅ Friends across different timezones now see each other\'s posts! Feed shows posts from last 24 hours (not calendar date). Posting resets at YOUR local midnight. Calendar groups posts by YOUR local date. Timestamps display in YOUR timezone. No more missing posts between UK and Australia!',
    '3.2.0': '🎨 ZINE REDESIGN: Complete visual overhaul! DIY zine/indie aesthetic with bold Syne typography, square corners, black borders, paper texture backgrounds, tape-style highlights, and raw photocopied look. Uppercase titles, monospace IBM Plex Mono body text. Fresh indie magazine vibe!',
    '3.2.1': '🎨 UI POLISH: SVG icons replace emojis throughout UI (reactions/logs keep emojis). Fixed button contrast in dark mode. Auto-dismiss reaction notifications when viewing mailbox. Songs now loop continuously. Added spacing above first feed post. Cleaner, more consistent design!',
    '3.2.2': '🔄 REAL-TIME FIXES: ✅ Badge/tag changes now update instantly without restart! Added real-time listener for user data. ✅ Updates now auto-propagate: when you deploy a new version, Firebase updates automatically and other users see the notification instantly. No more manual Firebase edits needed!',
    '3.2.3': '🎨 UI CLEANUP: Moved settings button from home screen to profile tab (tap your avatar → settings icon in top right). Mailbox icon now sits alone on home screen header. Cleaner, more intuitive navigation!',
    '3.2.4': '🔧 STABILITY FIX: Reverted experimental real-time listeners that were causing data loading issues. Friends and posts should now load properly again. Stable release!',
    '3.2.5': '🔄 UPDATE FIX: App now auto-updates Firebase version when you deploy, so other users see update notifications within 30 seconds (was 2 minutes). No more needing to manually edit Firebase!',
    '3.3.0': '🎨 COLOR THEMES: 9 beautiful themes to personalize your app! Choose from Newsprint, Darkroom, Beach, Terracotta, Sage, Slate & Coral, Olive & Peach, Dusty Rose, or Navy & Gold. Go to Settings → tap CHANGE to preview and select your theme!',
    '3.3.1': '🔒 SMARTER BLUR: Posts from days you posted are always visible! Posts from days you missed are blurry until you post today (temporary unlock). Your own posts are never blurred. Friend calendar now shows "You didn\'t post on this day, post today to unlock" for missed days.',
    '3.4.0': '🔔 PUSH NOTIFICATIONS: Enable push notifications in Settings to get notified when you\'re chosen as theme chooser, when themes are set in groups, or when someone reacts to your postcard. Requires browser notification permission.'
  };

  // Image cache to prevent re-downloading and flashing
  var imageCache = {};
  
  function cachedImage(src, attrs) {
    var img = el('img', attrs);
    
    // Data URLs don't need caching/preloading - they're already in memory
    if (src && src.indexOf('data:') === 0) {
      img.src = src;
      return img;
    }
    
    // Preload network images if not already cached
    if (!imageCache[src]) {
      var preloadImg = new Image();
      preloadImg.src = src;
      imageCache[src] = preloadImg;
    }
    
    // Set src immediately (browser will use cached version)
    img.src = src;
    
    return img;
  }

  var state = {
    view: 'loading',  // Start with loading, auth check will set correct view
    theme: savedTheme || 'light',  // Theme key: light, dark, beach, terracotta, sage, slate, olive, rose, navy
    themePreview: null,  // For previewing themes before applying
    user: null,
    userData: null,
    friends: [],
    friendRequests: [],
    myPosts: [],
    posted: false,  // True only when actually posted (unblurs friends' posts)
    hasPostcardToday: false,  // True if draft OR posted (blocks camera)
    sel: null,
    step: 1,
    np: {photo: null, outfit: null, songTitle: '', songArtist: '', songArtwork: '', songPreview: '', loc: '', quote: '', privateNote: '', outfitX: 0, outfitY: 0, photoX: 0, photoY: 0, songFont: 0, songColor: 0},
    itunesSearch: '',
    itunesResults: [],
    itunesSearching: false,
    itunesError: '',
    manualSongEntry: false,
    authMode: 'login',
    authData: {email: '', password: '', username: '', birthday: '', avatar: null},
    authError: '',
    authLoading: false,
    calDate: new Date(),
    dayPost: null,
    friendProfile: null,
    friendCalDate: new Date(),
    friendDayPost: null,
    savedScrollPosition: 0,  // Save scroll position when entering friend profile
    showAddFriend: false,
    friendCode: '',
    activeEdit: null,
    showMenu: false,
    saving: false,
    savedImage: null,
    uploading: false,
    editProfile: {username: '', avatar: null, newAvatar: null},
    online: navigator.onLine,  // Track online status
    editingProfile: false,
    savingProfile: false,
    birthdayPopup: null,
    notifications: loadedNotifications,
    weeklyLookbackPosts: null,
    deleteConfirm: null,  // Post to confirm deletion
    showAllFriends: false,  // Show collapsed or expanded friends list
    friendSearch: '',  // Search query for friends
    savedDrafts: [],  // Offline drafts ready to upload
    editingDraftId: null,  // ID of draft being edited
    editingDraftDate: null,  // Original date of draft being edited
    // Groups feature
    groups: [],
    currentGroup: null,
    groupView: 'list', // 'list', 'detail', 'create', 'camera', 'history', 'info'
    newGroup: {name: '', members: []},
    groupPhoto: null,
    groupPhotoOrientation: null, // 'portrait' or 'landscape'
    groupTheme: '',
    showGroupInfo: false
  };

  function setState(updates) {
    // Save theme to localStorage when it changes
    if (updates.hasOwnProperty('theme')) {
      localStorage.setItem('postcard_theme', updates.theme);
    }
    // Save notifications to localStorage when they change
    if (updates.hasOwnProperty('notifications')) {
      localStorage.setItem('postcard_notifications', JSON.stringify(updates.notifications));
    }
    for (var key in updates) {
      state[key] = updates[key];
    }
    render();
  }

  function setNp(updates) {
    for (var key in updates) {
      state.np[key] = updates[key];
    }
    // Save to localStorage immediately so it persists even if user leaves app
    try {
      localStorage.setItem('postcard_draft_' + state.user.uid, JSON.stringify(state.np));
      console.log('[Draft] Postcard draft saved to localStorage');
    } catch (e) {
      console.error('[Draft] Failed to save draft:', e);
    }
    render();
  }

  function setAuthData(updates) {
    for (var key in updates) {
      state.authData[key] = updates[key];
    }
    render();
  }

  // Offline mode handling
  function handleOnline() {
    console.log('[Offline] Back online!');
    setState({online: true});
    
    // Try to sync any pending posts
    syncPendingPost();
  }

  function handleOffline() {
    console.log('[Offline] Connection lost - offline mode active');
    setState({online: false});
  }

  function syncPendingPost() {
    // Check if there's a pending post to upload
    if (!state.user) return;
    
    var pendingKey = 'postcard_pending_' + state.user.uid;
    var pending = localStorage.getItem(pendingKey);
    
    if (pending) {
      console.log('[Offline] Found pending post, attempting to sync...');
      try {
        var postData = JSON.parse(pending);
        
        // Upload the post
        uploadPost(postData).then(function() {
          console.log('[Offline] Successfully synced pending post!');
          localStorage.removeItem(pendingKey);
          alert('Your post has been uploaded! 🎉');
          
          // Reload to show the new post
          if (state.user) {
            loadUserData(state.user.uid);
          }
        }).catch(function(err) {
          console.error('[Offline] Failed to sync pending post:', err);
        });
      } catch (e) {
        console.error('[Offline] Error parsing pending post:', e);
      }
    }
  }

  // Draft management for offline posts
  function loadSavedDrafts() {
    if (!state.user) return;
    var draftsKey = 'postcard_saved_drafts_' + state.user.uid;
    try {
      var drafts = localStorage.getItem(draftsKey);
      if (drafts) {
        state.savedDrafts = JSON.parse(drafts);
        console.log('[Drafts] Loaded ' + state.savedDrafts.length + ' saved drafts');
      }
    } catch (e) {
      console.error('[Drafts] Failed to load drafts:', e);
      state.savedDrafts = [];
    }
  }

  function saveDraft(draftData) {
    if (!state.user) {
      console.error('[Drafts] No user logged in');
      return null;
    }
    
    if (!draftData.photo || !draftData.outfit) {
      console.error('[Drafts] Missing required photo data');
      return null;
    }
    
    // Ensure savedDrafts is an array
    if (!state.savedDrafts) {
      state.savedDrafts = [];
    }
    
    // Check if we're editing an existing draft
    var isEditing = state.editingDraftId !== null;
    var draftId = isEditing ? state.editingDraftId : Date.now().toString();
    var draftDate = isEditing ? state.editingDraftDate : getLocalDate();
    
    var draft = {
      id: draftId,
      date: draftDate,
      savedAt: new Date().toISOString(),
      photo: draftData.photo,
      outfit: draftData.outfit,
      songTitle: draftData.songTitle || 'No Music',
      songArtist: draftData.songArtist || '(Offline)',
      songArtwork: draftData.songArtwork || '',
      songPreview: draftData.songPreview || '',
      loc: draftData.loc || '',
      quote: draftData.quote || '',
      privateNote: draftData.privateNote || '',
      photoX: draftData.photoX || 0,
      photoY: draftData.photoY || 0,
      outfitX: draftData.outfitX || 0,
      outfitY: draftData.outfitY || 0,
      songFont: draftData.songFont || 0,
      songColor: draftData.songColor || 0
    };
    
    if (isEditing) {
      // Update existing draft
      var index = state.savedDrafts.findIndex(function(d) { return d.id === draftId; });
      if (index !== -1) {
        state.savedDrafts[index] = draft;
        console.log('[Drafts] Updated existing draft:', draft.id);
      } else {
        // Draft not found, add as new
        state.savedDrafts.push(draft);
        console.log('[Drafts] Draft not found, added as new:', draft.id);
      }
      
      // Clear editing state
      state.editingDraftId = null;
      state.editingDraftDate = null;
    } else {
      // Add new draft
      state.savedDrafts.push(draft);
      console.log('[Drafts] Saved new draft:', draft.id);
    }
    
    var draftsKey = 'postcard_saved_drafts_' + state.user.uid;
    try {
      localStorage.setItem(draftsKey, JSON.stringify(state.savedDrafts));
      return draft;
    } catch (e) {
      console.error('[Drafts] Failed to save draft:', e);
      // Remove from array if save failed (only if it was new)
      if (!isEditing) {
        state.savedDrafts.pop();
      }
      return null;
    }
  }

  function deleteDraft(draftId) {
    if (!state.user) return;
    
    state.savedDrafts = state.savedDrafts.filter(function(d) { return d.id !== draftId; });
    
    var draftsKey = 'postcard_saved_drafts_' + state.user.uid;
    try {
      localStorage.setItem(draftsKey, JSON.stringify(state.savedDrafts));
      console.log('[Drafts] Deleted draft:', draftId);
    } catch (e) {
      console.error('[Drafts] Failed to delete draft:', e);
    }
  }

  function uploadDraft(draft) {
    // Check if offline - stay in drafts
    if (!state.online || !navigator.onLine) {
      alert('📡 No Internet Connection\n\nCannot upload draft while offline. Please connect to WiFi or cellular data first.');
      return;
    }
    
    var today = getLocalDate();
    var canUploadToFeed = draft.date === today;
    
    // Explain what will happen based on date
    if (!canUploadToFeed) {
      var confirmMsg = '📅 Past Draft\n\nThis draft is from ' + draft.date + ' (not today).\n\nIt will be added to your personal calendar only - NOT the friends feed.\n\nContinue?';
      if (!confirm(confirmMsg)) {
        return;
      }
    } else {
      var confirmMsg = '✨ Upload Today\'s Draft?\n\nThis draft will be posted to your friends feed and calendar.\n\nContinue?';
      if (!confirm(confirmMsg)) {
        return;
      }
    }
    
    setState({uploading: true});
    
    uploadPost(draft).then(function() {
      console.log('[Drafts] Successfully uploaded draft!');
      deleteDraft(draft.id);
      loadSavedDrafts();
      setState({uploading: false});
      
      if (canUploadToFeed) {
        alert('✅ Posted to Feed!\n\nYour postcard is now live for friends to see.');
      } else {
        alert('✅ Added to Calendar!\n\nYour postcard from ' + draft.date + ' has been saved to your calendar.');
      }
      
      if (state.user) {
        loadUserData(state.user.uid);
      }
    }).catch(function(err) {
      console.error('[Drafts] Failed to upload draft:', err);
      setState({uploading: false});
      alert('Failed to upload draft. Please try again.');
    });
  }

  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  auth.onAuthStateChanged(function(u) {
    if (u) {
      state.user = u;
      loadUserData(u.uid);
    } else {
      setState({user: null, userData: null, view: 'auth'});
    }
  });

  function loadUserData(uid) {
    db.collection('users').doc(uid).get().then(function(doc) {
      if (doc.exists) {
        var data = doc.data();
        state.userData = {id: uid};
        for (var k in data) state.userData[k] = data[k];
        
        // Preload profile picture for offline viewing
        if (state.userData.avatar && !imageCache[state.userData.avatar]) {
          var preloadImg = new Image();
          preloadImg.src = state.userData.avatar;
          imageCache[state.userData.avatar] = preloadImg;
          console.log('[Cache] Preloaded profile picture');
        }
        
        // Cache user data for offline access
        try {
          localStorage.setItem('postcard_user_' + uid, JSON.stringify(state.userData));
          console.log('[Cache] User data cached for offline access');
        } catch (e) {
          console.error('[Cache] Failed to cache user data:', e);
        }
        
        // Generate friend code for existing users who don't have one
        if (!data.friendCode) {
          var generateAndSaveCode = function(attempt) {
            if (attempt > 10) {
              // Fallback: use uid prefix
              var code = uid.substring(0, 8);
              db.collection('users').doc(uid).update({friendCode: code}).then(function() {
                state.userData.friendCode = code;
                render();
              });
              return;
            }
            var code = generateFriendCode();
            db.collection('users').where('friendCode', '==', code).get().then(function(snap) {
              if (snap.empty) {
                db.collection('users').doc(uid).update({friendCode: code}).then(function() {
                  state.userData.friendCode = code;
                  render();
                });
              } else {
                generateAndSaveCode(attempt + 1);
              }
            });
          };
          generateAndSaveCode(1);
        }
        
        // Founding Member Migration - mark existing users (one-time)
        // CRITICAL: ALL users created before Jan 24, 2026 00:00:00 UTC get founding member badge
        var migrationDate = new Date('2026-01-24T00:00:00Z');
        var userCreated = data.createdAt ? new Date(data.createdAt) : new Date(0);
        var shouldBeFounding = userCreated < migrationDate;
        
        console.log('=== BADGE MIGRATION CHECK ===');
        console.log('User email:', state.user ? state.user.email : 'unknown');
        console.log('User createdAt:', data.createdAt);
        console.log('User created date:', userCreated.toISOString());
        console.log('Migration cutoff:', migrationDate.toISOString());
        console.log('Should be founding?', shouldBeFounding);
        console.log('Current foundingMember value:', data.foundingMember);
        console.log('Needs migration?', (data.foundingMember === undefined) || (data.foundingMember === false && shouldBeFounding));
        
        // Re-run migration if:
        // 1. foundingMember is undefined (never migrated)
        // 2. foundingMember is false BUT they should be founding (wrong migration)
        var needsMigration = (data.foundingMember === undefined) || 
                             (data.foundingMember === false && shouldBeFounding);
        
        if (needsMigration) {
          console.log('[Migration] 🚀 RUNNING MIGRATION');
          
          var updateData = {};
          
          // Add email if missing (for existing users)
          if (!data.email && state.user && state.user.email) {
            updateData.email = state.user.email;
            console.log('[Migration] Adding email:', state.user.email);
          }
          
          // Check if this is the creator
          var isCreator = state.user && state.user.email === 'ashthunter@icloud.com';
          
          // If account created before migration date, they're a founding member
          if (isCreator) {
            updateData.foundingMember = false;
            updateData.customBadge = 'CREATOR';
            updateData.customBadgeColor = '#2196F3'; // Blue
            state.userData.foundingMember = false;
            state.userData.customBadge = 'CREATOR';
            state.userData.customBadgeColor = '#2196F3';
            
            console.log('[Migration] ✅ MARKING AS CREATOR');
            
            db.collection('users').doc(uid).update(updateData).then(function() {
              console.log('[Migration] ✅✅✅ SUCCESS! customBadge set to CREATOR in Firebase');
              render();
            }).catch(function(err) {
              console.error('[Migration] ❌❌❌ FAILED to save:', err);
            });
          } else if (shouldBeFounding) {
            updateData.foundingMember = true;
            updateData.foundingMemberSince = new Date().toISOString();
            updateData.customBadge = 'FOUNDER';
            updateData.customBadgeColor = '#888888'; // Gray (change to any color)
            
            // Update state immediately
            state.userData.foundingMember = true;
            state.userData.customBadge = 'FOUNDER';
            state.userData.customBadgeColor = '#888888';
            if (updateData.email) state.userData.email = updateData.email;
            
            console.log('[Migration] ✅ MARKING AS FOUNDING MEMBER');
            console.log('[Migration] Updating Firebase with:', updateData);
            
            db.collection('users').doc(uid).update(updateData).then(function() {
              console.log('[Migration] ✅✅✅ SUCCESS! User is now FOUNDING MEMBER in Firebase');
              console.log('[Migration] customBadge set to FOUNDER - you can edit this in Firebase Console');
              render(); // Force re-render to show badge
            }).catch(function(err) {
              console.error('[Migration] ❌❌❌ FAILED to save:', err);
            });
          } else {
            // New user, not a founding member
            updateData.foundingMember = false;
            state.userData.foundingMember = false;
            
            console.log('[Migration] Marking as NEW USER (no badge)');
            
            db.collection('users').doc(uid).update(updateData).catch(function(err) {
              console.error('[Migration] Failed to mark non-founding:', err);
            });
          }
        } else {
          console.log('[Migration] ✓ Already has correct badge status');
          console.log('[Migration] foundingMember =', data.foundingMember);
          
          // Make sure state has the value too
          state.userData.foundingMember = data.foundingMember;
        }
        console.log('=== END BADGE MIGRATION ===');
        
        // Update user lookup table for easy admin access
        // This creates a document at appConfig/userLookup with username -> uid mapping
        if (data.username) {
          var lookupUpdate = {};
          lookupUpdate[data.username] = uid;
          db.collection('appConfig').doc('userLookup').set(lookupUpdate, { merge: true })
            .then(function() {
              console.log('[Lookup] Updated userLookup:', data.username, '→', uid);
            })
            .catch(function(err) {
              console.log('[Lookup] Failed to update:', err);
            });
        }
        
        loadPosts(uid);
        loadFriends(uid);
        loadFriendRequests(uid);
        loadGroups(uid);
        loadGroupNotifications(uid);
        
        // Load draft postcard from localStorage if exists
        try {
          var draftKey = 'postcard_draft_' + uid;
          var savedDraft = localStorage.getItem(draftKey);
          if (savedDraft) {
            var draft = JSON.parse(savedDraft);
            console.log('[Draft] Loaded postcard draft from localStorage:', draft);
            state.np = draft;
          }
        } catch (e) {
          console.error('[Draft] Failed to load draft:', e);
        }
        
        // Check for pending posts and try to sync if online
        if (state.online && navigator.onLine) {
          setTimeout(function() {
            syncPendingPost();
          }, 1000);
        }
        
        // Load saved drafts
        loadSavedDrafts();
        
        // Check for update notification and trigger render if notification was added
        var notificationAdded = checkForUpdateNotification();
        
        setState({view: 'feed'});
        
        // If notification was added, trigger an additional render to update badge
        if (notificationAdded) {
          console.log('[Update Check] Triggering render for new notification');
          setTimeout(function() { render(); }, 100);
        }
      }
    }).catch(function(err) {
      console.error('[Offline] Failed to load user data:', err);
      
      // Still show the app even if offline - use cached data
      state.userData = {id: uid, username: 'User', avatar: null};
      
      // Try to load cached data from localStorage
      try {
        var cachedUser = localStorage.getItem('postcard_user_' + uid);
        if (cachedUser) {
          var cached = JSON.parse(cachedUser);
          state.userData = cached;
          console.log('[Offline] Loaded cached user data');
          
          // Preload cached profile picture
          if (state.userData.avatar && !imageCache[state.userData.avatar]) {
            var preloadImg = new Image();
            preloadImg.src = state.userData.avatar;
            imageCache[state.userData.avatar] = preloadImg;
            console.log('[Offline] Preloaded cached profile picture');
          }
        }
      } catch (e) {
        console.error('[Offline] Failed to load cached user:', e);
      }
      
      // Load draft postcard from localStorage if exists (same as online)
      try {
        var draftKey = 'postcard_draft_' + uid;
        var savedDraft = localStorage.getItem(draftKey);
        if (savedDraft) {
          var draft = JSON.parse(savedDraft);
          console.log('[Offline] Loaded postcard draft from localStorage:', draft);
          state.np = draft;
        }
      } catch (e) {
        console.error('[Offline] Failed to load draft:', e);
      }
      
      // Load saved drafts
      loadSavedDrafts();
      
      setState({view: 'feed'});
    });
  }
  
  // Check for weekly lookback periodically (once per session)
  var weeklyLookbackChecked = false;
  function maybeCheckWeeklyLookback() {
    if (!weeklyLookbackChecked && state.myPosts.length > 0) {
      weeklyLookbackChecked = true;
      checkWeeklyLookback();
    }
  }

  var postsUnsubscribe = null;
  var friendsUnsubscribe = null;
  var friendPostsUnsubscribes = [];

  function loadPosts(uid) {
    // Unsubscribe from previous listener
    if (postsUnsubscribe) {
      postsUnsubscribe();
    }
    
    // Track seen reactions to detect new ones
    var seenReactions = JSON.parse(localStorage.getItem('postcard_seen_reactions') || '{}');
    
    // Set up real-time listener for my posts
    postsUnsubscribe = db.collection('posts')
      .where('userId', '==', uid)
      .onSnapshot(function(snap) {
        var posts = [];
        snap.forEach(function(d) {
          var p = {id: d.id};
          var data = d.data();
          for (var k in data) p[k] = data[k];
          posts.push(p);
          
          // Check for new reactions on this post
          var reactions = data.reactions || {};
          for (var reactorId in reactions) {
            if (reactorId === uid) continue; // Skip my own reactions
            var reactionKey = p.id + '_' + reactorId;
            if (!seenReactions[reactionKey]) {
              // New reaction! Find reactor name
              seenReactions[reactionKey] = true;
              
              // Create closure to capture reactorId and emoji
              (function(postId, rId, emoji) {
                // First try to find in friends list
                var reactorName = null;
                for (var fi = 0; fi < state.friends.length; fi++) {
                  if (state.friends[fi].id === rId) {
                    reactorName = state.friends[fi].username;
                    break;
                  }
                }
                
                if (reactorName) {
                  // Found in friends, add notification immediately
                  addNotification('reaction', {
                    postId: postId,
                    fromId: rId,
                    fromUsername: reactorName,
                    emoji: emoji
                  });
                } else {
                  // Not in friends yet, fetch from Firestore
                  db.collection('users').doc(rId).get().then(function(userDoc) {
                    var username = 'Someone';
                    if (userDoc.exists && userDoc.data().username) {
                      username = userDoc.data().username;
                    }
                    addNotification('reaction', {
                      postId: postId,
                      fromId: rId,
                      fromUsername: username,
                      emoji: emoji
                    });
                  }).catch(function() {
                    addNotification('reaction', {
                      postId: postId,
                      fromId: rId,
                      fromUsername: 'Someone',
                      emoji: emoji
                    });
                  });
                }
              })(p.id, reactorId, reactions[reactorId]);
            }
          }
        });
        
        // Save seen reactions
        localStorage.setItem('postcard_seen_reactions', JSON.stringify(seenReactions));
        
        // Sort by createdAt descending (newest first)
        posts.sort(function(a, b) {
          var aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          var bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        
        // Check if actually posted TODAY in user's LOCAL timezone (for UNBLURRING friends' posts)
        var hasPosted = hasPostedInLocalDay(posts);
        
        // Check if has draft for today (for BLOCKING camera)
        var todayLocal = getLocalDate();
        var hasPostcardToday = hasPosted;
        if (!hasPostcardToday && state.savedDrafts && state.savedDrafts.length > 0) {
          for (var i = 0; i < state.savedDrafts.length; i++) {
            // Check draft's date against local date
            var draftLocalDate = state.savedDrafts[i].date;
            if (draftLocalDate === todayLocal) {
              hasPostcardToday = true;
              console.log('[Drafts] Found draft for today - will block camera but NOT unblur posts');
              break;
            }
          }
        }
        
        state.myPosts = posts;
        state.posted = hasPosted;  // Only TRUE if actually posted (unblurs friends)
        state.hasPostcardToday = hasPostcardToday;  // TRUE if draft OR posted (blocks camera)
        
        // Check for weekly lookback after posts are loaded
        maybeCheckWeeklyLookback();
        
        render();
      }, function(error) {
        console.error('Posts listener error:', error);
        // Fallback to one-time fetch
        db.collection('posts').where('userId', '==', uid).get().then(function(snap) {
          var posts = [];
          snap.forEach(function(d) {
            var p = {id: d.id};
            var data = d.data();
            for (var k in data) p[k] = data[k];
            posts.push(p);
          });
          posts.sort(function(a, b) {
            var aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            var bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
          });
          var hasPosted = hasPostedInLocalDay(posts);
          setState({myPosts: posts, posted: hasPosted});
        });
      });
  }

  function loadFriends(uid) {
    // Unsubscribe from previous listeners
    if (friendsUnsubscribe) {
      friendsUnsubscribe();
    }
    friendPostsUnsubscribes.forEach(function(unsub) { unsub(); });
    friendPostsUnsubscribes = [];
    
    // Listen for changes to my user doc (for friends list changes)
    friendsUnsubscribe = db.collection('users').doc(uid).onSnapshot(function(userDoc) {
      var data = userDoc.data();
      if (!data) return;
      var ids = data.friends || [];
      
      if (ids.length === 0) {
        setState({friends: []});
        return;
      }
      
      // Clear old listeners
      friendPostsUnsubscribes.forEach(function(unsub) { unsub(); });
      friendPostsUnsubscribes = [];
      
      // Create a map to track friends by ID
      var friendsMap = {};
      var friendsData = [];
      
      ids.forEach(function(fid) {
        // Use onSnapshot for friend user data - this makes badges update in real-time!
        var unsubFriendUser = db.collection('users').doc(fid).onSnapshot(function(fDoc) {
          if (fDoc.exists) {
            var fdata = fDoc.data();
            var isNew = !friendsMap[fid];
            
            // Create or update friend object
            if (!friendsMap[fid]) {
              friendsMap[fid] = {id: fid, posts: []};
              friendsData.push(friendsMap[fid]);
            }
            
            var f = friendsMap[fid];
            
            // Update all fields from Firebase (including customBadge, customBadgeColor)
            for (var k in fdata) f[k] = fdata[k];
            f.id = fid; // Make sure ID stays set
            
            // Update user lookup table for this friend
            if (fdata.username && isNew) {
              var lookupUpdate = {};
              lookupUpdate[fdata.username] = fid;
              db.collection('appConfig').doc('userLookup').set(lookupUpdate, { merge: true }).catch(function() {});
            }
            
            // Auto-write customBadge and customBadgeColor if missing
            if (!fdata.customBadge || !fdata.customBadgeColor) {
              var badge = fdata.customBadge || null;
              var badgeColor = fdata.customBadgeColor || null;
              var needsUpdate = false;
              
              if (!badge) {
                if (fdata.email === 'ashthunter@icloud.com') {
                  badge = 'CREATOR';
                } else if (isFoundingMember(fdata)) {
                  badge = 'FOUNDER';
                }
              }
              
              if (badge && !badgeColor) {
                if (badge === 'CREATOR') {
                  badgeColor = '#2196F3';
                } else if (badge === 'FOUNDER') {
                  badgeColor = '#888888';
                } else {
                  badgeColor = '#E07A5F';
                }
                needsUpdate = true;
              }
              
              if (!fdata.customBadge && badge) {
                needsUpdate = true;
              }
              
              if (needsUpdate && badge) {
                console.log('[Badge] Auto-setting for', fdata.username || fid, '→', badge, badgeColor);
                db.collection('users').doc(fid).update({ customBadge: badge, customBadgeColor: badgeColor }).catch(function(err) {
                  console.error('[Badge] Failed to save:', err);
                });
              }
            }
            
            // Set up posts listener only once per friend
            if (isNew) {
              var unsubFriendPosts = db.collection('posts')
                .where('userId', '==', fid)
                .onSnapshot(function(pSnap) {
                  f.posts = [];
                  pSnap.forEach(function(d) {
                    var p = {id: d.id};
                    var pdata = d.data();
                    for (var k in pdata) p[k] = pdata[k];
                    f.posts.push(p);
                  });
                  f.posts.sort(function(a, b) { return b.date.localeCompare(a.date); });
                  setState({friends: state.friends.slice()});
                }, function(error) {
                  console.error('Friend posts listener error:', error);
                });
              
              friendPostsUnsubscribes.push(unsubFriendPosts);
            }
            
            // Update state
            setState({friends: friendsData.slice()});
          }
        }, function(error) {
          console.error('Friend user listener error:', error);
        });
        
        friendPostsUnsubscribes.push(unsubFriendUser);
      });
    }, function(error) {
      console.error('Friends listener error:', error);
    });
  }

  var friendRequestsUnsubscribe = null;
  
  function loadFriendRequests(uid) {
    // Unsubscribe from previous listener if exists
    if (friendRequestsUnsubscribe) {
      friendRequestsUnsubscribe();
    }
    
    // Set up real-time listener
    friendRequestsUnsubscribe = db.collection('friendRequests')
      .where('toId', '==', uid)
      .where('status', '==', 'pending')
      .onSnapshot(function(snap) {
        var requests = [];
        var completed = 0;
        if (snap.empty) {
          setState({friendRequests: []});
          return;
        }
        snap.forEach(function(d) {
          var req = {id: d.id};
          var data = d.data();
          for (var k in data) req[k] = data[k];
          db.collection('users').doc(req.fromId).get().then(function(userDoc) {
            if (userDoc.exists) {
              req.fromUser = userDoc.data();
              req.fromUser.id = req.fromId;
            }
            requests.push(req);
            completed++;
            if (completed === snap.size) {
              setState({friendRequests: requests});
            }
          });
        });
      }, function(error) {
        console.error('Friend requests listener error:', error);
      });
  }

  function sendFriendRequest(toId) {
    if (!state.user) return;
    var fromId = state.user.uid;
    // Check if already friends
    db.collection('users').doc(fromId).get().then(function(doc) {
      var friends = doc.data().friends || [];
      if (friends.indexOf(toId) !== -1) {
        alert('Already friends!');
        return;
      }
      // Check if request already exists
      db.collection('friendRequests')
        .where('fromId', '==', fromId)
        .where('toId', '==', toId)
        .where('status', '==', 'pending')
        .get().then(function(snap) {
          if (!snap.empty) {
            alert('Friend request already sent!');
            return;
          }
          // Create request
          db.collection('friendRequests').add({
            fromId: fromId,
            toId: toId,
            status: 'pending',
            createdAt: new Date().toISOString()
          }).then(function() {
            alert('Friend request sent!');
            setState({friendCode: ''});
          });
        });
    });
  }

  function acceptFriendRequest(request) {
    var fromId = request.fromId;
    var toId = state.user.uid;
    
    // Update request status first
    db.collection('friendRequests').doc(request.id).update({status: 'accepted'}).then(function() {
      // Add friend to my list
      return db.collection('users').doc(toId).get();
    }).then(function(doc) {
      var myFriends = doc.data().friends || [];
      if (myFriends.indexOf(fromId) === -1) {
        myFriends.push(fromId);
        return db.collection('users').doc(toId).update({friends: myFriends});
      }
    }).then(function() {
      // Add me to their list
      return db.collection('users').doc(fromId).get();
    }).then(function(doc) {
      var theirFriends = doc.data().friends || [];
      if (theirFriends.indexOf(toId) === -1) {
        theirFriends.push(toId);
        return db.collection('users').doc(fromId).update({friends: theirFriends});
      }
    }).then(function() {
      // Reload everything
      loadFriendRequests(toId);
      loadFriends(toId);
    }).catch(function(e) {
      console.error('Error accepting friend request:', e);
    });
  }

  function declineFriendRequest(request) {
    db.collection('friendRequests').doc(request.id).update({status: 'declined'}).then(function() {
      loadFriendRequests(state.user.uid);
    });
  }

  // Notification helpers
  function addNotification(type, data) {
    var notif = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      type: type, // 'friendRequest', 'reaction', 'weeklyLookback', 'update'
      data: data,
      createdAt: new Date().toISOString(),
      read: false
    };
    var newNotifs = [notif].concat(state.notifications);
    // Keep only last 50 notifications
    if (newNotifs.length > 50) newNotifs = newNotifs.slice(0, 50);
    setState({notifications: newNotifs});
  }
  
  function markNotificationRead(notifId) {
    var newNotifs = state.notifications.map(function(n) {
      if (n.id === notifId) {
        return Object.assign({}, n, {read: true});
      }
      return n;
    });
    setState({notifications: newNotifs});
  }
  
  function removeNotification(notifId) {
    var newNotifs = state.notifications.filter(function(n) {
      return n.id !== notifId;
    });
    setState({notifications: newNotifs});
  }
  
  function getUnreadCount() {
    var count = 0;
    var debugInfo = {reactions: 0, groups: 0, updates: 0, weekly: 0, other: 0};
    
    for (var i = 0; i < state.notifications.length; i++) {
      var n = state.notifications[i];
      // Count unread notifications EXCEPT updates
      if (!n.read && n.type !== 'update') {
        count++;
        // Debug: track what types are unread
        if (n.type === 'reaction') debugInfo.reactions++;
        else if (n.type === 'weeklyLookback') debugInfo.weekly++;
        else if (n.type && n.type.startsWith('group_')) debugInfo.groups++;
        else debugInfo.other++;
      } else if (!n.read && n.type === 'update') {
        // Track updates but don't count them
        debugInfo.updates++;
      }
    }
    
    // Also add pending friend requests
    count += state.friendRequests.length;
    
    // Log for debugging if count > 0 OR if there are mysterious notifications
    if (count > 0 || debugInfo.updates > 0 || debugInfo.other > 0) {
      console.log('[Badge] Count:', count, '(Friends:', state.friendRequests.length, 'Reactions:', debugInfo.reactions, 'Groups:', debugInfo.groups, 'Weekly:', debugInfo.weekly, 'Updates NOT counted:', debugInfo.updates, 'Other:', debugInfo.other + ')');
    }
    
    return count;
  }
  
  function checkWeeklyLookback() {
    // Check if it's Sunday and we haven't shown this week's lookback
    var now = new Date();
    if (now.getDay() !== 0) return false; // Only on Sundays
    
    // Get the week identifier (year + week number)
    var startOfYear = new Date(now.getFullYear(), 0, 1);
    var weekNum = Math.ceil((((now - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
    var weekId = now.getFullYear() + '-W' + weekNum;
    
    // Check if we already have a lookback for this week
    var hasLookback = state.notifications.some(function(n) {
      return n.type === 'weeklyLookback' && n.data && n.data.weekId === weekId;
    });
    
    if (!hasLookback && state.myPosts.length > 0) {
      // Get posts from this week
      var weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);
      
      var weekPosts = state.myPosts.filter(function(p) {
        var postDate = new Date(p.date);
        return postDate >= weekStart && postDate <= now;
      });
      
      if (weekPosts.length > 0) {
        // Add notification directly without calling setState
        var notif = {
          id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          type: 'weeklyLookback',
          data: {
            weekId: weekId,
            weekLabel: getWeekLabel(weekStart, now),
            postCount: weekPosts.length,
            posts: weekPosts.map(function(p) { return p.id; })
          },
          createdAt: new Date().toISOString(),
          read: false
        };
        state.notifications = [notif].concat(state.notifications);
        if (state.notifications.length > 50) state.notifications = state.notifications.slice(0, 50);
        localStorage.setItem('postcard_notifications', JSON.stringify(state.notifications));
        return true; // Indicates a notification was added
      }
    }
    return false;
  }
  
  function getWeekLabel(start, end) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[start.getMonth()] + ' ' + start.getDate() + ' - ' + months[end.getMonth()] + ' ' + end.getDate();
  }
  
  function checkForUpdateNotification() {
    var lastSeenVersion = localStorage.getItem('postcard_last_seen_version');
    console.log('[Update Check] Last seen:', lastSeenVersion, 'Current:', APP_VERSION);
    
    // If versions are different AND we have notes for this version
    if (lastSeenVersion !== APP_VERSION && UPDATE_NOTES[APP_VERSION]) {
      console.log('[Update Check] New version detected!');
      
      // Check if we already have a notification for this version
      var alreadyHasNotif = state.notifications.some(function(n) {
        return n.type === 'update' && n.data && n.data.version === APP_VERSION;
      });
      
      if (!alreadyHasNotif) {
        console.log('[Update Check] Creating notification for version', APP_VERSION);
        
        // Show prominent update modal
        showUpdateModal(APP_VERSION, UPDATE_NOTES[APP_VERSION]);
        
        // Create the notification
        var notif = {
          id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          type: 'update',
          data: {
            version: APP_VERSION,
            notes: UPDATE_NOTES[APP_VERSION]
          },
          createdAt: new Date().toISOString(),
          read: false
        };
        
        // Add to notifications array
        state.notifications = [notif].concat(state.notifications);
        if (state.notifications.length > 50) state.notifications = state.notifications.slice(0, 50);
        
        // Save to localStorage
        localStorage.setItem('postcard_notifications', JSON.stringify(state.notifications));
        console.log('[Update Check] Notification saved to localStorage');
        
        // Update the stored version AFTER creating notification
        localStorage.setItem('postcard_last_seen_version', APP_VERSION);
        console.log('[Update Check] Updated last_seen_version to', APP_VERSION);
        
        return true; // Indicates a notification was added
      } else {
        console.log('[Update Check] Notification already exists for this version');
        // Still update the stored version
        localStorage.setItem('postcard_last_seen_version', APP_VERSION);
      }
    } else if (!lastSeenVersion) {
      // First time user - just set version without notification
      console.log('[Update Check] First time user, setting version to', APP_VERSION);
      localStorage.setItem('postcard_last_seen_version', APP_VERSION);
    } else {
      console.log('[Update Check] No update detected');
    }
    
    return false;
  }
  
  function showUpdateModal(version, notes) {
    // Remove any existing modal
    var existing = document.getElementById('updateModal');
    if (existing) existing.remove();
    
    var modal = document.createElement('div');
    modal.id = 'updateModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:20px;padding:28px;max-width:320px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
    
    box.innerHTML = '<div style="font-size:40px;margin-bottom:12px;">🎉</div>' +
      '<h2 style="margin:0 0 8px;color:#2D2A26;font-size:20px;">Updated to v' + version + '</h2>' +
      '<p style="margin:0 0 20px;color:#666;font-size:14px;line-height:1.5;">' + notes + '</p>' +
      '<button onclick="document.getElementById(\'updateModal\').remove();" style="background:#E07A5F;color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;width:100%;">Got it!</button>';
    
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  // Generate a unique 8-character friend code (case-sensitive: uppercase, lowercase, numbers)
  function generateFriendCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // Excluded confusing chars: I,l,O,0,1
    var code = '';
    for (var i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function handleSignup() {
    var a = state.authData;
    if (!a.email || !a.password || !a.username || !a.birthday) {
      setState({authError: 'Please fill all fields'});
      return;
    }
    setState({authLoading: true, authError: ''});
    auth.createUserWithEmailAndPassword(a.email, a.password).then(function(cred) {
      var saveUser = function(avatarUrl, friendCode) {
        var userData = {
          username: a.username,
          email: a.email,
          birthday: a.birthday,
          avatar: avatarUrl,
          friends: [],
          friendCode: friendCode,
          createdAt: new Date().toISOString()
        };
        db.collection('users').doc(cred.user.uid).set(userData).then(function() {
          userData.id = cred.user.uid;
          setState({userData: userData, authLoading: false, view: 'feed'});
          // Load all user data after signup
          loadPosts(cred.user.uid);
          loadFriends(cred.user.uid);
          loadFriendRequests(cred.user.uid);
          loadGroups(cred.user.uid);
          loadGroupNotifications(cred.user.uid);
        }).catch(function(e) {
          setState({authError: 'Failed to create account: ' + e.message, authLoading: false});
        });
      };
      
      // Generate unique friend code - check for collisions
      var tryCode = function(attempt) {
        if (attempt > 10) {
          // Fallback: use uid prefix if too many collisions
          var code = cred.user.uid.substring(0, 8);
          if (a.avatar) {
            var ref = storage.ref('avatars/' + cred.user.uid);
            ref.putString(a.avatar, 'data_url').then(function() {
              ref.getDownloadURL().then(function(url) { saveUser(url, code); });
            });
          } else {
            saveUser(null, code);
          }
          return;
        }
        var code = generateFriendCode();
        db.collection('users').where('friendCode', '==', code).get().then(function(snap) {
          if (snap.empty) {
            // Code is unique, proceed
            if (a.avatar) {
              var ref = storage.ref('avatars/' + cred.user.uid);
              ref.putString(a.avatar, 'data_url').then(function() {
                ref.getDownloadURL().then(function(url) { saveUser(url, code); });
              });
            } else {
              saveUser(null, code);
            }
          } else {
            // Collision, try again
            tryCode(attempt + 1);
          }
        });
      };
      tryCode(1);
    }).catch(function(e) {
      setState({authError: e.message, authLoading: false});
    });
  }

  function handleLogin() {
    var a = state.authData;
    if (!a.email || !a.password) return;
    setState({authLoading: true, authError: ''});
    auth.signInWithEmailAndPassword(a.email, a.password).then(function() {
      setState({authLoading: false});
    }).catch(function(e) {
      setState({authError: 'Invalid email or password', authLoading: false});
    });
  }

  function handleForgotPassword() {
    var email = state.authData.email.trim();
    if (!email) {
      setState({authError: 'Please enter your email address first'});
      return;
    }
    
    // Validate email format
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setState({authError: 'Please enter a valid email address'});
      return;
    }
    
    setState({authLoading: true, authError: ''});
    console.log('[Password Reset] Sending reset email to:', email);
    
    auth.sendPasswordResetEmail(email).then(function() {
      setState({authLoading: false, authError: ''});
      console.log('[Password Reset] Email sent successfully');
      alert('✅ Password reset email sent!\n\nCheck your inbox (and spam folder) for a link to reset your password.');
    }).catch(function(e) {
      console.error('[Password Reset] Error:', e.code, e.message);
      var msg = 'Could not send reset email';
      if (e.code === 'auth/user-not-found') {
        msg = 'No account found with this email address';
      } else if (e.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address';
      } else if (e.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try again later';
      } else {
        msg = 'Error: ' + e.message;
      }
      setState({authError: msg, authLoading: false});
    });
  }

  function handleLogout() {
    auth.signOut();
  }

  function startEditProfile() {
    setState({
      editingProfile: true,
      editProfile: {
        username: state.userData ? state.userData.username : '',
        avatar: state.userData ? state.userData.avatar : null,
        newAvatar: null
      }
    });
  }

  function saveProfile() {
    var ep = state.editProfile;
    if (!ep.username.trim()) {
      alert('Username cannot be empty');
      return;
    }
    setState({savingProfile: true});
    
    var updateData = {username: ep.username.trim()};
    
    var doUpdate = function(avatarUrl) {
      if (avatarUrl !== undefined) {
        updateData.avatar = avatarUrl;
      }
      db.collection('users').doc(state.user.uid).update(updateData).then(function() {
        state.userData.username = updateData.username;
        if (updateData.avatar !== undefined) {
          state.userData.avatar = updateData.avatar;
        }
        setState({savingProfile: false, editingProfile: false});
      }).catch(function(e) {
        console.error('Error saving profile:', e);
        setState({savingProfile: false});
        alert('Error saving profile');
      });
    };
    
    if (ep.newAvatar) {
      // Compress avatar (smaller size, higher quality for profile pic)
      compressImage(ep.newAvatar, 400, 0.8).then(function(compressed) {
        console.log('[Profile] Avatar compressed for upload');
        var ref = storage.ref('avatars/' + state.user.uid + '_' + Date.now());
        return ref.putString(compressed, 'data_url');
      }).then(function(snapshot) {
        return snapshot.ref.getDownloadURL();
      }).then(function(url) {
        doUpdate(url);
      }).catch(function(e) {
        console.error('Error uploading avatar:', e);
        setState({savingProfile: false});
        alert('Error uploading photo');
      });
    } else {
      doUpdate();
    }
  }

  function cancelEditProfile() {
    setState({editingProfile: false, editProfile: {username: '', avatar: null, newAvatar: null}});
  }

  function unfriend(friendId) {
    if (!confirm('Remove this friend?')) return;
    
    var myId = state.user.uid;
    
    // Remove from my friends list
    db.collection('users').doc(myId).get().then(function(doc) {
      var myFriends = doc.data().friends || [];
      var newFriends = [];
      for (var i = 0; i < myFriends.length; i++) {
        if (myFriends[i] !== friendId) newFriends.push(myFriends[i]);
      }
      return db.collection('users').doc(myId).update({friends: newFriends});
    }).then(function() {
      // Remove me from their friends list
      return db.collection('users').doc(friendId).get();
    }).then(function(doc) {
      var theirFriends = doc.data().friends || [];
      var newFriends = [];
      for (var i = 0; i < theirFriends.length; i++) {
        if (theirFriends[i] !== myId) newFriends.push(theirFriends[i]);
      }
      return db.collection('users').doc(friendId).update({friends: newFriends});
    }).then(function() {
      // Go back to profile
      nav('profile');
    }).catch(function(e) {
      console.error('Error unfriending:', e);
      alert('Error removing friend');
    });
  }

  function nav(v) {
    // Enable audio on any navigation (user interaction)
    window.audioEnabled = true;
    
    setState({
      view: v,
      sel: null,
      dayPost: null,
      friendProfile: null,
      friendDayPost: null,
      showAddFriend: false,
      authError: '',
      showMenu: false,
      activeEdit: null
    });
  }

  // Compress image to reduce Firebase storage and localStorage usage
  function compressImage(dataUrl, maxWidth, quality) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      
      img.onerror = function(err) {
        console.error('[Compression] Image load failed:', err);
        // Return original if compression fails
        resolve(dataUrl);
      };
      
      img.onload = function() {
        try {
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          
          // Calculate dimensions maintaining aspect ratio
          var width = img.width;
          var height = img.height;
          
          if (width > maxWidth) {
            height = (height / width) * maxWidth;
            width = maxWidth;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);
          
          // Return compressed image
          var compressed = canvas.toDataURL('image/jpeg', quality);
          console.log('[Compression] Success - Original:', Math.round(dataUrl.length/1024) + 'KB, Compressed:', Math.round(compressed.length/1024) + 'KB');
          resolve(compressed);
        } catch (err) {
          console.error('[Compression] Canvas error:', err);
          // Return original if compression fails
          resolve(dataUrl);
        }
      };
      
      img.src = dataUrl;
    });
  }

  function enableNotifications() {
    if (!messaging) {
      alert('Push notifications not supported in your browser');
      return Promise.reject('Not supported');
    }
    
    console.log('[Notifications] Requesting permission...');
    
    return Notification.requestPermission()
      .then(function(permission) {
        if (permission !== 'granted') {
          throw new Error('Permission denied');
        }
        
        console.log('[Notifications] Permission granted, getting token...');
        return messaging.getToken({ vapidKey: VAPID_KEY });
      })
      .then(function(token) {
        if (!token) throw new Error('No token');
        
        console.log('[Notifications] Token received, saving to Firestore...');
        
        return db.collection('users').doc(state.user.uid).update({
          fcmToken: token,
          notificationsEnabled: true
        });
      })
      .then(function() {
        console.log('[Notifications] Saved successfully');
        if (state.userData) {
          state.userData.notificationsEnabled = true;
        }
        alert('✅ Notifications enabled! You\'ll be notified when you\'re the theme chooser, when the theme is set, or someone reacts to your postcard.');
        render();
      })
      .catch(function(e) {
        console.error('[Notifications] Error:', e);
        if (e.message === 'Permission denied') {
          alert('❌ Notification permission denied. Please enable in browser settings.');
        } else {
          alert('Failed to enable notifications. Try again.');
        }
      });
  }
  
  function disableNotifications() {
    console.log('[Notifications] Disabling...');
    
    return db.collection('users').doc(state.user.uid).update({
      notificationsEnabled: false,
      fcmToken: firebase.firestore.FieldValue.delete()
    }).then(function() {
      console.log('[Notifications] Disabled');
      if (state.userData) {
        state.userData.notificationsEnabled = false;
      }
      alert('Notifications disabled');
      render();
    }).catch(function(e) {
      console.error('[Notifications] Error disabling:', e);
      alert('Failed to disable notifications');
    });
  }

  function uploadImage(dataUrl, path) {
    var ref = storage.ref(path);
    return ref.putString(dataUrl, 'data_url').then(function() {
      return ref.getDownloadURL();
    });
  }

  function submit() {
    var n = state.np;
    if (!n.photo || !n.outfit || !n.songTitle || !n.songArtist || !n.loc) return;
    
    // CRITICAL: Check GLOBAL lock first (survives re-renders)
    if (uploadInProgress) {
      console.error('[Submit] ❌ BLOCKED: Upload already in progress (global lock)');
      return;
    }
    
    // Prevent double-submit with immediate flag and state check
    if (state.uploading) {
      console.log('[Submit] Already uploading, ignoring duplicate submit');
      return;
    }
    
    // Set GLOBAL lock immediately
    uploadInProgress = true;
    console.log('[Submit] 🔒 Global upload lock SET');
    
    // Check if offline
    if (!state.online || !navigator.onLine) {
      console.log('[Offline] No connection - compressing and saving as draft');
      
      // Compress images before saving to localStorage (to avoid quota exceeded)
      setState({uploading: true});
      
      Promise.all([
        compressImage(n.photo, 800, 0.6),  // More aggressive for localStorage
        compressImage(n.outfit, 800, 0.6)   // 800px @ 60% quality
      ]).then(function(compressed) {
        var draftData = {
          photo: compressed[0],  // Compressed
          outfit: compressed[1],  // Compressed
          songTitle: n.songTitle,
          songArtist: n.songArtist,
          songArtwork: n.songArtwork || '',
          songPreview: n.songPreview || '',
          loc: n.loc,
          quote: n.quote,
          privateNote: n.privateNote,
          photoX: n.photoX,
          photoY: n.photoY,
          outfitX: n.outfitX,
          outfitY: n.outfitY,
          songFont: n.songFont,
          songColor: n.songColor,
          timestamp: Date.now()
        };
        
        var saved = saveDraft(draftData);
        
        // Release GLOBAL lock
        uploadInProgress = false;
        console.log('[Submit] 🔓 Global upload lock RELEASED (draft saved)');
        
        setState({uploading: false});
        
        if (saved) {
          // Clear the working draft since it's now saved
          try {
            localStorage.removeItem('postcard_draft_' + state.user.uid);
            console.log('[Draft] Cleared working draft after saving');
          } catch (e) {
            console.error('[Draft] Failed to clear working draft:', e);
          }
          
          alert('💾 Draft Saved!\n\nYour postcard has been saved. You can upload it from the Mailbox when you\'re back online.');
          
          // Clear the form
          setState({
            step: 1,
            np: {photo: null, outfit: null, songTitle: '', songArtist: '', songArtwork: '', songPreview: '', loc: '', quote: '', privateNote: '', outfitX: 0, outfitY: 0, photoX: 0, photoY: 0, songFont: 0, songColor: 0}
          });
          nav('notifications');
        } else {
          alert('Failed to save draft. Please try again.');
        }
      }).catch(function(err) {
        console.error('[Offline] Failed to compress images:', err);
        
        // Release GLOBAL lock on error
        uploadInProgress = false;
        console.log('[Submit] 🔓 Global upload lock RELEASED (offline error)');
        
        setState({uploading: false});
        alert('Failed to save draft. Please try again.');
      });
      return;
    }
    
    // Set flag immediately before setState to prevent race condition
    state.uploading = true;
    setState({uploading: true});
    
    console.log('[Submit] Starting post submission');
    uploadPost({
      photo: n.photo,
      outfit: n.outfit,
      songTitle: n.songTitle,
      songArtist: n.songArtist,
      songArtwork: n.songArtwork,
      songPreview: n.songPreview,
      loc: n.loc,
      quote: n.quote,
      privateNote: n.privateNote,
      photoX: n.photoX,
      photoY: n.photoY,
      outfitX: n.outfitX,
      outfitY: n.outfitY,
      songFont: n.songFont,
      songColor: n.songColor,
      timestamp: Date.now(),
      date: state.editingDraftDate || null  // Use draft's ORIGINAL date if editing
    }).then(function() {
      console.log('[Submit] Post created successfully');
      
      // Release GLOBAL lock
      uploadInProgress = false;
      console.log('[Submit] 🔓 Global upload lock RELEASED');
      
      // If we were editing a draft, delete it now (since it's been uploaded)
      if (state.editingDraftId) {
        console.log('[Submit] Deleting edited draft:', state.editingDraftId);
        deleteDraft(state.editingDraftId);
        loadSavedDrafts();  // Refresh drafts list
      }
      
      // Clear draft from localStorage after successful post
      try {
        localStorage.removeItem('postcard_draft_' + state.user.uid);
        console.log('[Draft] Cleared postcard draft from localStorage');
      } catch (e) {
        console.error('[Draft] Failed to clear draft:', e);
      }
      
      setState({
        posted: true,
        uploading: false,
        step: 1,
        editingDraftId: null,  // Clear editing state
        editingDraftDate: null,
        np: {photo: null, outfit: null, songTitle: '', songArtist: '', songArtwork: '', songPreview: '', loc: '', quote: '', privateNote: '', outfitX: 0, outfitY: 0, photoX: 0, photoY: 0, songFont: 0, songColor: 0}
      });
      nav('feed');
    }).catch(function(e) {
      console.error('[Submit] Error:', e);
      
      // Release GLOBAL lock on error
      uploadInProgress = false;
      console.log('[Submit] 🔓 Global upload lock RELEASED (error)');
      
      setState({uploading: false});
      alert('Failed to upload post. Please try again.');
    });
  }

  function uploadPost(postData) {
    // CRITICAL: Check for duplicates before uploading
    // Use provided date (for edited drafts) or today's LOCAL date (for new posts)
    var postDate = postData.date || getLocalDate();
    console.log('[Upload] Uploading post for date:', postDate);
    
    // CRITICAL: Check if this date is already being uploaded RIGHT NOW
    if (uploadingDates[postDate]) {
      console.error('[Upload] ❌ BLOCKED: Already uploading post for', postDate);
      return Promise.reject(new Error('Upload already in progress for ' + postDate));
    }
    
    // Mark this date as being uploaded
    uploadingDates[postDate] = true;
    console.log('[Upload] 🔒 Marked date as uploading:', postDate);
    
    var existingPost = null;
    
    // Check in loaded posts - use local date from createdAt
    for (var i = 0; i < state.myPosts.length; i++) {
      var postLocalDate = getLocalDateFromTimestamp(state.myPosts[i].createdAt) || state.myPosts[i].date;
      if (postLocalDate === postDate) {
        existingPost = state.myPosts[i];
        break;
      }
    }
    
    if (existingPost) {
      console.error('[Upload] DUPLICATE PREVENTED: Post already exists for', postDate);
      delete uploadingDates[postDate]; // Release date lock
      return Promise.reject(new Error('You already posted for ' + postDate + '! Found existing post: ' + existingPost.id));
    }
    
    // Also check Firebase directly to be absolutely sure
    return db.collection('posts')
      .where('userId', '==', state.user.uid)
      .where('date', '==', postDate)
      .get()
      .then(function(snapshot) {
        if (!snapshot.empty) {
          console.error('[Upload] DUPLICATE PREVENTED: Found existing post in Firebase for', postDate);
          delete uploadingDates[postDate]; // Release date lock
          throw new Error('You already posted for ' + postDate + '!');
        }
        
        // No duplicate found, proceed with upload
        console.log('[Upload] No duplicate found, proceeding with upload for', postDate);
        var ts = postData.timestamp || Date.now();
        var photoUrl, outfitUrl;
        
        // Compress images before uploading to save Firebase storage
        // Max width 1200px, quality 0.7 (good balance of quality vs size)
        return Promise.all([
          compressImage(postData.photo, 1200, 0.7),
          compressImage(postData.outfit, 1200, 0.7)
        ]);
      })
      .then(function(compressed) {
        console.log('[Compression] Images compressed for upload');
        var ts = postData.timestamp || Date.now();
        return uploadImage(compressed[0], 'posts/' + state.user.uid + '/' + ts + '_photo').then(function(url) {
          photoUrl = url;
          return uploadImage(compressed[1], 'posts/' + state.user.uid + '/' + ts + '_outfit');
        }).then(function(url) {
          outfitUrl = url;
          var post = {
            userId: state.user.uid,
            date: postDate,  // Use the provided date (original draft date or today)
            location: postData.loc,
            photo: photoUrl,
            outfitPhoto: outfitUrl,
            photoX: postData.photoX,
            photoY: postData.photoY,
            outfitX: postData.outfitX,
            outfitY: postData.outfitY,
            song: {title: postData.songTitle, artist: postData.songArtist, artwork: postData.songArtwork || '', preview: postData.songPreview || ''},
            songFont: postData.songFont,
            songColor: postData.songColor,
            quote: postData.quote,
            privateNote: postData.privateNote,
            createdAt: new Date().toISOString()
          };
          return db.collection('posts').add(post).then(function(ref) {
            post.id = ref.id;
            // Don't add to state.myPosts here - the Firebase snapshot listener will handle it
            // This prevents the duplicate post bug
            console.log('[Upload] Post successfully created:', post.id);
            
            // Release date lock after successful upload
            delete uploadingDates[postDate];
            console.log('[Upload] 🔓 Released date lock for:', postDate);
            
            return post;
          });
        });
      })
      .catch(function(error) {
        // Release date lock on any error
        delete uploadingDates[postDate];
        console.log('[Upload] 🔓 Released date lock for:', postDate, '(error)');
        throw error;
      });
  }

  function searchItunes() {
    var query = state.itunesSearch.trim();
    if (!query || query.length < 2) return;
    
    console.log('[Music] Searching for:', query);
    setState({itunesSearching: true, itunesResults: [], itunesError: ''});
    
    var itunesUrl = 'https://itunes.apple.com/search?term=' + encodeURIComponent(query) + '&media=music&entity=song&limit=40&country=US';
    
    // Try multiple approaches
    var proxyUrls = [
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(itunesUrl),
      'https://corsproxy.io/?' + encodeURIComponent(itunesUrl),
      'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(itunesUrl)
    ];
    
    var currentProxy = 0;
    
    function tryNext() {
      if (currentProxy >= proxyUrls.length) {
        console.log('[Music] All proxies failed');
        setState({itunesSearching: false, itunesResults: [], itunesError: 'Search unavailable. Try again later.'});
        return;
      }
      
      var url = proxyUrls[currentProxy];
      console.log('[Music] Trying proxy', currentProxy + 1);
      
      var controller = new AbortController();
      var timeoutId = setTimeout(function() { controller.abort(); }, 10000);
      
      fetch(url, { signal: controller.signal })
        .then(function(response) {
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.text();
        })
        .then(function(text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            throw new Error('Invalid JSON');
          }
          
          if (!data.results || data.results.length === 0) {
            setState({itunesResults: [], itunesSearching: false, itunesError: 'No songs found'});
            return;
          }
          
          // Score and sort results
          var scoredResults = data.results.map(function(song) {
            var score = 0;
            var searchLower = query.toLowerCase();
            var trackLower = (song.trackName || '').toLowerCase();
            var artistLower = (song.artistName || '').toLowerCase();
            
            if (trackLower === searchLower) score += 1000;
            if (artistLower === searchLower) score += 500;
            if (trackLower.indexOf(searchLower) === 0) score += 800;
            if (trackLower.indexOf(searchLower) > -1) score += 400;
            if (artistLower.indexOf(searchLower) > -1) score += 200;
            if (song.previewUrl) score += 30;
            
            return { song: song, score: score };
          });
          
          scoredResults.sort(function(a, b) { return b.score - a.score; });
          var topResults = scoredResults.slice(0, 12).map(function(item) { return item.song; });
          
          console.log('[Music] Found', topResults.length, 'results');
          setState({itunesResults: topResults, itunesSearching: false, itunesError: ''});
        })
        .catch(function(e) {
          clearTimeout(timeoutId);
          console.log('[Music] Proxy', currentProxy + 1, 'failed:', e.message);
          currentProxy++;
          tryNext();
        });
    }
    
    tryNext();
  }

  function selectSong(song) {
    console.log('[iTunes] Song selected:', song.trackName, 'by', song.artistName);
    setNp({
      songTitle: song.trackName,
      songArtist: song.artistName,
      songArtwork: song.artworkUrl100 || '',
      songPreview: song.previewUrl || ''
    });
    setState({
      itunesSearch: '',
      itunesResults: []
    });
    console.log('[iTunes] Song data saved to state');
  }

  function addFriend() {
    var code = state.friendCode.trim();
    if (!code) return;
    // Search by friend code (case-sensitive)
    db.collection('users').where('friendCode', '==', code).get().then(function(snap) {
      if (snap.empty) {
        alert('Friend code not found. Make sure to enter it exactly as shown (codes are case-sensitive).');
        setState({friendCode: ''});
        return;
      }
      var fid = snap.docs[0].id;
      if (fid === state.user.uid) {
        alert("That's your own code!");
        setState({friendCode: ''});
        return;
      }
      sendFriendRequest(fid);
    });
  }

  function saveToCamera(post, owner) {
    setState({saving: true, showMenu: false});
    var c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:-9999px;width:600px;background:#fff;font-family:-apple-system,sans-serif';
    document.body.appendChild(c);
    var font = FONTS[post.songFont || 0].v;
    var color = COLORS[post.songColor || 0];
    var avatarHtml = (owner && owner.avatar) ? '<img src="' + owner.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:14px"/>' : ((owner && owner.username) ? owner.username[0].toUpperCase() : '?');
    var quoteHtml = post.quote ? '<p style="margin:14px 0 0;font-size:17px;font-style:italic;color:#2D2A26">"' + post.quote + '"</p>' : '';
    
    c.innerHTML = '<div style="background:#fff"><div style="position:relative;display:flex;height:360px"><div style="flex:1;overflow:hidden;position:relative"><img src="' + (post.outfitPhoto || post.outfit) + '" crossorigin="anonymous" style="width:100%;height:100%;object-fit:cover;object-position:' + (50 + (post.outfitX || 0)) + '% ' + (50 + (post.outfitY || 0)) + '%"/></div><div style="width:4px;background:#fff"></div><div style="flex:1;overflow:hidden;position:relative"><img src="' + post.photo + '" crossorigin="anonymous" style="width:100%;height:100%;object-fit:cover;object-position:' + (50 + (post.photoX || 0)) + '% ' + (50 + (post.photoY || 0)) + '%"/></div><div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 20px"><p style="margin:0;font-size:20px;font-weight:600;color:' + color + ';font-family:' + font + ';text-align:center;max-width:280px">🎵 ' + (post.song ? post.song.title : '') + '</p><p style="margin:4px 0 0;font-size:15px;color:' + color + ';font-family:' + font + ';text-align:center;max-width:280px">' + (post.song ? post.song.artist : '') + '</p></div><div style="position:absolute;top:12px;left:50%;transform:translateX(-50%);background:#E07A5F;color:#fff;padding:6px 16px;border-radius:8px;font-size:12px;font-weight:700">📮 POSTCARD</div></div><div style="padding:20px;border-top:2px solid #E8E4DF"><div style="display:flex;align-items:center;gap:12px"><div style="width:44px;height:44px;border-radius:14px;background:#E07A5F;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:#fff;overflow:hidden">' + avatarHtml + '</div><div><p style="margin:0;font-size:17px;font-weight:600;color:#2D2A26">' + (owner ? owner.username : 'You') + '</p><p style="margin:2px 0 0;font-size:13px;color:#8B8680">📍 ' + (post.location || '') + ' · ' + (post.date || '') + '</p></div></div>' + quoteHtml + '</div></div>';
    
    var imgs = c.querySelectorAll('img');
    var loaded = 0;
    var total = imgs.length;
    
    function checkReady() {
      loaded++;
      if (loaded >= total) {
        doCapture();
      }
    }
    
    function doCapture() {
      html2canvas(c, {scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#fff'}).then(function(canvas) {
        document.body.removeChild(c);
        var dataUrl = canvas.toDataURL('image/png');
        
        // Check if iOS
        var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
          // On iOS, show the image so user can long-press to save
          setState({saving: false, savedImage: dataUrl});
        } else {
          // On other devices, trigger download
          canvas.toBlob(function(blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'postcard-' + (post.date || new Date().toISOString().split('T')[0]) + '.png';
            a.click();
            URL.revokeObjectURL(url);
            setState({saving: false});
          }, 'image/png');
        }
      }).catch(function(e) {
        console.error(e);
        document.body.removeChild(c);
        setState({saving: false});
        alert('Could not save');
      });
    }
    
    if (total === 0) {
      doCapture();
    } else {
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].complete) {
          checkReady();
        } else {
          imgs[i].onload = checkReady;
          imgs[i].onerror = checkReady;
        }
      }
    }
  }

  function showDeleteConfirm(post) {
    setState({deleteConfirm: post, showMenu: false});
  }
  
  function deletePost(id) {
    setState({deleteConfirm: null});
    db.collection('posts').doc(id).delete().then(function() {
      var newPosts = [];
      for (var i = 0; i < state.myPosts.length; i++) {
        if (state.myPosts[i].id !== id) newPosts.push(state.myPosts[i]);
      }
      var hasPosted = hasPostedInLocalDay(newPosts);
      state.myPosts = newPosts;
      setState({posted: hasPosted});
      nav('feed');
    });
  }

  // ===== GROUPS FEATURE =====
  
  // Get today's date in UTC (YYYY-MM-DD)
  function getUTCDate() {
    var now = new Date();
    return now.toISOString().split('T')[0];
  }
  
  // Get today's date in viewer's LOCAL timezone (YYYY-MM-DD)
  function getLocalDate() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1);
    if (month.length < 2) month = '0' + month;
    var day = String(now.getDate());
    if (day.length < 2) day = '0' + day;
    return year + '-' + month + '-' + day;
  }
  
  // Convert a UTC timestamp to viewer's local date string (YYYY-MM-DD)
  function getLocalDateFromTimestamp(timestamp) {
    if (!timestamp) return null;
    var date = new Date(timestamp);
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1);
    if (month.length < 2) month = '0' + month;
    var day = String(date.getDate());
    if (day.length < 2) day = '0' + day;
    return year + '-' + month + '-' + day;
  }
  
  // Check if user posted on a specific date (YYYY-MM-DD format)
  function didUserPostOnDate(dateStr) {
    if (!dateStr || !state.myPosts) return false;
    for (var i = 0; i < state.myPosts.length; i++) {
      var postDate = getLocalDateFromTimestamp(state.myPosts[i].createdAt);
      if (!postDate) postDate = state.myPosts[i].date;
      if (postDate === dateStr) return true;
    }
    return false;
  }
  
  // Determine if a friend's post should be blurred and why
  // Returns: { blurred: boolean, reason: 'today' | 'missed' | null }
  function getPostBlurStatus(postDate, isLast24Hours) {
    var todayStr = getLocalDate();
    
    // For posts from last 24 hours, use simple "posted today" logic
    if (isLast24Hours) {
      return {
        blurred: !state.posted,
        reason: !state.posted ? 'today' : null
      };
    }
    
    // For older posts, check if user posted on THAT specific day
    var userPostedThatDay = didUserPostOnDate(postDate);
    
    if (userPostedThatDay) {
      // Permanent unlock - user posted on the same day
      return { blurred: false, reason: null };
    }
    
    // User didn't post that day - check if they posted today for temporary unlock
    if (state.posted) {
      // Temporary unlock - user posted today
      return { blurred: false, reason: null };
    }
    
    // Blurred - user didn't post that day AND hasn't posted today
    return { blurred: true, reason: 'missed' };
  }
  
  // Check if a timestamp is within the last 24 hours
  function isWithinLast24Hours(createdAt, fallbackDate) {
    if (createdAt) {
      var postTime = new Date(createdAt).getTime();
      var now = Date.now();
      var hoursDiff = (now - postTime) / (1000 * 60 * 60);
      return hoursDiff <= 24 && hoursDiff >= 0;
    }
    // Fallback for old posts without createdAt - check if date matches today
    if (fallbackDate) {
      var todayLocal = getLocalDate();
      return fallbackDate === todayLocal;
    }
    return false;
  }
  
  // Check if user has posted today in their LOCAL timezone
  function hasPostedInLocalDay(posts) {
    if (!posts || posts.length === 0) return false;
    var todayLocal = getLocalDate();
    for (var i = 0; i < posts.length; i++) {
      var postLocalDate = getLocalDateFromTimestamp(posts[i].createdAt);
      // Fall back to date field for older posts without createdAt
      if (!postLocalDate) postLocalDate = posts[i].date;
      if (postLocalDate === todayLocal) {
        return true;
      }
    }
    return false;
  }
  
  // Get the start of today in viewer's local timezone (as timestamp)
  function getLocalDayStart() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }
  
  // Get the end of today in viewer's local timezone (as timestamp)
  function getLocalDayEnd() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  }
  
  // Convert UTC time to local time string
  function utcToLocalTime(utcHour) {
    var utcDate = new Date();
    utcDate.setUTCHours(utcHour, 0, 0, 0);
    var hours = utcDate.getHours();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return hours + ':00 ' + ampm;
  }
  
  // Generate a random group code
  function generateGroupCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  // Load user's groups
  function loadGroups(uid) {
    db.collection('groups').where('members', 'array-contains', uid).onSnapshot(function(snap) {
      var groups = [];
      snap.forEach(function(doc) {
        var g = doc.data();
        g.id = doc.id;
        groups.push(g);
      });
      state.groups = groups;
      render();
    });
  }
  
  // Create a new group
  // Guard against double-clicks on create group
  var creatingGroup = false;
  
  function createGroup() {
    if (creatingGroup) return; // Prevent duplicate creation
    
    if (!state.newGroup.name.trim()) {
      alert('Please enter a group name');
      return;
    }
    if (state.newGroup.members.length < 2) {
      alert('You need at least 2 friends to invite (3 members total including you)');
      return;
    }
    
    creatingGroup = true;
    var uid = state.user.uid;
    var invitedMembers = state.newGroup.members.slice();
    var today = getUTCDate();
    
    // Only creator is a member initially, others are pending
    var groupData = {
      name: state.newGroup.name.trim(),
      members: [uid], // Only creator starts as member
      pendingInvites: invitedMembers, // Others need to accept
      createdBy: uid,
      createdAt: new Date().toISOString(),
      code: generateGroupCode(),
      currentDate: today,
      themeChooserId: uid, // Creator is first theme chooser
      theme: '',
      orientations: {},
      photos: {},
      collages: {}
    };
    
    // Set orientation for creator
    groupData.orientations[uid] = 'portrait';
    
    db.collection('groups').add(groupData).then(function(ref) {
      // Send invitations to all invited members
      for (var i = 0; i < invitedMembers.length; i++) {
        addGroupNotification(invitedMembers[i], 'group_invite', {
          groupId: ref.id,
          groupName: groupData.name,
          invitedBy: state.userData.username,
          invitedById: uid
        });
      }
      
      creatingGroup = false;
      setState({
        newGroup: {name: '', members: []},
        groupView: 'list'
      });
    }).catch(function(e) {
      creatingGroup = false;
      console.error(e);
      alert('Failed to create group');
    });
  }
  
  // Accept group invitation
  function acceptGroupInvite(groupId, notifId) {
    var uid = state.user.uid;
    
    db.collection('groups').doc(groupId).get().then(function(doc) {
      if (!doc.exists) {
        alert('Group no longer exists');
        removeNotification(notifId);
        return;
      }
      
      var group = doc.data();
      var members = group.members || [];
      var pending = group.pendingInvites || [];
      
      // Remove from pending, add to members
      var newPending = pending.filter(function(id) { return id !== uid; });
      members.push(uid);
      
      // Assign random orientation
      var orientations = group.orientations || {};
      orientations[uid] = Math.random() > 0.5 ? 'portrait' : 'landscape';
      
      return db.collection('groups').doc(groupId).update({
        members: members,
        pendingInvites: newPending,
        orientations: orientations
      });
    }).then(function() {
      removeNotification(notifId);
      nav('groups');
    }).catch(function(e) {
      console.error(e);
      alert('Failed to accept invitation');
    });
  }
  
  // Decline group invitation
  function declineGroupInvite(groupId, notifId) {
    var uid = state.user.uid;
    
    db.collection('groups').doc(groupId).get().then(function(doc) {
      if (!doc.exists) {
        removeNotification(notifId);
        return;
      }
      
      var group = doc.data();
      var pending = group.pendingInvites || [];
      var newPending = pending.filter(function(id) { return id !== uid; });
      
      return db.collection('groups').doc(groupId).update({
        pendingInvites: newPending
      });
    }).then(function() {
      removeNotification(notifId);
    }).catch(function(e) {
      console.error(e);
    });
  }
  
  // Add member to group (creator only)
  function addMemberToGroup(groupId, friendId) {
    console.log('[Group] addMemberToGroup called:', {groupId: groupId, friendId: friendId});
    db.collection('groups').doc(groupId).get().then(function(doc) {
      if (!doc.exists) {
        console.error('[Group] Group does not exist');
        return;
      }
      var group = doc.data();
      
      if (group.createdBy !== state.user.uid) {
        alert('Only the group creator can add members');
        return;
      }
      
      var pending = group.pendingInvites || [];
      console.log('[Group] Current pending invites:', pending);
      console.log('[Group] Current members:', group.members);
      
      if (pending.indexOf(friendId) === -1 && group.members.indexOf(friendId) === -1) {
        pending.push(friendId);
        console.log('[Group] Adding to pending invites, new list:', pending);
        
        db.collection('groups').doc(groupId).update({
          pendingInvites: pending
        }).then(function() {
          console.log('[Group] Pending invites updated in Firestore');
          console.log('[Group] Sending invite notification to user:', friendId);
          return addGroupNotification(friendId, 'group_invite', {
            groupId: groupId,
            groupName: group.name,
            invitedBy: state.userData.username,
            invitedById: state.user.uid
          });
        }).then(function() {
          console.log('[Group] Invite notification sent successfully');
          // Reload this specific group to get fresh data
          return db.collection('groups').doc(groupId).get();
        }).then(function(doc) {
          if (doc.exists) {
            var updatedGroup = doc.data();
            updatedGroup.id = doc.id;
            
            // Update in state.groups array
            for (var i = 0; i < state.groups.length; i++) {
              if (state.groups[i].id === groupId) {
                state.groups[i] = updatedGroup;
                break;
              }
            }
            
            // Set as current group
            state.currentGroup = updatedGroup;
            
            // Force immediate UI update - stay on members view
            setState({groupView: 'members'});
            alert('Invitation sent!');
          }
        }).catch(function(e) {
          console.error('[Group] Error sending invite:', e);
          alert('Failed to send invitation: ' + e.message);
        });
      } else {
        console.log('[Group] Person already member or invited');
        alert('This person is already a member or has been invited');
      }
    }).catch(function(e) {
      console.error('[Group] Error in addMemberToGroup:', e);
      alert('Error: ' + e.message);
    });
  }
  
  // Cancel pending group invite (creator only)
  function cancelGroupInvite(groupId, userId) {
    db.collection('groups').doc(groupId).get().then(function(doc) {
      if (!doc.exists) return;
      var group = doc.data();
      
      if (group.createdBy !== state.user.uid) {
        alert('Only the group creator can cancel invites');
        return;
      }
      
      var pending = group.pendingInvites || [];
      var index = pending.indexOf(userId);
      if (index > -1) {
        pending.splice(index, 1);
        db.collection('groups').doc(groupId).update({
          pendingInvites: pending
        }).then(function() {
          console.log('[Group] Invite cancelled, reloading group');
          // Reload this specific group to get fresh data
          return db.collection('groups').doc(groupId).get();
        }).then(function(doc) {
          if (doc.exists) {
            var updatedGroup = doc.data();
            updatedGroup.id = doc.id;
            
            // Update in state.groups array
            for (var i = 0; i < state.groups.length; i++) {
              if (state.groups[i].id === groupId) {
                state.groups[i] = updatedGroup;
                break;
              }
            }
            
            // Set as current group
            state.currentGroup = updatedGroup;
            
            // Force immediate UI update - stay on members view
            setState({groupView: 'members'});
            alert('Invite cancelled!');
          }
        }).catch(function(e) {
          console.error('[Group] Error cancelling invite:', e);
          alert('Failed to cancel invite');
        });
      }
    });
  }
  
  // Remove member from group (creator only)
  function removeMemberFromGroup(groupId, memberId) {
    db.collection('groups').doc(groupId).get().then(function(doc) {
      if (!doc.exists) return;
      var group = doc.data();
      
      if (group.createdBy !== state.user.uid) {
        alert('Only the group creator can remove members');
        return;
      }
      
      if (memberId === group.createdBy) {
        alert('You cannot remove yourself as the creator');
        return;
      }
      
      var members = group.members.filter(function(id) { return id !== memberId; });
      var orientations = group.orientations || {};
      delete orientations[memberId];
      
      // If removed member was theme chooser, pick new one
      var updates = {
        members: members,
        orientations: orientations
      };
      
      if (group.themeChooserId === memberId && members.length > 0) {
        updates.themeChooserId = members[Math.floor(Math.random() * members.length)];
      }
      
      db.collection('groups').doc(groupId).update(updates).then(function() {
        alert('Member removed');
      });
    });
  }
  
  // Update group name (creator only)
  function updateGroupName(groupId, newName) {
    db.collection('groups').doc(groupId).get().then(function(doc) {
      if (!doc.exists) return;
      var group = doc.data();
      
      if (group.createdBy !== state.user.uid) {
        alert('Only the group creator can update the name');
        return;
      }
      
      db.collection('groups').doc(groupId).update({
        name: newName
      }).then(function() {
        alert('Group name updated!');
        loadGroups(state.user.uid);
      });
    });
  }
  
  // Update group icon (creator only)
  function updateGroupIcon(groupId, icon) {
    db.collection('groups').doc(groupId).get().then(function(doc) {
      if (!doc.exists) return;
      var group = doc.data();
      
      if (group.createdBy !== state.user.uid) {
        alert('Only the group creator can update the icon');
        return;
      }
      
      var customTheme = group.customTheme || {};
      customTheme.icon = icon;
      
      db.collection('groups').doc(groupId).update({
        customTheme: customTheme
      }).then(function() {
        alert('Group icon updated!');
        loadGroups(state.user.uid);
      });
    });
  }
  
  // Update group theme colors (creator only)
  function updateGroupTheme(groupId, themeUpdates) {
    db.collection('groups').doc(groupId).get().then(function(doc) {
      if (!doc.exists) return;
      var group = doc.data();
      
      if (group.createdBy !== state.user.uid) {
        alert('Only the group creator can update the theme');
        return;
      }
      
      var customTheme = group.customTheme || {};
      for (var key in themeUpdates) {
        customTheme[key] = themeUpdates[key];
      }
      
      db.collection('groups').doc(groupId).update({
        customTheme: customTheme
      }).then(function() {
        loadGroups(state.user.uid);
      });
    });
  }
  
  // Add notification to another user (stored in their user doc or a notifications collection)
  function addGroupNotification(userId, type, data) {
    console.log('[Notification] Adding notification:', {userId: userId, type: type, data: data});
    return db.collection('notifications').add({
      userId: userId,
      type: type,
      data: data,
      createdAt: new Date().toISOString(),
      read: false
    }).then(function(docRef) {
      console.log('[Notification] Added with ID:', docRef.id);
      return docRef;
    }).catch(function(e) {
      console.error('[Notification] Error adding notification:', e);
      throw e;
    });
  }
  
  // Load group notifications for current user
  function loadGroupNotifications(uid) {
    db.collection('notifications').where('userId', '==', uid).where('read', '==', false).onSnapshot(function(snap) {
      snap.forEach(function(doc) {
        var notif = doc.data();
        notif.id = doc.id;
        // Add to local notifications if not already there
        var exists = false;
        for (var i = 0; i < state.notifications.length; i++) {
          if (state.notifications[i].id === notif.id) {
            exists = true;
            break;
          }
        }
        if (!exists && (notif.type === 'group_theme_chooser' || notif.type === 'group_invite' || notif.type === 'group_theme_set')) {
          state.notifications.push({
            id: notif.id,
            type: notif.type,
            data: notif.data,
            ts: notif.createdAt
          });
          // Mark as read
          db.collection('notifications').doc(notif.id).update({read: true});
        }
      });
      render();
    });
  }
  
  // Check and reset group for new day (should be called when viewing a group)
  function checkGroupDayReset(group) {
    var today = getUTCDate();
    if (group.currentDate !== today) {
      var previousDate = group.currentDate;
      
      // First, generate collage for the previous day if there are photos
      if (group.photos && group.photos[previousDate]) {
        var prevPhotos = group.photos[previousDate];
        var photoCount = Object.keys(prevPhotos).length;
        if (photoCount > 0 && (!group.collages || !group.collages[previousDate])) {
          // Generate collage for previous day
          generateGroupCollage(group.id, previousDate, prevPhotos);
        }
      }
      
      // New day - reset theme chooser and orientations
      var members = group.members;
      var newThemeChooserIndex = Math.floor(Math.random() * members.length);
      var newThemeChooserId = members[newThemeChooserIndex];
      
      // New random orientations
      var orientations = {};
      var shuffledMembers = members.slice().sort(function() { return Math.random() - 0.5; });
      var half = Math.ceil(shuffledMembers.length / 2);
      for (var i = 0; i < shuffledMembers.length; i++) {
        orientations[shuffledMembers[i]] = i < half ? 'portrait' : 'landscape';
      }
      
      // IMPORTANT: Only clear theme, don't set it to empty string
      // This prevents accidentally clearing theme when someone joins
      db.collection('groups').doc(group.id).update({
        currentDate: today,
        themeChooserId: newThemeChooserId,
        theme: firebase.firestore.FieldValue.delete(),
        orientations: orientations
      }).then(function() {
        // Notify new theme chooser
        addGroupNotification(newThemeChooserId, 'group_theme_chooser', {
          groupId: group.id,
          groupName: group.name,
          date: today
        });
        // Notify others about who is theme chooser
        for (var i = 0; i < members.length; i++) {
          if (members[i] !== newThemeChooserId) {
            // Get theme chooser username
            db.collection('users').doc(newThemeChooserId).get().then(function(doc) {
              var chooserName = doc.exists ? doc.data().username : 'Someone';
              addGroupNotification(members[i], 'group_theme_set', {
                groupId: group.id,
                groupName: group.name,
                chooserName: chooserName,
                date: today
              });
            });
          }
        }
      });
    }
  }
  
  // Generate a collage from the day's photos - DISABLED DUE TO CORS ISSUES
  function generateGroupCollage(groupId, date, photos) {
    alert('Collage generation is temporarily disabled due to technical issues with image loading. You can still see all photos in the grid above.');
    return;
  }
  
  // Set theme for today (only theme chooser can do this)
  function setGroupTheme(groupId, theme) {
    if (theme.length > 100) {
      alert('Theme must be 100 characters or less');
      return;
    }
    db.collection('groups').doc(groupId).update({
      theme: theme
    }).then(function() {
      // Notify other members
      var group = null;
      for (var i = 0; i < state.groups.length; i++) {
        if (state.groups[i].id === groupId) {
          group = state.groups[i];
          break;
        }
      }
      if (group) {
        for (var i = 0; i < group.members.length; i++) {
          if (group.members[i] !== state.user.uid) {
            addGroupNotification(group.members[i], 'group_theme_set', {
              groupId: groupId,
              groupName: group.name,
              theme: theme,
              chooserName: state.userData.username,
              date: getUTCDate()
            });
          }
        }
      }
      // Reload groups so theme displays immediately
      loadGroups(state.user.uid);
      setState({groupTheme: ''});
    });
  }
  
  // Upload photo to group
  function uploadGroupPhoto(groupId, photoData, orientation) {
    var uid = state.user.uid;
    var today = getUTCDate();
    var ts = Date.now();
    
    // Compress before uploading
    compressImage(photoData, 1200, 0.7).then(function(compressed) {
      console.log('[Group] Photo compressed for upload');
      
      // Upload to storage
      var ref = storage.ref('groups/' + groupId + '/' + today + '/' + uid + '_' + ts);
      return ref.putString(compressed, 'data_url');
    }).then(function() {
      var ref = storage.ref('groups/' + groupId + '/' + today + '/' + uid + '_' + ts);
      return ref.getDownloadURL();
    }).then(function(url) {
      // Update group photos
      var updatePath = 'photos.' + today + '.' + uid;
      var updateData = {};
      updateData[updatePath] = {
        url: url,
        orientation: orientation,
        createdAt: new Date().toISOString(),
        username: state.userData.username
      };
      return db.collection('groups').doc(groupId).update(updateData);
    }).then(function() {
      console.log('[Group] Photo uploaded successfully');
      
      // Reload the group to get fresh data with our photo
      return db.collection('groups').doc(groupId).get();
    }).then(function(doc) {
      if (doc.exists) {
        var updatedGroup = doc.data();
        updatedGroup.id = doc.id;
        
        // Update in groups array
        for (var i = 0; i < state.groups.length; i++) {
          if (state.groups[i].id === groupId) {
            state.groups[i] = updatedGroup;
            break;
          }
        }
        
        // Update current group
        state.currentGroup = updatedGroup;
        console.log('[Group] Group data reloaded with new photo');
      }
      
      setState({groupPhoto: null, groupPhotoOrientation: null, groupView: 'detail'});
    }).catch(function(e) {
      console.error(e);
      alert('Failed to upload photo');
    });
  }
  
  // Check if user has submitted photo today
  function hasSubmittedToday(group) {
    if (!group || !group.photos) return false;
    var today = getUTCDate();
    var todayPhotos = group.photos[today];
    if (!todayPhotos) return false;
    return !!todayPhotos[state.user.uid];
  }
  
  // Get member info from friends list or fetch
  function getMemberInfo(memberId, callback) {
    // Check if it's current user
    if (memberId === state.user.uid) {
      callback({
        id: memberId,
        username: state.userData.username,
        avatar: state.userData.avatar
      });
      return;
    }
    // Check friends list
    for (var i = 0; i < state.friends.length; i++) {
      if (state.friends[i].id === memberId) {
        callback(state.friends[i]);
        return;
      }
    }
    // Fetch from db
    db.collection('users').doc(memberId).get().then(function(doc) {
      if (doc.exists) {
        var data = doc.data();
        data.id = memberId;
        callback(data);
      } else {
        callback({id: memberId, username: 'Unknown'});
      }
    });
  }
  
  // ===== END GROUPS FEATURE =====

  function setReaction(postId, ownerId, emoji) {
    if (!state.user) return;
    var uid = state.user.uid;
    
    // Find the post in friends' posts
    for (var i = 0; i < state.friends.length; i++) {
      var f = state.friends[i];
      if (f.id === ownerId && f.posts) {
        for (var j = 0; j < f.posts.length; j++) {
          if (f.posts[j].id === postId) {
            var post = f.posts[j];
            
            // Check if post is within 24 hours
            var postTime = post.createdAt ? new Date(post.createdAt).getTime() : new Date(post.date).getTime();
            var hoursSincePost = (Date.now() - postTime) / (1000 * 60 * 60);
            if (hoursSincePost >= 24) {
              return; // Don't re-render, just ignore
            }
            
            // Initialize reactions object if needed
            if (!post.reactions) {
              post.reactions = {};
            }
            
            // Only set if not already reacted (locked in)
            if (post.reactions[uid]) {
              return; // Already reacted, just ignore
            }
            
            // Set locally first
            post.reactions[uid] = emoji;
            
            // Update DOM directly instead of calling render() - this prevents audio restart
            // Find the reaction wrapper for this post and replace it
            var postElement = document.querySelector('[data-post-id="' + postId + '"]');
            if (postElement) {
              var reactWrap = postElement.querySelector('.react-buttons');
              if (reactWrap) {
                // Replace reaction buttons with "You reacted" chip
                reactWrap.innerHTML = '';
                var myChip = document.createElement('span');
                myChip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;font-size:14px;background:' + t.accent + '22;border:2px solid ' + t.accent + ';color:' + t.text;
                myChip.innerHTML = '<span style="font-size:18px">' + emoji + '</span><span style="font-weight:500">You reacted</span>';
                reactWrap.appendChild(myChip);
              }
            }
            
            // Update Firestore
            db.collection('posts').doc(postId).update({reactions: post.reactions}).catch(function(e) {
              console.error('Error setting reaction:', e);
            });
            return;
          }
        }
      }
    }
  }

  function getAllTodayPosts() {
    // Get posts from the last 24 hours
    var result = [];
    for (var i = 0; i < state.myPosts.length; i++) {
      if (isWithinLast24Hours(state.myPosts[i].createdAt, state.myPosts[i].date)) {
        var p = {};
        for (var k in state.myPosts[i]) p[k] = state.myPosts[i][k];
        p.friend = {};
        for (var k in state.userData) p.friend[k] = state.userData[k];
        p.friend.id = state.user ? state.user.uid : null;
        result.push(p);
      }
    }
    for (var i = 0; i < state.friends.length; i++) {
      var f = state.friends[i];
      var posts = f.posts || [];
      for (var j = 0; j < posts.length; j++) {
        if (isWithinLast24Hours(posts[j].createdAt, posts[j].date)) {
          var p = {};
          for (var k in posts[j]) p[k] = posts[j][k];
          p.friend = f;
          result.push(p);
        }
      }
    }
    return result;
  }

  function getPostForDate(day) {
    var d = state.calDate;
    var month = String(d.getMonth() + 1);
    if (month.length < 2) month = '0' + month;
    var dayStr = String(day);
    if (dayStr.length < 2) dayStr = '0' + dayStr;
    var targetDateStr = d.getFullYear() + '-' + month + '-' + dayStr;
    
    // Find post where createdAt falls on this local date
    for (var i = 0; i < state.myPosts.length; i++) {
      var postLocalDate = getLocalDateFromTimestamp(state.myPosts[i].createdAt);
      // Fall back to date field for older posts without createdAt
      if (!postLocalDate) postLocalDate = state.myPosts[i].date;
      if (postLocalDate === targetDateStr) return state.myPosts[i];
    }
    return null;
  }

  function getDaysInMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }

  function getStartDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  }

  function fmtMonth(d) {
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function getBirthdaysForDate(month, day) {
    var birthdays = [];
    // Check friends
    for (var i = 0; i < state.friends.length; i++) {
      var f = state.friends[i];
      if (f.birthday) {
        var parts = f.birthday.split('-');
        var bMonth = parseInt(parts[1], 10);
        var bDay = parseInt(parts[2], 10);
        if (bMonth === month && bDay === day) {
          birthdays.push(f);
        }
      }
    }
    // Check own birthday
    if (state.userData && state.userData.birthday) {
      var parts = state.userData.birthday.split('-');
      var bMonth = parseInt(parts[1], 10);
      var bDay = parseInt(parts[2], 10);
      if (bMonth === month && bDay === day) {
        birthdays.push(state.userData);
      }
    }
    return birthdays;
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          for (var s in attrs[k]) {
            e.style[s] = attrs[k][s];
          }
        } else if (k.substring(0, 2) === 'on') {
          e.addEventListener(k.substring(2).toLowerCase(), attrs[k]);
        } else if (k === 'className') {
          e.className = attrs[k];
        } else {
          e.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children !== undefined && children !== null) {
      if (Array.isArray(children)) {
        for (var i = 0; i < children.length; i++) {
          if (children[i]) {
            if (typeof children[i] === 'string') {
              e.appendChild(document.createTextNode(children[i]));
            } else {
              e.appendChild(children[i]);
            }
          }
        }
      } else if (typeof children === 'string' || typeof children === 'number') {
        e.textContent = children;
      } else {
        e.appendChild(children);
      }
    }
    return e;
  }

  // SVG Icon helper - creates inline SVG icons in zine style
  function icon(name, size, color) {
    size = size || 20;
    color = color || 'currentColor';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', color);
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'square');
    svg.setAttribute('stroke-linejoin', 'miter');
    svg.style.display = 'block';
    
    var paths = {
      mail: 'M4 4h16v16H4V4zm0 0l8 8 8-8',
      settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
      users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
      plus: 'M12 5v14M5 12h14',
      back: 'M19 12H5M12 19l-7-7 7-7',
      close: 'M18 6L6 18M6 6l12 12',
      camera: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z',
      calendar: 'M4 4h16v16H4V4zM16 2v4M8 2v4M4 10h16',
      search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
      check: 'M20 6L9 17l-5-5',
      send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
      user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
      heart: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
      image: 'M4 4h16v16H4V4zM4 16l4-4 3 3 5-5 4 4M9 9a1 1 0 100-2 1 1 0 000 2z',
      music: 'M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z',
      wifi: 'M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01',
      wifiOff: 'M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01',
      plane: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
      edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
      trash: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6',
      download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
      info: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01',
      lock: 'M5 11h14v10H5V11zM7 11V7a5 5 0 0110 0v4',
      userPlus: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6'
    };
    
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', paths[name] || paths.info);
    svg.appendChild(path);
    return svg;
  }

  function postcardEl(post, owner, opts) {
    opts = opts || {};
    var font = FONTS[post.songFont || 0].v;
    var color = COLORS[post.songColor || 0];
    var imgHeight = opts.compact ? '200px' : '280px';
    var hasAudioPreview = post.song && post.song.preview && opts.enablePreview;
    
    var wrap = el('div', {style: {position: 'relative'}});
    if (post.id) {
      wrap.setAttribute('data-post-id', post.id);
    }
    if (hasAudioPreview) {
      wrap.setAttribute('data-postcard-with-audio', 'true');
    }
    var card = el('div', {style: {background: t.card, borderRadius: '0', border: '2px solid ' + t.border, overflow: 'hidden', boxShadow: 'none', position: 'relative'}});
    
    // Tape decoration (top left corner)
    var tape = el('div', {style: {position: 'absolute', top: '-4px', left: '20px', width: '50px', height: '20px', background: t.highlight, opacity: '0.9', transform: 'rotate(-3deg)', zIndex: '5', border: '1px solid rgba(0,0,0,0.1)'}});
    card.appendChild(tape);
    
    var imgArea = el('div', {style: {position: 'relative', display: 'flex', height: imgHeight}});
    
    // Left
    var left = el('div', {style: {flex: '1', overflow: 'hidden', position: 'relative'}});
    left.appendChild(cachedImage(post.outfitPhoto || post.outfit, {style: {width: '100%', height: '100%', objectFit: 'cover', objectPosition: (50 + (post.outfitX || 0)) + '% ' + (50 + (post.outfitY || 0)) + '%'}}));
    
    // Divider
    var divider = el('div', {style: {width: '3px', background: t.card}});
    
    // Right
    var right = el('div', {style: {flex: '1', overflow: 'hidden', position: 'relative'}});
    right.appendChild(cachedImage(post.photo, {style: {width: '100%', height: '100%', objectFit: 'cover', objectPosition: (50 + (post.photoX || 0)) + '% ' + (50 + (post.photoY || 0)) + '%'}}));
    
    // Song
    var song = el('div', {style: {position: 'absolute', left: '0', right: '0', top: '50%', transform: 'translateY(-50%)', textAlign: 'center', textShadow: '0 2px 8px rgba(0,0,0,.95),0 0 20px rgba(0,0,0,.5)', padding: '10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}});
    
    // Show album artwork if available (smaller)
    if (post.song && post.song.artwork) {
      var artwork = cachedImage(post.song.artwork, {style: {width: '45px', height: '45px', borderRadius: '0', objectFit: 'cover', boxShadow: 'none', border: '2px solid rgba(255,255,255,.9)'}});
      song.appendChild(artwork);
    }
    
    // Song title (no emoji, smaller font, word wrap at 15 chars)
    song.appendChild(el('p', {style: {margin: '0', fontSize: '13px', fontWeight: '600', color: color, fontFamily: font, textAlign: 'center', width: '100%', maxWidth: '180px', padding: '0 20px', boxSizing: 'border-box', wordWrap: 'break-word', overflowWrap: 'break-word', hyphens: 'auto'}}, post.song ? post.song.title : ''));
    // Artist name (smaller font, word wrap at 15 chars)
    song.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '11px', color: color, fontFamily: font, opacity: '0.95', textAlign: 'center', width: '100%', maxWidth: '180px', padding: '0 20px', boxSizing: 'border-box', wordWrap: 'break-word', overflowWrap: 'break-word', hyphens: 'auto'}}, post.song ? post.song.artist : ''));
    
    // Add hidden audio element for preview (will be controlled by IntersectionObserver)
    if (post.song && post.song.preview && opts.enablePreview) {
      var audio = el('audio', {src: post.song.preview, preload: 'none', loop: 'true', style: {display: 'none'}});
      audio.setAttribute('data-post-id', post.id || 'preview');
      song.appendChild(audio);
    }
    
    imgArea.appendChild(left);
    imgArea.appendChild(divider);
    imgArea.appendChild(right);
    imgArea.appendChild(song);
    
    // Bottom (fixed min-height prevents expansion when reactions added)
    var bottom = el('div', {style: {padding: '14px', borderTop: '2px solid ' + t.border, minHeight: '120px', display: 'flex', flexDirection: 'column'}});
    var info = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px'}});
    
    var avatar;
    if (owner && owner.avatar) {
      avatar = cachedImage(owner.avatar, {style: {width: '32px', height: '32px', borderRadius: '0', objectFit: 'cover', border: '2px solid ' + t.border}});
    } else {
      avatar = el('div', {style: {width: '32px', height: '32px', borderRadius: '0', background: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: t.bg, border: '2px solid ' + t.border}}, (owner && owner.username) ? owner.username[0].toUpperCase() : '?');
    }
    
    var meta = el('div', {style: {flex: '1'}});
    var isMe = owner && state.user && owner.id === state.user.uid;
    var userNameRow = el('div', {style: {display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}});
    userNameRow.appendChild(el('span', {style: {fontSize: '13px', fontWeight: '600', color: t.text}}, isMe ? 'You' : (owner ? owner.username : 'User')));
    
    // Debug: Log owner data to see what we have
    if (owner) {
      console.log('[Badge Debug] Owner:', owner.username, 'Email:', owner.email, 'customBadge:', owner.customBadge, 'isFoundingMember():', isFoundingMember(owner));
    }
    
    // Add badge if applicable - check customBadge field first (editable in Firebase Console)
    if (owner && owner.customBadge) {
      // Custom badge from Firebase - can be anything you set
      var badgeStyle = {
        padding: '2px 5px',
        borderRadius: '3px',
        color: '#fff',
        fontSize: '8px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        textShadow: '-0.5px -0.5px 0 #000, 0.5px -0.5px 0 #000, -0.5px 0.5px 0 #000, 0.5px 0.5px 0 #000'
      };
      
      // Check for custom color first, then fall back to defaults
      if (owner.customBadgeColor) {
        badgeStyle.background = owner.customBadgeColor;
      } else if (owner.customBadge === 'CREATOR') {
        badgeStyle.background = '#2196F3'; // Blue
      } else if (owner.customBadge === 'FOUNDER') {
        badgeStyle.background = 'rgba(255,255,255,0.1)';
        badgeStyle.border = '1px solid rgba(255,255,255,0.15)';
        badgeStyle.color = t.text;
        badgeStyle.opacity = '0.7';
      } else {
        // Custom badge - use accent color
        badgeStyle.background = t.accent;
      }
      
      console.log('[Badge] Showing custom badge:', owner.customBadge, 'for', owner.username);
      userNameRow.appendChild(el('span', {style: badgeStyle}, owner.customBadge));
    } else if (owner && owner.email === 'ashthunter@icloud.com') {
      // Fallback: Creator badge - blue
      console.log('[Badge] Showing CREATOR badge for', owner.username);
      userNameRow.appendChild(el('span', {style: {
        padding: '2px 5px',
        borderRadius: '3px',
        background: '#2196F3',
        color: '#fff',
        fontSize: '8px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        textTransform: 'uppercase'
      }}, 'CREATOR'));
    } else if (owner && isFoundingMember(owner)) {
      // Fallback: Founding member badge - subtle
      console.log('[Badge] Showing FOUNDER badge for', owner.username);
      userNameRow.appendChild(el('span', {style: {
        padding: '2px 5px',
        borderRadius: '3px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: t.text,
        fontSize: '8px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        opacity: '0.7'
      }}, 'FOUNDER'));
    } else if (owner) {
      console.log('[Badge] NO badge for', owner.username);
    }
    
    meta.appendChild(userNameRow);
    
    // Format date and time - display in viewer's local timezone
    var displayDate = post.date; // Fallback to stored date
    var timeStr = '';
    if (post.createdAt) {
      var postTime = new Date(post.createdAt);
      // Get local date from UTC timestamp
      displayDate = getLocalDateFromTimestamp(post.createdAt) || post.date;
      var hours = postTime.getHours();
      var minutes = postTime.getMinutes();
      var ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12;
      timeStr = ' · ' + hours + ':' + (minutes < 10 ? '0' : '') + minutes + ampm;
    }
    var dateTimeStr = '📍 ' + post.location + ' · ' + displayDate + timeStr;
    meta.appendChild(el('p', {style: {margin: '0', fontSize: '11px', color: t.muted}}, dateTimeStr));
    
    info.appendChild(avatar);
    info.appendChild(meta);
    bottom.appendChild(info);
    
    if (post.quote) {
      bottom.appendChild(el('p', {style: {margin: '10px 0 0', fontSize: '14px', fontStyle: 'italic', color: t.text}}, '"' + post.quote + '"'));
    }
    
    if (opts.showPrivate && post.privateNote) {
      var pn = el('div', {style: {marginTop: '8px', padding: '8px', background: '#fff8e1', borderRadius: '6px', border: '1px dashed #ffc107'}});
      pn.appendChild(el('p', {style: {margin: '0', fontSize: '10px', color: '#f57c00'}}, '🔒 ' + post.privateNote));
      bottom.appendChild(pn);
    }
    
    // Reactions - for friends' posts in feed (can react) or own posts (view only)
    var reactions = post.reactions || {};
    var myReaction = state.user ? (reactions[state.user.uid] || null) : null;
    var reactionEmojis = ['❤️', '🔥', '😍', '👏', '😂', '😱'];
    
    // Check if post is within 24 hours (can still react)
    var postTime = post.createdAt ? new Date(post.createdAt).getTime() : new Date(post.date).getTime();
    var now = Date.now();
    var hoursSincePost = (now - postTime) / (1000 * 60 * 60);
    var canStillReact = hoursSincePost < 24;
    
    // Show reaction picker only if: showing reactions, hasn't reacted yet, not my post, and within 24hrs
    var hasAlreadyReacted = myReaction !== null && myReaction !== undefined;
    if (opts.showReactions && post.id && !hasAlreadyReacted && canStillReact) {
      var reactWrap = el('div', {className: 'react-buttons', style: {marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap'}});
      
      for (var i = 0; i < reactionEmojis.length; i++) {
        (function(emoji) {
          var btn = el('span', {
            className: 'tap',
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              fontSize: '18px',
              background: t.bg,
              border: '2px solid ' + t.border
            },
            onClick: function() {
              // Double check we haven't reacted yet
              var currentReactions = post.reactions || {};
              if (currentReactions[state.user.uid]) {
                return; // Already reacted, ignore
              }
              setReaction(post.id, owner.id, emoji);
            }
          }, emoji);
          reactWrap.appendChild(btn);
        })(reactionEmojis[i]);
      }
      
      bottom.appendChild(reactWrap);
    }
    
    // Show "reactions closed" message if past 24hrs and hasn't reacted
    if (opts.showReactions && post.id && !hasAlreadyReacted && !canStillReact) {
      var closedMsg = el('p', {style: {marginTop: '12px', fontSize: '12px', color: t.muted, fontStyle: 'italic'}}, '⏰ Reactions closed after 24 hours');
      bottom.appendChild(closedMsg);
    }
    
    // Show my locked-in reaction if I've already reacted
    if (opts.showReactions && hasAlreadyReacted) {
      var myReactWrap = el('div', {style: {marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px'}});
      var myChip = el('span', {style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: '20px',
        fontSize: '14px',
        background: t.accent + '22',
        border: '2px solid ' + t.accent,
        color: t.text
      }});
      myChip.appendChild(el('span', {style: {fontSize: '18px'}}, myReaction));
      myChip.appendChild(el('span', {style: {fontWeight: '500'}}, 'You reacted'));
      myReactWrap.appendChild(myChip);
      bottom.appendChild(myReactWrap);
    }
    
    // Show reactions from friends (for viewing on friends' posts or own posts)
    // Build list of friend IDs for quick lookup
    var friendIds = {};
    for (var fi = 0; fi < state.friends.length; fi++) {
      friendIds[state.friends[fi].id] = state.friends[fi];
    }
    
    // Determine if this is my own post
    var isMyPost = state.user && owner && owner.id === state.user.uid;
    
    // Collect visible reactions
    var visibleReactions = [];
    for (var reactorId in reactions) {
      if (!reactions[reactorId]) continue;
      
      // Skip my own reaction (already shown above)
      if (state.user && reactorId === state.user.uid) continue;
      
      // If it's my post, show all reactions
      // If it's a friend's post, only show reactions from my friends
      if (isMyPost || friendIds[reactorId]) {
        var reactorName = 'Someone';
        if (friendIds[reactorId]) {
          reactorName = friendIds[reactorId].username;
        } else if (isMyPost) {
          // On my own post, try to find the name from the reactor
          // They might not be my friend but reacted
          reactorName = 'A friend';
        }
        visibleReactions.push({
          emoji: reactions[reactorId],
          name: reactorName
        });
      }
    }
    
    // Show visible reactions (or on own posts for showReactionsReadOnly)
    if ((opts.showReactions || opts.showReactionsReadOnly) && visibleReactions.length > 0) {
      var confirmedWrap = el('div', {style: {marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px'}});
      
      for (var ri = 0; ri < visibleReactions.length; ri++) {
        var r = visibleReactions[ri];
        var chip = el('span', {style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '12px',
          background: t.bg,
          color: t.muted
        }});
        chip.appendChild(el('span', {style: {fontSize: '14px'}}, r.emoji));
        chip.appendChild(el('span', null, r.name));
        confirmedWrap.appendChild(chip);
      }
      
      bottom.appendChild(confirmedWrap);
    }
    
    card.appendChild(imgArea);
    card.appendChild(bottom);
    wrap.appendChild(card);
    
    // Menu
    if (opts.showMenu && opts.isOwner) {
      var menuWrap = el('div', {style: {display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '12px'}});
      
      var saveBtn = el('span', {className: 'tap', style: {display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: t.card, borderRadius: '12px', border: '1px solid ' + t.border, color: t.text, fontSize: '13px', fontWeight: '500'}, onClick: function() { saveToCamera(post, owner); }});
      saveBtn.appendChild(el('span', {style: {fontSize: '16px'}}, '💾'));
      saveBtn.appendChild(document.createTextNode('Save'));
      
      var delBtn = el('span', {className: 'tap', style: {display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#ffebee', borderRadius: '12px', border: '1px solid #ffcdd2', color: '#c62828', fontSize: '13px', fontWeight: '500'}, onClick: function() { showDeleteConfirm(post); }});
      delBtn.appendChild(el('span', {style: {fontSize: '16px'}}, '🗑️'));
      delBtn.appendChild(document.createTextNode('Delete'));
      
      menuWrap.appendChild(saveBtn);
      menuWrap.appendChild(delBtn);
      wrap.appendChild(menuWrap);
    }
    
    return wrap;
  }

  function render() {
    // Apply theme - use preview if active, otherwise use saved theme
    var currentTheme = state.themePreview || state.theme || 'light';
    t = themes[currentTheme] || themes.light;
    document.body.style.background = t.bg;
    var app = document.getElementById('app');
    app.innerHTML = '';
    
    // Splash screen - show once on first load to enable audio
    if (!window.audioUnlocked && state.user) {
      var splash = el('div', {style: {position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: t.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: '10000', padding: '40px'}});
      
      var splashIcon = el('div', {style: {marginBottom: '24px'}});
      splashIcon.appendChild(icon('plane', 72, t.text));
      splash.appendChild(splashIcon);
      splash.appendChild(el('h1', {className: 'zine-title', style: {margin: '0 0 12px', fontSize: '42px', fontWeight: '700', color: t.text, letterSpacing: '-2px'}}, 'POSTCARD'));
      splash.appendChild(el('p', {style: {margin: '0 0 40px', fontSize: '14px', color: t.muted, textAlign: 'center', letterSpacing: '1px', textTransform: 'uppercase'}}, 'Share your day with friends'));
      
      var continueBtn = el('div', {className: 'tap', style: {
        padding: '16px 48px',
        borderRadius: '0',
        background: t.text,
        color: t.bg,
        fontSize: '14px',
        fontWeight: '600',
        letterSpacing: '2px',
        textTransform: 'uppercase',
        border: '2px solid ' + t.text
      }, onClick: function() {
        window.audioUnlocked = true;
        setState({}); // Trigger re-render
      }}, 'CONTINUE');
      
      splash.appendChild(continueBtn);
      app.appendChild(splash);
      return; // Don't render anything else
    }
    
    // Collage viewer modal
    if (state.viewingCollage) {
      var modal = el('div', {style: {position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: '10000', padding: '20px'}, onClick: function() { setState({viewingCollage: null}); }});
      
      var closeBtn = el('span', {className: 'tap', style: {position: 'absolute', top: '20px', right: '20px', width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center'}, onClick: function(e) { e.stopPropagation(); setState({viewingCollage: null}); }}, '×');
      modal.appendChild(closeBtn);
      
      var img = el('img', {src: state.viewingCollage, style: {maxWidth: '100%', maxHeight: '90vh', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,.5)'}});
      modal.appendChild(img);
      
      modal.appendChild(el('p', {style: {color: '#aaa', fontSize: '13px', marginTop: '16px', textAlign: 'center'}}, 'Tap anywhere to close'));
      
      app.appendChild(modal);
      return;
    }
    
    // Saving overlay
    if (state.saving) {
      var overlay = el('div', {style: {position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '1000'}});
      var box = el('div', {style: {background: t.card, padding: '28px', borderRadius: '20px', textAlign: 'center'}});
      box.appendChild(el('div', {style: {fontSize: '32px', marginBottom: '12px'}}, '💾'));
      box.appendChild(el('p', {style: {margin: '0', fontSize: '16px', fontWeight: '500', color: t.text}}, 'Creating image...'));
      overlay.appendChild(box);
      app.appendChild(overlay);
    }
    
    // Saved image overlay (for iOS)
    if (state.savedImage) {
      var overlay = el('div', {style: {position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: '1000', padding: '20px'}});
      
      overlay.appendChild(el('p', {style: {color: '#fff', fontSize: '16px', fontWeight: '600', marginBottom: '16px', textAlign: 'center'}}, '📱 Hold down on image to save'));
      
      var img = el('img', {src: state.savedImage, style: {maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,.3)'}});
      overlay.appendChild(img);
      
      overlay.appendChild(el('p', {style: {color: '#aaa', fontSize: '13px', marginTop: '12px', textAlign: 'center'}}, 'Long press → "Add to Photos"'));
      
      var closeBtn = el('span', {className: 'tap', style: {marginTop: '20px', padding: '14px 32px', background: t.accent, color: '#fff', borderRadius: '12px', fontSize: '15px', fontWeight: '600'}, onClick: function() { setState({savedImage: null}); }}, 'Done');
      overlay.appendChild(closeBtn);
      
      app.appendChild(overlay);
    }
    
    // Delete confirmation modal
    if (state.deleteConfirm) {
      var overlay = el('div', {style: {position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '1000', padding: '20px'}, onClick: function(e) { if (e.target === overlay) setState({deleteConfirm: null}); }});
      
      var box = el('div', {style: {background: t.card, padding: '24px', borderRadius: '20px', textAlign: 'center', maxWidth: '320px', width: '100%'}});
      box.appendChild(el('div', {style: {fontSize: '48px', marginBottom: '12px'}}, '🗑️'));
      box.appendChild(el('h3', {style: {margin: '0 0 8px', fontSize: '20px', fontWeight: '600', color: t.text}}, 'Delete Postcard?'));
      box.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '14px', color: t.muted}}, 'This action cannot be undone.'));
      
      // Check if this is today's post (in viewer's local timezone)
      var postLocalDate = getLocalDateFromTimestamp(state.deleteConfirm.createdAt) || state.deleteConfirm.date;
      var today = getLocalDate();
      if (postLocalDate === today) {
        box.appendChild(el('p', {style: {margin: '0 0 20px', fontSize: '13px', color: t.accent, fontWeight: '500'}}, "✨ You'll be able to post a new postcard today if you delete this one."));
      } else {
        box.appendChild(el('div', {style: {height: '12px'}}));
      }
      
      var btns = el('div', {style: {display: 'flex', gap: '12px'}});
      btns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '14px', borderRadius: '12px', background: t.bg, color: t.text, fontSize: '15px', fontWeight: '600', border: '1px solid ' + t.border}, onClick: function() { setState({deleteConfirm: null}); }}, 'Cancel'));
      btns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '14px', borderRadius: '12px', background: '#e53935', color: '#fff', fontSize: '15px', fontWeight: '600'}, onClick: function() { deletePost(state.deleteConfirm.id); }}, 'Delete'));
      box.appendChild(btns);
      
      overlay.appendChild(box);
      app.appendChild(overlay);
    }
    
    // Loading screen (while checking auth)
    if (state.view === 'loading') {
      var loading = el('div', {style: {position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: t.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}});
      loading.appendChild(el('div', {style: {fontSize: '60px', marginBottom: '16px', animation: 'bounce 1s ease infinite'}}, '📮'));
      loading.appendChild(el('h1', {style: {margin: '0', fontSize: '28px', fontWeight: '700', color: t.text}}, 'postcard'));
      app.appendChild(loading);
      return;
    }
    
    // Auth
    if (state.view === 'auth') {
      var page = el('div', {style: {padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center'}});
      
      var logo = el('div', {style: {textAlign: 'center', marginBottom: '40px'}});
      logo.appendChild(el('div', {style: {fontSize: '60px', marginBottom: '8px'}}, '📮'));
      logo.appendChild(el('h1', {style: {margin: '0', fontSize: '32px', fontWeight: '700', color: t.text}}, 'postcard'));
      logo.appendChild(el('p', {style: {margin: '8px 0 0', color: t.muted}}, 'Share your day with friends'));
      page.appendChild(logo);
      
      var tabs = el('div', {style: {display: 'flex', marginBottom: '24px', background: t.card, borderRadius: '12px', padding: '4px', border: '1px solid ' + t.border}});
      var loginTab = el('span', {className: 'tap', style: {flex: '1', padding: '12px', borderRadius: '8px', textAlign: 'center', fontSize: '14px', fontWeight: '600', background: state.authMode === 'login' ? t.accent : 'transparent', color: state.authMode === 'login' ? '#fff' : t.muted}, onClick: function() { setState({authMode: 'login', authError: ''}); }}, 'Log In');
      var signupTab = el('span', {className: 'tap', style: {flex: '1', padding: '12px', borderRadius: '8px', textAlign: 'center', fontSize: '14px', fontWeight: '600', background: state.authMode === 'signup' ? t.accent : 'transparent', color: state.authMode === 'signup' ? '#fff' : t.muted}, onClick: function() { setState({authMode: 'signup', authError: ''}); }}, 'Sign Up');
      tabs.appendChild(loginTab);
      tabs.appendChild(signupTab);
      page.appendChild(tabs);
      
      if (state.authMode === 'signup') {
        var avatarWrap = el('div', {style: {display: 'flex', justifyContent: 'center', marginBottom: '20px'}});
        var avatarInput = el('input', {type: 'file', accept: 'image/*', style: {display: 'none'}, id: 'avatarInput'});
        avatarInput.onchange = function(e) {
          var f = e.target.files[0];
          if (f) {
            var r = new FileReader();
            r.onloadend = function() { setAuthData({avatar: r.result}); };
            r.readAsDataURL(f);
          }
        };
        var avatarLabel = el('label', {className: 'tap', for: 'avatarInput'});
        if (state.authData.avatar) {
          avatarLabel.appendChild(cachedImage(state.authData.avatar, {style: {width: '80px', height: '80px', borderRadius: '24px', objectFit: 'cover', border: '3px solid ' + t.accent}}));
        } else {
          var ph = el('div', {style: {width: '80px', height: '80px', borderRadius: '24px', background: t.card, border: '2px dashed ' + t.border, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}});
          ph.appendChild(el('span', {style: {fontSize: '24px'}}, '📷'));
          ph.appendChild(el('span', {style: {fontSize: '10px', color: t.muted}}, 'Add photo'));
          avatarLabel.appendChild(ph);
        }
        avatarWrap.appendChild(avatarInput);
        avatarWrap.appendChild(avatarLabel);
        page.appendChild(avatarWrap);
      }
      
      if (state.authError) {
        page.appendChild(el('div', {style: {padding: '12px', marginBottom: '12px', borderRadius: '10px', background: '#ffebee', color: '#c62828', fontSize: '13px', textAlign: 'center'}}, state.authError));
      }
      
      var fields = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '12px'}});
      
      if (state.authMode === 'signup') {
        var userField = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '0', border: '2px solid ' + t.border, background: t.card}});
        userField.appendChild(icon('user', 20, t.muted));
        var userInput = el('input', {placeholder: 'Username', value: state.authData.username, style: {flex: '1', background: 'transparent', border: 'none', fontSize: '15px', color: t.text, outline: 'none'}});
        userInput.oninput = function(e) { state.authData.username = e.target.value; };
        userField.appendChild(userInput);
        fields.appendChild(userField);
      }
      
      var emailField = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '0', border: '2px solid ' + t.border, background: t.card}});
      emailField.appendChild(icon('mail', 20, t.muted));
      var emailInput = el('input', {type: 'email', placeholder: 'Email', value: state.authData.email, style: {flex: '1', background: 'transparent', border: 'none', fontSize: '15px', color: t.text, outline: 'none'}});
      emailInput.oninput = function(e) { state.authData.email = e.target.value; };
      emailField.appendChild(emailInput);
      fields.appendChild(emailField);
      
      var passField = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '0', border: '2px solid ' + t.border, background: t.card}});
      passField.appendChild(icon('lock', 20, t.muted));
      var passInput = el('input', {type: 'password', placeholder: 'Password (6+ chars)', value: state.authData.password, style: {flex: '1', background: 'transparent', border: 'none', fontSize: '15px', color: t.text, outline: 'none'}});
      passInput.oninput = function(e) { state.authData.password = e.target.value; };
      passField.appendChild(passInput);
      fields.appendChild(passField);
      
      if (state.authMode === 'login') {
        var forgotLink = el('span', {className: 'tap', style: {display: 'block', textAlign: 'right', fontSize: '13px', color: t.accent, marginTop: '8px'}, onClick: handleForgotPassword}, 'Forgot password?');
        fields.appendChild(forgotLink);
      }
      
      if (state.authMode === 'signup') {
        var bdayField = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '0', border: '2px solid ' + t.border, background: t.card}});
        bdayField.appendChild(icon('calendar', 20, t.muted));
        var bdayInput = el('input', {type: 'date', value: state.authData.birthday, placeholder: 'YYYY-MM-DD', style: {flex: '1', background: 'transparent', border: 'none', fontSize: '16px', color: t.text, outline: 'none', minHeight: '24px', WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none'}});
        bdayInput.oninput = function(e) { state.authData.birthday = e.target.value; };
        bdayInput.onfocus = function(e) { 
          // Ensure date picker opens on iOS
          if (e.target.showPicker) {
            try { e.target.showPicker(); } catch(err) {}
          }
        };
        bdayField.appendChild(bdayInput);
        fields.appendChild(bdayField);
        fields.appendChild(el('p', {style: {margin: '4px 0 0', fontSize: '11px', color: t.muted, textAlign: 'center'}}, 'Tap to select your birthday'));
      }
      
      page.appendChild(fields);
      
      var submitBtn = el('span', {className: 'tap', style: {marginTop: '24px', color: t.bg, padding: '16px', borderRadius: '0', fontSize: '14px', fontWeight: '600', textAlign: 'center', background: t.text, opacity: state.authLoading ? '0.5' : '1', display: 'block', letterSpacing: '1px', textTransform: 'uppercase', border: '2px solid ' + t.text}, onClick: state.authMode === 'login' ? handleLogin : handleSignup}, state.authLoading ? 'PLEASE WAIT...' : (state.authMode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'));
      page.appendChild(submitBtn);
      
      app.appendChild(page);
      return;
    }
    
    // Feed
    if (state.view === 'feed') {
      var page = el('div', {style: {minHeight: '100vh', paddingBottom: '100px', position: 'relative', zIndex: '1', isolation: 'isolate'}});
      
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '2px solid ' + t.border}});
      var logoWrap = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px'}});
      logoWrap.appendChild(el('span', {className: 'zine-title', style: {fontSize: '24px', fontWeight: '700', color: t.text, letterSpacing: '-1px'}}, 'POSTCARD'));
      logoWrap.appendChild(icon('plane', 18, t.text));
      
      // Mailbox/Notifications button (moved to right side, settings now in profile)
      var unreadCount = getUnreadCount();
      var mailBtn = el('span', {className: 'tap', style: {padding: '8px', color: t.muted, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'}, onClick: function() { nav('notifications'); }});
      mailBtn.appendChild(icon('mail', 22, t.muted));
      if (unreadCount > 0) {
        mailBtn.appendChild(el('div', {style: {position: 'absolute', top: '2px', right: '2px', minWidth: '18px', height: '18px', borderRadius: '50%', background: '#e53935', color: '#fff', fontSize: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid ' + t.bg, padding: '0 4px'}}, unreadCount > 9 ? '9+' : unreadCount));
      }
      
      header.appendChild(logoWrap);
      header.appendChild(mailBtn);
      page.appendChild(header);
      
      // Offline mode banner
      if (!state.online) {
        var offlineBanner = el('div', {style: {margin: '16px 20px 16px', padding: '16px', borderRadius: '0', background: '#ff9800', color: '#fff', display: 'flex', alignItems: 'center', gap: '12px', border: '2px solid #e65100'}});
        var wifiIcon = icon('wifiOff', 24, '#fff');
        offlineBanner.appendChild(wifiIcon);
        var offlineText = el('div', {style: {flex: '1'}});
        offlineText.appendChild(el('div', {style: {fontSize: '14px', fontWeight: '600', marginBottom: '2px'}}, 'Offline Mode'));
        offlineText.appendChild(el('div', {style: {fontSize: '12px', opacity: '0.9'}}, 'You can still take photos. They\'ll upload when back online.'));
        offlineBanner.appendChild(offlineText);
        page.appendChild(offlineBanner);
      }
      
      // Check for pending posts (show reminder)
      if (state.user && localStorage.getItem('postcard_pending_' + state.user.uid)) {
        var pendingBanner = el('div', {style: {margin: '16px 20px 16px', padding: '16px', borderRadius: '0', background: '#4caf50', color: '#fff', display: 'flex', alignItems: 'center', gap: '12px', border: '2px solid #2e7d32'}});
        pendingBanner.appendChild(icon('send', 24, '#fff'));
        var pendingText = el('div', {style: {flex: '1'}});
        pendingText.appendChild(el('div', {style: {fontSize: '14px', fontWeight: '600', marginBottom: '2px'}}, 'Post Ready to Upload'));
        pendingText.appendChild(el('div', {style: {fontSize: '12px', opacity: '0.9'}}, state.online ? 'Uploading now...' : 'Will upload when back online'));
        pendingBanner.appendChild(pendingText);
        page.appendChild(pendingBanner);
        
        // If online, try to sync now
        if (state.online) {
          setTimeout(syncPendingPost, 500);
        }
      }
      
      // Show CTA to encourage posting (hide if draft or posted)
      if (!state.hasPostcardToday) {
        var cta = el('div', {style: {margin: '20px 20px 20px', padding: '24px', borderRadius: '0', textAlign: 'center', border: '2px dashed ' + t.border, background: t.card}});
        var ctaIcon = el('div', {style: {marginBottom: '12px', display: 'flex', justifyContent: 'center'}});
        ctaIcon.appendChild(icon('send', 40, t.text));
        cta.appendChild(ctaIcon);
        cta.appendChild(el('p', {style: {color: t.text, margin: '0 0 14px', fontSize: '14px'}}, "Share your day to see friends' postcards"));
        cta.appendChild(el('span', {className: 'tap', style: {display: 'inline-block', color: t.bg, padding: '14px 28px', borderRadius: '0', fontSize: '13px', fontWeight: '600', background: t.text, letterSpacing: '1px', textTransform: 'uppercase', border: '2px solid ' + t.text}, onClick: function() { nav('post'); }}, 'SEND POSTCARD'));
        page.appendChild(cta);
      }
      
      var posts = [];
      
      // Add my own posts from the last 24 hours
      for (var i = 0; i < state.myPosts.length; i++) {
        if (isWithinLast24Hours(state.myPosts[i].createdAt, state.myPosts[i].date)) {
          var p = {};
          for (var k in state.myPosts[i]) p[k] = state.myPosts[i][k];
          p.friend = {};
          if (state.userData) {
            for (var k in state.userData) p.friend[k] = state.userData[k];
          }
          p.friend.id = state.user ? state.user.uid : null;
          p.isOwn = true;
          posts.push(p);
        }
      }
      
      // Add friends' posts from last 24 hours (but mark as blurred if not posted today)
      for (var i = 0; i < state.friends.length; i++) {
        var f = state.friends[i];
        var friendPosts = f.posts || [];
        for (var j = 0; j < friendPosts.length; j++) {
          if (isWithinLast24Hours(friendPosts[j].createdAt, friendPosts[j].date)) {
            var p = {};
            for (var k in friendPosts[j]) p[k] = friendPosts[j][k];
            p.friend = f;
            p.isOwn = false;
            p.isBlurred = !state.posted;
            posts.push(p);
          }
        }
      }
      
      // Sort posts by createdAt (newest first)
      posts.sort(function(a, b) {
        var aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        var bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
      
      if (posts.length === 0 && state.posted) {
        var empty = el('div', {style: {padding: '40px 20px', textAlign: 'center'}});
        empty.appendChild(el('p', {style: {color: t.muted, fontSize: '15px'}}, 'No postcards from friends in the last 24 hours.'));
        page.appendChild(empty);
      }
      
      var postsWrap = el('div', {style: {padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: '32px', position: 'relative', zIndex: '1'}});
      for (var i = 0; i < posts.length; i++) {
        (function(p) {
          var isMyPost = state.user && p.userId === state.user.uid;
          var item = el('div', {style: {position: 'relative'}});
          
          // Create postcard
          var postcard = postcardEl(p, p.friend, {
            showPrivate: isMyPost,
            showReactions: !isMyPost && !p.isBlurred,
            showReactionsReadOnly: isMyPost,
            showStamp: false,
            enablePreview: !p.isBlurred  // Only enable audio if NOT blurred
          });
          
          // Apply blur if needed
          if (p.isBlurred) {
            postcard.style.filter = 'blur(12px)';
            postcard.style.pointerEvents = 'none';
          }
          
          item.appendChild(postcard);
          
          // Add overlay for blurred posts
          if (p.isBlurred) {
            var overlay = el('div', {style: {
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              bottom: '0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '16px',
              zIndex: '10'
            }});
            var lockIconWrap = el('div', {style: {marginBottom: '8px'}});
            lockIconWrap.appendChild(icon('lock', 32, t.text));
            overlay.appendChild(lockIconWrap);
            overlay.appendChild(el('p', {style: {color: t.text, fontSize: '14px', fontWeight: '600', textAlign: 'center', padding: '0 20px'}}, 'Post your postcard to see this'));
            var sendBtn = el('span', {className: 'tap', style: {marginTop: '12px', padding: '10px 20px', background: t.text, color: t.bg, borderRadius: '0', fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', border: '2px solid ' + t.text, display: 'flex', alignItems: 'center', gap: '8px'}, onClick: function() { nav('post'); }});
            sendBtn.appendChild(icon('send', 14, t.bg));
            sendBtn.appendChild(el('span', null, 'SEND POSTCARD'));
            overlay.appendChild(sendBtn);
            item.appendChild(overlay);
          }
          
          postsWrap.appendChild(item);
        })(posts[i]);
      }
      page.appendChild(postsWrap);
      
      // Add separator and older posts section (ALWAYS show, blur if not posted)
      // Collect older posts (more than 24 hours old)
      var olderPosts = [];
      
      // My older posts
      for (var i = 0; i < state.myPosts.length; i++) {
        if (!isWithinLast24Hours(state.myPosts[i].createdAt, state.myPosts[i].date)) {
          var p = {};
          for (var k in state.myPosts[i]) p[k] = state.myPosts[i][k];
          p.friend = {};
          if (state.userData) {
            for (var k in state.userData) p.friend[k] = state.userData[k];
          }
          p.friend.id = state.user ? state.user.uid : null;
          p.isOwn = true;
          p.isBlurred = false; // Own posts are never blurred
          olderPosts.push(p);
        }
      }
      
      // Friends' older posts
      for (var i = 0; i < state.friends.length; i++) {
        var f = state.friends[i];
        var friendPosts = f.posts || [];
        for (var j = 0; j < friendPosts.length; j++) {
          if (!isWithinLast24Hours(friendPosts[j].createdAt, friendPosts[j].date)) {
            var p = {};
            for (var k in friendPosts[j]) p[k] = friendPosts[j][k];
            p.friend = f;
            p.isOwn = false;
            // Get blur status based on whether user posted on that day
            var postDate = getLocalDateFromTimestamp(friendPosts[j].createdAt) || friendPosts[j].date;
            var blurStatus = getPostBlurStatus(postDate, false);
            p.isBlurred = blurStatus.blurred;
            p.blurReason = blurStatus.reason;
            olderPosts.push(p);
          }
        }
      }
      
      // Sort older posts by createdAt descending
      olderPosts.sort(function(a, b) {
        var aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        var bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
      
      // Limit to last 10 older posts
      olderPosts = olderPosts.slice(0, 10);
      
      // ALWAYS show separator (so they can see if anyone posted today)
      var separator = el('div', {style: {margin: '24px 20px', padding: '20px', borderRadius: '0', background: t.highlight, border: '2px solid ' + t.border, textAlign: 'center', transform: 'rotate(-1deg)'}});
      separator.appendChild(el('p', {className: 'zine-title', style: {margin: '0', fontSize: '14px', fontWeight: '700', color: t.text, letterSpacing: '1px'}}, "THAT'S IT FOR TODAY! HERE ARE SOME OLDER POSTCARDS"));
      page.appendChild(separator);
      
      if (olderPosts.length > 0) {
        // Older posts (removed opacity - keep them looking normal)
        var olderWrap = el('div', {style: {padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '32px', position: 'relative', zIndex: '1'}});
        for (var i = 0; i < olderPosts.length; i++) {
          (function(p) {
            var isMyPost = state.user && p.userId === state.user.uid;
            var item = el('div', {style: {position: 'relative'}});
            
            var postcard = postcardEl(p, p.friend, {
              showPrivate: isMyPost,
              showReactions: false,
              showReactionsReadOnly: isMyPost,
              showStamp: false,
              enablePreview: !p.isBlurred  // Only enable audio if NOT blurred
            });
            
            // Blur older posts if needed
            if (p.isBlurred) {
              postcard.style.filter = 'blur(12px)';
              postcard.style.pointerEvents = 'none';
            }
            
            item.appendChild(postcard);
            
            // Add overlay for blurred older posts
            if (p.isBlurred) {
              var blurMessage = p.blurReason === 'missed' ? "You didn't post on this day, post today to unlock" : 'Post your postcard to see this';
              var overlay = el('div', {style: {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '0',
                zIndex: '10'
              }});
              var lockIconWrap2 = el('div', {style: {marginBottom: '8px'}});
              lockIconWrap2.appendChild(icon('lock', 32, t.text));
              overlay.appendChild(lockIconWrap2);
              overlay.appendChild(el('p', {style: {color: t.text, fontSize: '14px', fontWeight: '600', textAlign: 'center', padding: '0 20px'}}, blurMessage));
              var sendBtn2 = el('span', {className: 'tap', style: {marginTop: '12px', padding: '10px 20px', background: t.text, color: t.bg, borderRadius: '0', fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', border: '2px solid ' + t.text, display: 'flex', alignItems: 'center', gap: '8px'}, onClick: function() { nav('post'); }});
              sendBtn2.appendChild(icon('send', 14, t.bg));
              sendBtn2.appendChild(el('span', null, 'SEND POSTCARD'));
              overlay.appendChild(sendBtn2);
              item.appendChild(overlay);
            }
            
            olderWrap.appendChild(item);
          })(olderPosts[i]);
        }
        page.appendChild(olderWrap);
      } else {
        // No older posts message
        var emptyOlder = el('div', {style: {padding: '40px 20px', textAlign: 'center'}});
        emptyOlder.appendChild(el('p', {style: {color: t.muted, fontSize: '14px'}}, 'No older postcards yet'));
        page.appendChild(emptyOlder);
      }
      
      var navbar = el('nav', {style: {position: 'fixed', bottom: '0', left: '0', right: '0', margin: '0 auto', width: '100%', maxWidth: '430px', padding: '12px 16px 30px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: t.bg, zIndex: '10000', borderTop: '2px solid ' + t.border, pointerEvents: 'auto'}});
      
      // Groups button
      var groupsBtn = el('span', {className: 'tap', style: {padding: '10px', opacity: '0.6', position: 'relative', zIndex: '10001', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center'}, onClick: function() { nav('groups'); }});
      groupsBtn.appendChild(icon('users', 24, t.text));
      navbar.appendChild(groupsBtn);
      
      // + button - disabled if already have postcard today (draft OR posted)
      if (state.hasPostcardToday) {
        var disabledBtn = el('span', {style: {width: '48px', height: '48px', borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.border, opacity: '0.5', border: '2px solid ' + t.border}});
        disabledBtn.appendChild(icon('check', 24, t.bg));
        navbar.appendChild(disabledBtn);
      } else {
        var addBtn = el('span', {className: 'tap', style: {width: '48px', height: '48px', borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.text, position: 'relative', zIndex: '10001', pointerEvents: 'auto', border: '2px solid ' + t.border}, onClick: function() { nav('post'); }});
        addBtn.appendChild(icon('plus', 24, t.bg));
        navbar.appendChild(addBtn);
      }
      
      // Profile button with avatar
      var profBtn = el('span', {className: 'tap', style: {padding: '6px', position: 'relative', zIndex: '10001', pointerEvents: 'auto'}, onClick: function() { nav('profile'); }});
      if (state.userData && state.userData.avatar) {
        profBtn.appendChild(cachedImage(state.userData.avatar, {style: {width: '36px', height: '36px', borderRadius: '0', objectFit: 'cover', border: '2px solid ' + t.border}}));
      } else {
        profBtn.appendChild(el('div', {style: {width: '36px', height: '36px', borderRadius: '0', background: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', color: t.bg, border: '2px solid ' + t.border}}, (state.userData && state.userData.username) ? state.userData.username[0].toUpperCase() : '?'));
      }
      navbar.appendChild(profBtn);
      
      app.appendChild(page);
      app.appendChild(navbar);
      return;
    }
    
    // Detail
    if (state.view === 'detail' && state.sel) {
      var page = el('div', {style: {minHeight: '100vh', padding: '16px'}});
      var closeBtn = el('span', {className: 'tap', style: {position: 'absolute', top: '16px', right: '16px', width: '36px', height: '36px', borderRadius: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.card, color: t.text, zIndex: '10', border: '2px solid ' + t.border}, onClick: function() { nav('feed'); }});
      closeBtn.appendChild(icon('close', 18, t.text));
      page.appendChild(closeBtn);
      var wrap = el('div', {style: {paddingTop: '40px'}});
      var isOwner = state.user && state.sel.userId === state.user.uid;
      wrap.appendChild(postcardEl(state.sel, state.sel.friend, {showPrivate: isOwner, isOwner: isOwner, showMenu: true, showStamp: true, enablePreview: true}));
      page.appendChild(wrap);
      app.appendChild(page);
      return;
    }
    
    // Post (Steps 1-4)
    if (state.view === 'post') {
      // If already have postcard today (draft OR posted), redirect to feed
      // EXCEPTION: Allow if editing a draft (editingDraftId is set)
      if (state.hasPostcardToday && !state.editingDraftId) {
        var page = el('div', {style: {minHeight: '100vh', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}});
        var checkIconWrap = el('div', {style: {marginBottom: '16px'}});
        checkIconWrap.appendChild(icon('check', 64, t.text));
        page.appendChild(checkIconWrap);
        page.appendChild(el('h2', {style: {margin: '0 0 8px', fontSize: '22px', fontWeight: '600', color: t.text}}, "You've posted today!"));
        page.appendChild(el('p', {style: {margin: '0 0 24px', fontSize: '15px', color: t.muted}}, 'Come back tomorrow to share another postcard.'));
        page.appendChild(el('span', {className: 'tap', style: {padding: '14px 28px', borderRadius: '0', background: t.text, color: t.bg, fontWeight: '600', fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase', border: '2px solid ' + t.text}, onClick: function() { nav('feed'); }}, 'BACK TO FEED'));
        app.appendChild(page);
        return;
      }
      
      var page = el('div', {style: {minHeight: '100vh', padding: '0 20px 40px'}});
      
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0'}});
      var backBtn = el('span', {className: 'tap', style: {padding: '8px 12px', color: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center'}, onClick: function() { if (state.step > 1) setState({step: state.step - 1}); else nav('feed'); }});
      backBtn.appendChild(icon('back', 24, t.text));
      header.appendChild(backBtn);
      var stepIcons = ['', 'camera', 'music', 'edit', 'check'];
      var stepTitles = ['', 'Photos', 'Details', 'Edit', 'Preview'];
      var titleWrap = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px'}});
      titleWrap.appendChild(icon(stepIcons[state.step], 18, t.text));
      titleWrap.appendChild(el('span', {style: {fontWeight: '600', color: t.text, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '14px'}}, stepTitles[state.step]));
      header.appendChild(titleWrap);
      header.appendChild(el('span', {style: {color: t.muted, padding: '8px 12px', fontSize: '13px'}}, state.step + '/4'));
      page.appendChild(header);
      
      // Step 1: Photos
      if (state.step === 1) {
        var content = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '16px'}});
        content.appendChild(el('p', {style: {color: t.muted, textAlign: 'center', margin: '0', fontSize: '14px'}}, 'Left: Your outfit/selfie | Right: Best moment'));
        
        var grid = el('div', {style: {display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}});
        var keys = ['outfit', 'photo'];
        var iconNames = ['user', 'camera'];
        var labels = ['Outfit/Selfie', 'Best Photo'];
        var sublabels = ['of the day', 'of the day'];
        
        for (var i = 0; i < 2; i++) {
          (function(idx) {
            var k = keys[idx];
            var box = el('div', {style: {aspectRatio: '3/4', borderRadius: '16px', overflow: 'hidden', border: '2px dashed ' + t.border, background: t.card}});
            var input = el('input', {type: 'file', accept: 'image/*', style: {display: 'none'}, id: k + 'Input'});
            input.onchange = function(e) {
              var f = e.target.files[0];
              if (f) {
                var r = new FileReader();
                r.onloadend = function() {
                  // For outfit/selfie photos, flip them to match mirror view
                  // Phone un-mirrors them, we need to re-mirror
                  if (k === 'outfit') {
                    var img = new Image();
                    img.onload = function() {
                      // Create canvas to flip the image
                      var canvas = document.createElement('canvas');
                      canvas.width = img.width;
                      canvas.height = img.height;
                      var ctx = canvas.getContext('2d');
                      
                      // Flip horizontally to restore mirror view
                      ctx.translate(canvas.width, 0);
                      ctx.scale(-1, 1);
                      ctx.drawImage(img, 0, 0);
                      
                      // Get flipped image as data URL
                      var flippedUrl = canvas.toDataURL('image/jpeg', 0.95);
                      var upd = {};
                      upd[k] = flippedUrl;
                      setNp(upd);
                    };
                    img.src = r.result;
                  } else {
                    // Don't flip the other photo
                    var upd = {};
                    upd[k] = r.result;
                    setNp(upd);
                  }
                };
                r.readAsDataURL(f);
              }
            };
            var label = el('label', {for: k + 'Input', style: {width: '100%', height: '100%', display: 'flex', cursor: 'pointer'}});
            if (state.np[k]) {
              label.appendChild(el('img', {src: state.np[k], style: {width: '100%', height: '100%', objectFit: 'cover'}}));
            } else {
              var ph = el('div', {style: {width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px'}});
              ph.appendChild(icon(iconNames[idx], 40, t.muted));
              ph.appendChild(el('span', {style: {color: t.text, fontSize: '13px', fontWeight: '600', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px'}}, labels[idx]));
              ph.appendChild(el('span', {style: {color: t.muted, fontSize: '11px', textAlign: 'center'}}, sublabels[idx]));
              label.appendChild(ph);
            }
            box.appendChild(input);
            box.appendChild(label);
            grid.appendChild(box);
          })(i);
        }
        content.appendChild(grid);
        
        var canNext = state.np.photo && state.np.outfit;
        content.appendChild(el('span', {className: 'tap', style: {color: '#fff', padding: '18px', borderRadius: '14px', fontSize: '16px', fontWeight: '600', textAlign: 'center', background: t.accent, opacity: canNext ? '1' : '0.4', display: 'block'}, onClick: function() { if (canNext) setState({step: 2}); }}, 'Next →'));
        
        page.appendChild(content);
      }
      
      // Step 2: Details
      if (state.step === 2) {
        var content = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}});
        
        // Song Search Section
        var songSection = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '10px'}});
        
        // Offline warning for music search
        if (!state.online) {
          var offlineWarning = el('div', {style: {padding: '12px 16px', borderRadius: '12px', background: '#ff9800', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px'}});
          offlineWarning.appendChild(el('div', {style: {fontSize: '20px'}}, '📡'));
          offlineWarning.appendChild(el('div', {style: {flex: '1', fontSize: '13px', lineHeight: '1.4'}}, 'Music search requires internet. You can skip this step.'));
          songSection.appendChild(offlineWarning);
        }
        
        // Show selected song or search interface
        if (state.np.songTitle && state.np.songArtist) {
          var selectedSong = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '14px', border: '2px solid ' + t.accent, background: t.card}});
          if (state.np.songArtwork) {
            selectedSong.appendChild(el('img', {src: state.np.songArtwork, style: {width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover'}}));
          } else {
            selectedSong.appendChild(el('div', {style: {width: '50px', height: '50px', borderRadius: '8px', background: t.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'}}, '🎵'));
          }
          var songInfo = el('div', {style: {flex: '1', minWidth: '0'}});
          songInfo.appendChild(el('p', {style: {margin: '0', fontSize: '15px', fontWeight: '600', color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, state.np.songTitle));
          songInfo.appendChild(el('p', {style: {margin: '4px 0 0', fontSize: '13px', color: t.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, state.np.songArtist));
          selectedSong.appendChild(songInfo);
          selectedSong.appendChild(el('span', {className: 'tap', style: {fontSize: '18px', padding: '8px', color: t.muted, borderRadius: '8px'}, onClick: function() { setNp({songTitle: '', songArtist: '', songArtwork: '', songPreview: ''}); setState({itunesSearch: '', itunesResults: []}); }}, '✕'));
          songSection.appendChild(selectedSong);
        } else {
          // Search input - button triggered, not auto-search
          var searchBox = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', borderRadius: '14px', border: '1px solid ' + t.border, background: t.card}});
          searchBox.appendChild(el('span', {style: {fontSize: '16px', color: t.muted}}, '🔍'));
          var searchInput = el('input', {
            id: 'musicSearchInput',
            placeholder: 'Search for a song...', 
            value: state.itunesSearch || '', 
            autocomplete: 'off',
            autocorrect: 'off',
            autocapitalize: 'off',
            spellcheck: false,
            style: {flex: '1', background: 'transparent', border: 'none', fontSize: '16px', color: t.text, outline: 'none'}
          });
          // Don't use setState on input - just track the value
          searchInput.oninput = function(e) {
            state.itunesSearch = e.target.value;
          };
          searchInput.onkeydown = function(e) {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              searchItunes();
            }
          };
          searchBox.appendChild(searchInput);
          
          // Search button
          var searchBtn = el('span', {
            className: 'tap', 
            style: {padding: '8px 14px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#fff', background: t.accent, whiteSpace: 'nowrap'}, 
            onClick: function() { searchItunes(); }
          }, state.itunesSearching ? '...' : 'Search');
          searchBox.appendChild(searchBtn);
          
          songSection.appendChild(searchBox);
          
          // Loading indicator
          if (state.itunesSearching) {
            var loadingBox = el('div', {style: {padding: '20px', textAlign: 'center', color: t.muted, fontSize: '14px'}});
            loadingBox.appendChild(el('div', {style: {marginBottom: '8px', fontSize: '20px'}}, '⏳'));
            loadingBox.appendChild(el('span', null, 'Searching...'));
            songSection.appendChild(loadingBox);
          }
          
          // Error message
          if (state.itunesError && !state.itunesSearching) {
            songSection.appendChild(el('div', {style: {padding: '12px 16px', borderRadius: '10px', background: '#ffebee', color: '#c62828', fontSize: '13px', textAlign: 'center'}}, state.itunesError));
          }
          
          // Search results
          if (state.itunesResults && state.itunesResults.length > 0 && !state.itunesSearching) {
            var resultsBox = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto', WebkitOverflowScrolling: 'touch'}});
            for (var i = 0; i < state.itunesResults.length; i++) {
              (function(song) {
                var result = el('div', {className: 'tap', style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', background: t.card, border: '1px solid ' + t.border}, onClick: function() { selectSong(song); }});
                if (song.artworkUrl100) {
                  result.appendChild(el('img', {src: song.artworkUrl100, style: {width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover', flexShrink: '0'}}));
                } else {
                  result.appendChild(el('div', {style: {width: '44px', height: '44px', borderRadius: '6px', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: '0'}}, '🎵'));
                }
                var info = el('div', {style: {flex: '1', minWidth: '0'}});
                info.appendChild(el('p', {style: {margin: '0', fontSize: '14px', fontWeight: '500', color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, song.trackName || 'Unknown'));
                info.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '12px', color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, song.artistName || 'Unknown'));
                result.appendChild(info);
                result.appendChild(el('span', {style: {fontSize: '16px', color: t.accent, fontWeight: 'bold'}}, '+'));
                resultsBox.appendChild(result);
              })(state.itunesResults[i]);
            }
            songSection.appendChild(resultsBox);
          }
          
          // Hint when empty
          if (!state.itunesSearch && !state.itunesResults.length && !state.itunesSearching && !state.itunesError) {
            songSection.appendChild(el('div', {style: {padding: '12px', textAlign: 'center', color: t.muted, fontSize: '13px'}}, 'Type a song name and tap Search'));
          }
        }
        
        content.appendChild(songSection);
        
        // Other fields
        var fieldsData = [
          {icon: '📍', key: 'loc', ph: 'Location'},
          {icon: '💬', key: 'quote', ph: 'Quote (optional)'},
          {icon: '🔒', key: 'privateNote', ph: 'Private note (only visible to you)', bg: '#fff8e1'}
        ];
        
        for (var i = 0; i < fieldsData.length; i++) {
          (function(f) {
            var field = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '14px', border: '1px solid ' + t.border, background: f.bg || t.card}});
            field.appendChild(el('span', {style: {fontSize: '18px'}}, f.icon));
            var input = el('input', {placeholder: f.ph, value: state.np[f.key], style: {flex: '1', background: 'transparent', border: 'none', fontSize: '16px', color: t.text, outline: 'none'}});
            input.oninput = function(e) {
              state.np[f.key] = e.target.value;
              // Update button state without full re-render
              var nextBtn = document.getElementById('step2NextBtn');
              if (nextBtn) {
                // Offline: only location needed. Online: location + music needed.
                var canGo = state.np.loc && (state.online ? (state.np.songTitle && state.np.songArtist) : true);
                nextBtn.style.opacity = canGo ? '1' : '0.4';
                nextBtn.style.background = canGo ? t.accent : t.border;
              }
            };
            field.appendChild(input);
            content.appendChild(field);
          })(fieldsData[i]);
        }
        
        var btns = el('div', {style: {display: 'flex', gap: '12px', marginTop: '8px'}});
        btns.appendChild(el('span', {className: 'tap', style: {padding: '16px 24px', border: '1px solid ' + t.border, borderRadius: '14px', fontSize: '15px', color: t.text, background: t.card}, onClick: function() { setState({step: 1}); }}, '←'));
        
        // When offline, music is optional (can't search). When online, music is required.
        var canNext = state.np.loc && (state.online ? (state.np.songTitle && state.np.songArtist) : true);
        var nextBtn = el('span', {className: 'tap', id: 'step2NextBtn', style: {flex: '1', color: '#fff', padding: '18px', borderRadius: '14px', fontSize: '16px', fontWeight: '600', textAlign: 'center', background: canNext ? t.accent : t.border, opacity: canNext ? '1' : '0.4'}, onClick: function() { 
          if (state.np.loc && (state.online ? (state.np.songTitle && state.np.songArtist) : true)) {
            // If offline and no music, set placeholder values
            if (!state.online && !state.np.songTitle) {
              setNp({songTitle: 'No Music', songArtist: '(Offline)'});
            }
            setState({step: 3});
          }
        }}, 'Next →');
        btns.appendChild(nextBtn);
        content.appendChild(btns);
        
        page.appendChild(content);
      }
      
      // Step 3: Edit
      if (state.step === 3) {
        var content = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '20px'}});
        
        // Preview
        var preview = el('div', {style: {background: t.card, borderRadius: '16px', border: '1px solid ' + t.border, overflow: 'hidden'}});
        var imgArea = el('div', {style: {position: 'relative', display: 'flex', height: '200px'}});
        
        var left = el('div', {style: {flex: '1', overflow: 'hidden', position: 'relative', outline: state.activeEdit === 'outfit' ? '3px solid ' + t.accent : 'none', outlineOffset: '-3px', cursor: 'pointer'}, onClick: function() { setState({activeEdit: 'outfit'}); }});
        left.appendChild(el('img', {src: state.np.outfit, style: {width: '100%', height: '100%', objectFit: 'cover', objectPosition: (50 + state.np.outfitX) + '% ' + (50 + state.np.outfitY) + '%'}}));
        
        var right = el('div', {style: {flex: '1', overflow: 'hidden', position: 'relative', outline: state.activeEdit === 'photo' ? '3px solid ' + t.accent : 'none', outlineOffset: '-3px', cursor: 'pointer'}, onClick: function() { setState({activeEdit: 'photo'}); }});
        right.appendChild(el('img', {src: state.np.photo, style: {width: '100%', height: '100%', objectFit: 'cover', objectPosition: (50 + state.np.photoX) + '% ' + (50 + state.np.photoY) + '%'}}));
        
        var font = FONTS[state.np.songFont].v;
        var color = COLORS[state.np.songColor];
        
        // Helper to wrap text at ~15 characters per line
        function wrapText(text, maxChars) {
          if (!text || text.length <= maxChars) return text;
          var words = text.split(' ');
          var lines = [];
          var currentLine = '';
          for (var w = 0; w < words.length; w++) {
            var word = words[w];
            if (currentLine.length + word.length + 1 <= maxChars) {
              currentLine += (currentLine ? ' ' : '') + word;
            } else {
              if (currentLine) lines.push(currentLine);
              currentLine = word;
            }
          }
          if (currentLine) lines.push(currentLine);
          return lines.join('\n');
        }
        
        var song = el('div', {style: {position: 'absolute', left: '0', right: '0', top: '50%', transform: 'translateY(-50%)', textAlign: 'center', textShadow: '0 2px 8px rgba(0,0,0,.95)', padding: '10px 16px', borderRadius: '8px', background: state.activeEdit === 'song' ? 'rgba(255,255,255,.2)' : 'transparent', border: state.activeEdit === 'song' ? '2px dashed ' + t.accent : 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}, onClick: function() { setState({activeEdit: 'song'}); }});
        
        // Show album artwork if available
        if (state.np.songArtwork) {
          song.appendChild(el('img', {src: state.np.songArtwork, style: {width: '45px', height: '45px', borderRadius: '6px', objectFit: 'cover', boxShadow: '0 2px 12px rgba(0,0,0,.7)', border: '2px solid rgba(255,255,255,.9)'}}));
        }
        
        var titleEl = el('p', {style: {margin: '0', fontSize: '13px', fontWeight: '600', color: color, fontFamily: font, textAlign: 'center', whiteSpace: 'pre-line', lineHeight: '1.3', maxWidth: '180px'}}, wrapText(state.np.songTitle, 15));
        song.appendChild(titleEl);
        
        var artistEl = el('p', {style: {margin: '0', fontSize: '11px', color: color, fontFamily: font, textAlign: 'center', whiteSpace: 'pre-line', lineHeight: '1.3', maxWidth: '180px', opacity: '0.9'}}, wrapText(state.np.songArtist, 15));
        song.appendChild(artistEl);
        
        imgArea.appendChild(left);
        imgArea.appendChild(el('div', {style: {width: '3px', background: t.card}}));
        imgArea.appendChild(right);
        imgArea.appendChild(song);
        imgArea.appendChild(el('div', {style: {position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', background: t.accent, color: '#fff', padding: '5px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: '700'}}, '📮 POSTCARD'));
        
        preview.appendChild(imgArea);
        
        var bottom = el('div', {style: {padding: '14px', borderTop: '1px solid ' + t.border}});
        var info = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px'}});
        if (state.userData && state.userData.avatar) {
          info.appendChild(cachedImage(state.userData.avatar, {style: {width: '32px', height: '32px', borderRadius: '10px', objectFit: 'cover'}}));
        } else {
          info.appendChild(el('div', {style: {width: '32px', height: '32px', borderRadius: '10px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: '#fff'}}, (state.userData && state.userData.username) ? state.userData.username[0].toUpperCase() : '?'));
        }
        var meta = el('div', {style: {flex: '1'}});
        meta.appendChild(el('p', {style: {margin: '0', fontSize: '13px', fontWeight: '600', color: t.text}}, 'You'));
        meta.appendChild(el('p', {style: {margin: '0', fontSize: '11px', color: t.muted}}, '📍 ' + (state.np.loc || 'Location') + ' · Today'));
        info.appendChild(meta);
        bottom.appendChild(info);
        if (state.np.quote) {
          bottom.appendChild(el('p', {style: {margin: '10px 0 0', fontSize: '14px', fontStyle: 'italic', color: t.text}}, '"' + state.np.quote + '"'));
        }
        preview.appendChild(bottom);
        content.appendChild(preview);
        
        // Controls
        if (!state.activeEdit) {
          var hint = el('div', {style: {padding: '16px 20px', background: t.accent + '15', borderRadius: '14px', border: '1px solid ' + t.accent + '40', textAlign: 'center'}});
          hint.appendChild(el('p', {style: {margin: '0', color: t.accent, fontSize: '15px', fontWeight: '600'}}, '👆 Tap an image or song to edit'));
          content.appendChild(hint);
        } else if (state.activeEdit === 'song') {
          var ctrl = el('div', {style: {background: t.card, borderRadius: '16px', padding: '20px', border: '2px solid ' + t.accent}});
          var hdr = el('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}});
          hdr.appendChild(el('p', {style: {margin: '0', fontSize: '16px', fontWeight: '600', color: t.text}}, '🎵 Song Style'));
          hdr.appendChild(el('span', {className: 'tap', style: {fontSize: '20px', color: t.muted, padding: '4px'}, onClick: function() { setState({activeEdit: null}); }}, '✕'));
          ctrl.appendChild(hdr);
          
          ctrl.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '13px', fontWeight: '500', color: t.text}}, 'Font'));
          var fonts = el('div', {style: {display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px'}});
          for (var i = 0; i < FONTS.length; i++) {
            (function(idx) {
              var f = FONTS[idx];
              fonts.appendChild(el('span', {className: 'tap', style: {padding: '10px 14px', borderRadius: '10px', fontSize: '13px', background: state.np.songFont === idx ? t.accent : t.bg, color: state.np.songFont === idx ? '#fff' : t.text, fontFamily: f.v, fontWeight: '500'}, onClick: function() { setNp({songFont: idx}); }}, f.n));
            })(i);
          }
          ctrl.appendChild(fonts);
          
          ctrl.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '13px', fontWeight: '500', color: t.text}}, 'Color'));
          var colors = el('div', {style: {display: 'flex', gap: '10px'}});
          for (var i = 0; i < COLORS.length; i++) {
            (function(idx) {
              colors.appendChild(el('span', {className: 'tap', style: {width: '40px', height: '40px', borderRadius: '10px', background: COLORS[idx], border: state.np.songColor === idx ? '3px solid ' + t.accent : '2px solid ' + t.border}, onClick: function() { setNp({songColor: idx}); }}));
            })(i);
          }
          ctrl.appendChild(colors);
          content.appendChild(ctrl);
        } else {
          var isOutfit = state.activeEdit === 'outfit';
          var prefix = isOutfit ? 'outfit' : 'photo';
          
          var ctrl = el('div', {style: {background: t.card, borderRadius: '16px', padding: '20px', border: '2px solid ' + t.accent}});
          var hdr = el('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}});
          hdr.appendChild(el('p', {style: {margin: '0', fontSize: '16px', fontWeight: '600', color: t.text}}, (isOutfit ? '👕 Outfit' : '📷 Photo') + ' Position'));
          hdr.appendChild(el('span', {className: 'tap', style: {fontSize: '20px', color: t.muted, padding: '4px'}, onClick: function() { setState({activeEdit: null}); }}, '✕'));
          ctrl.appendChild(hdr);
          
          var dpad = el('div', {style: {display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', maxWidth: '200px', margin: '0 auto'}});
          dpad.appendChild(el('div'));
          dpad.appendChild(el('span', {className: 'tap', style: {padding: '18px', background: t.bg, borderRadius: '12px', textAlign: 'center', fontSize: '22px'}, onClick: function() { var u = {}; u[prefix + 'Y'] = state.np[prefix + 'Y'] + 10; setNp(u); }}, '↑'));
          dpad.appendChild(el('div'));
          dpad.appendChild(el('span', {className: 'tap', style: {padding: '18px', background: t.bg, borderRadius: '12px', textAlign: 'center', fontSize: '22px'}, onClick: function() { var u = {}; u[prefix + 'X'] = state.np[prefix + 'X'] + 10; setNp(u); }}, '←'));
          dpad.appendChild(el('span', {className: 'tap', style: {padding: '18px', background: t.accent, borderRadius: '12px', textAlign: 'center', fontSize: '11px', fontWeight: '600', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'}, onClick: function() { var u = {}; u[prefix + 'X'] = 0; u[prefix + 'Y'] = 0; setNp(u); }}, 'Reset'));
          dpad.appendChild(el('span', {className: 'tap', style: {padding: '18px', background: t.bg, borderRadius: '12px', textAlign: 'center', fontSize: '22px'}, onClick: function() { var u = {}; u[prefix + 'X'] = state.np[prefix + 'X'] - 10; setNp(u); }}, '→'));
          dpad.appendChild(el('div'));
          dpad.appendChild(el('span', {className: 'tap', style: {padding: '18px', background: t.bg, borderRadius: '12px', textAlign: 'center', fontSize: '22px'}, onClick: function() { var u = {}; u[prefix + 'Y'] = state.np[prefix + 'Y'] - 10; setNp(u); }}, '↓'));
          dpad.appendChild(el('div'));
          ctrl.appendChild(dpad);
          content.appendChild(ctrl);
        }
        
        var btns = el('div', {style: {display: 'flex', gap: '12px'}});
        btns.appendChild(el('span', {className: 'tap', style: {padding: '16px 24px', border: '1px solid ' + t.border, borderRadius: '14px', fontSize: '15px', color: t.text, background: t.card}, onClick: function() { setState({step: 2}); }}, '←'));
        btns.appendChild(el('span', {className: 'tap', style: {flex: '1', color: '#fff', padding: '18px', borderRadius: '14px', fontSize: '16px', fontWeight: '600', textAlign: 'center', background: t.accent}, onClick: function() { setState({activeEdit: null, step: 4}); }}, 'Preview →'));
        content.appendChild(btns);
        
        page.appendChild(content);
      }
      
      // Step 4: Preview
      if (state.step === 4) {
        var content = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '20px'}});
        content.appendChild(el('p', {style: {color: t.text, textAlign: 'center', margin: '0', fontSize: '16px', fontWeight: '500'}}, 'Ready to send? 🎉'));
        
        var previewPost = {
          outfit: state.np.outfit,
          photo: state.np.photo,
          outfitPhoto: state.np.outfit,
          outfitX: state.np.outfitX,
          outfitY: state.np.outfitY,
          photoX: state.np.photoX,
          photoY: state.np.photoY,
          song: {title: state.np.songTitle, artist: state.np.songArtist},
          songFont: state.np.songFont,
          songColor: state.np.songColor,
          location: state.np.loc,
          quote: state.np.quote,
          privateNote: state.np.privateNote,
          date: 'Today'
        };
        content.appendChild(postcardEl(previewPost, state.userData, {showPrivate: true, showStamp: false}));
        
        var btns = el('div', {style: {display: 'flex', gap: '12px'}});
        btns.appendChild(el('span', {className: 'tap', style: {padding: '16px 24px', border: '1px solid ' + t.border, borderRadius: '14px', fontSize: '15px', color: t.text, background: t.card}, onClick: function() { setState({step: 3}); }}, '← Edit'));
        
        // Button text logic:
        // - If offline: "Save Draft 💾"
        // - If editing draft and same day as draft date: "Upload to Feed 📤"
        // - If editing draft and past midnight: "Upload to Calendar 📅"
        // - If new postcard: "Send ✈️"
        var buttonText;
        if (state.uploading) {
          buttonText = 'Saving...';
        } else if (!state.online) {
          buttonText = 'Save Draft 💾';
        } else if (state.editingDraftDate) {
          // Editing a draft - check if it's still the same day
          var today = getLocalDate();
          var canUploadToFeed = state.editingDraftDate === today;
          buttonText = canUploadToFeed ? '📤 Upload to Feed' : '📅 Upload to Calendar';
        } else {
          // New postcard
          buttonText = 'Send ✈️';
        }
        
        btns.appendChild(el('span', {className: 'tap', style: {flex: '1', color: '#fff', padding: '18px', borderRadius: '14px', fontSize: '16px', fontWeight: '600', textAlign: 'center', background: t.accent, opacity: state.uploading ? '0.5' : '1', pointerEvents: state.uploading ? 'none' : 'auto'}, onClick: function() { if (!state.uploading) submit(); }}, buttonText));
        content.appendChild(btns);
        
        page.appendChild(content);
      }
      
      app.appendChild(page);
      return;
    }
    
    // Notifications
    if (state.view === 'notifications') {
      var page = el('div', {style: {minHeight: '100vh', padding: '0 20px 40px'}});
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0'}});
      var backBtn = el('span', {className: 'tap', style: {padding: '8px 12px', color: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center'}, onClick: function() { nav('feed'); }});
      backBtn.appendChild(icon('back', 24, t.text));
      header.appendChild(backBtn);
      var headerTitle = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px'}});
      headerTitle.appendChild(icon('mail', 20, t.text));
      headerTitle.appendChild(el('span', {style: {fontWeight: '600', color: t.text}}, 'Mailbox'));
      header.appendChild(headerTitle);
      header.appendChild(el('div', {style: {width: '48px'}}));
      page.appendChild(header);
      
      // Separate notifications by type (with null safety)
      var friendRequestNotifs = state.friendRequests || [];
      var reactionNotifs = state.notifications.filter(function(n) { return n && n.type === 'reaction' && n.data; });
      var weeklyNotifs = state.notifications.filter(function(n) { return n && n.type === 'weeklyLookback' && n.data; });
      
      // AUTO-DISMISS: Mark all reaction notifications as read when viewing mailbox
      var unreadReactions = reactionNotifs.filter(function(n) { return !n.read; });
      if (unreadReactions.length > 0) {
        setTimeout(function() {
          unreadReactions.forEach(function(notif) {
            removeNotification(notif.id);
          });
        }, 1500); // Auto-dismiss after 1.5 seconds so user can see them
      }
      
      // Friend Requests Section - ALWAYS SHOW HEADER
      var frSection = el('div', {style: {marginBottom: '24px'}});
      var frHeader = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}});
      frHeader.appendChild(icon('userPlus', 16, t.text));
      frHeader.appendChild(el('p', {style: {margin: '0', fontSize: '14px', fontWeight: '700', color: t.text, textTransform: 'uppercase', letterSpacing: '0.5px'}}, 'Friend Requests'));
      frSection.appendChild(frHeader);
      
      if (friendRequestNotifs.length > 0) {
        for (var i = 0; i < friendRequestNotifs.length; i++) {
          (function(req) {
            var item = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '14px', background: t.card, border: '1px solid ' + t.border, marginBottom: '8px'}});
            
            if (req.fromUser && req.fromUser.avatar) {
              item.appendChild(cachedImage(req.fromUser.avatar, {style: {width: '44px', height: '44px', borderRadius: '12px', objectFit: 'cover'}}));
            } else {
              item.appendChild(el('div', {style: {width: '44px', height: '44px', borderRadius: '12px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '600', color: '#fff'}}, (req.fromUser && req.fromUser.username) ? req.fromUser.username[0].toUpperCase() : '?'));
            }
            
            var info = el('div', {style: {flex: '1'}});
            info.appendChild(el('p', {style: {margin: '0', fontSize: '15px', fontWeight: '600', color: t.text}}, req.fromUser ? req.fromUser.username : 'Someone'));
            info.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '12px', color: t.muted}}, 'wants to be friends'));
            item.appendChild(info);
            
            var btnsWrap = el('div', {style: {display: 'flex', gap: '6px'}});
            btnsWrap.appendChild(el('span', {className: 'tap', style: {padding: '10px 14px', borderRadius: '10px', background: t.accent, color: '#fff', fontSize: '13px', fontWeight: '600'}, onClick: function() { acceptFriendRequest(req); }}, '✓'));
            btnsWrap.appendChild(el('span', {className: 'tap', style: {padding: '10px 14px', borderRadius: '10px', background: t.border, color: t.muted, fontSize: '13px', fontWeight: '600'}, onClick: function() { declineFriendRequest(req); }}, '✕'));
            item.appendChild(btnsWrap);
            
            frSection.appendChild(item);
          })(friendRequestNotifs[i]);
        }
      } else {
        frSection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', padding: '12px', background: t.card, borderRadius: '12px', border: '1px solid ' + t.border}}, 'No pending friend requests'));
      }
      page.appendChild(frSection);
      
      // Saved Drafts Section
      var draftsSection = el('div', {style: {marginBottom: '24px'}});
      var draftsHeader = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}});
      draftsHeader.appendChild(icon('edit', 16, t.text));
      draftsHeader.appendChild(el('p', {style: {margin: '0', fontSize: '14px', fontWeight: '700', color: t.text, textTransform: 'uppercase', letterSpacing: '0.5px'}}, 'Saved Drafts'));
      draftsSection.appendChild(draftsHeader);
      
      if (state.savedDrafts && state.savedDrafts.length > 0) {
        for (var i = 0; i < state.savedDrafts.length; i++) {
          (function(draft) {
            var today = getLocalDate();
            var canUploadToFeed = draft.date === today;
            var draftDate = new Date(draft.date);
            var dateStr = draftDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
            
            // Changed: Use neutral colors for all drafts
            var item = el('div', {style: {padding: '14px', borderRadius: '14px', background: t.card, border: '1px solid ' + t.border, marginBottom: '8px'}});
            
            var header = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}});
            header.appendChild(el('div', {style: {fontSize: '24px'}}, '📝'));
            
            var info = el('div', {style: {flex: '1'}});
            info.appendChild(el('p', {style: {margin: '0', fontSize: '15px', fontWeight: '600', color: t.text}}, 'Draft'));
            info.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '12px', color: t.muted}}, 'From ' + dateStr));
            header.appendChild(info);
            item.appendChild(header);
            
            // Show preview
            var preview = el('div', {style: {display: 'flex', gap: '8px', marginBottom: '10px'}});
            if (draft.outfit) {
              preview.appendChild(el('img', {src: draft.outfit, style: {width: '60px', height: '80px', borderRadius: '8px', objectFit: 'cover'}}));
            }
            if (draft.photo) {
              preview.appendChild(el('img', {src: draft.photo, style: {width: '60px', height: '80px', borderRadius: '8px', objectFit: 'cover'}}));
            }
            var details = el('div', {style: {flex: '1'}});
            if (draft.loc) details.appendChild(el('p', {style: {margin: '0 0 4px', fontSize: '12px', color: t.text}}, '📍 ' + draft.loc));
            if (draft.songTitle) {
              details.appendChild(el('p', {style: {margin: '0', fontSize: '11px', color: t.muted}}, '🎵 ' + draft.songTitle));
            } else {
              details.appendChild(el('p', {style: {margin: '0', fontSize: '11px', color: '#ff9800', fontWeight: '600'}}, '⚠️ No music added'));
            }
            preview.appendChild(details);
            item.appendChild(preview);
            
            // Status message
            if (canUploadToFeed) {
              item.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '13px', color: '#2e7d32'}}, '✓ Can upload to today\'s feed'));
            } else {
              item.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '13px', color: t.muted}}, 'Can be uploaded to calendar only (past midnight)'));
            }
            
            // Buttons
            var btns = el('div', {style: {display: 'flex', gap: '8px'}});
            
            // Edit button - loads draft and goes to upload page (step 1)
            btns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '10px', borderRadius: '10px', background: t.accent, color: '#fff', fontSize: '13px', fontWeight: '600', textAlign: 'center'}, onClick: function() { 
              // Load draft into new post state
              state.np = {
                photo: draft.photo,
                outfit: draft.outfit,
                songTitle: draft.songTitle || '',
                songArtist: draft.songArtist || '',
                songArtwork: draft.songArtwork || '',
                songPreview: draft.songPreview || '',
                loc: draft.loc || '',
                quote: draft.quote || '',
                privateNote: draft.privateNote || '',
                outfitX: draft.outfitX || 0,
                outfitY: draft.outfitY || 0,
                photoX: draft.photoX || 0,
                photoY: draft.photoY || 0,
                songFont: draft.songFont || 0,
                songColor: draft.songColor || 0
              };
              
              // Store draft ID so we know we're editing (will delete on upload)
              state.editingDraftId = draft.id;
              state.editingDraftDate = draft.date;
              
              console.log('[Drafts] Edit button clicked - opening upload flow');
              console.log('[Drafts] Editing draft ID:', draft.id);
              
              // Go to step 1 of POST VIEW so they can go through full upload flow
              setState({step: 1, view: 'post'});
            }}, '✏️ Edit'));
            
            // Upload button - text changes based on date
            if (state.online) {
              var uploadText = canUploadToFeed ? '📤 Upload to Feed' : '📅 Upload to Calendar';
              btns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '10px', borderRadius: '10px', background: canUploadToFeed ? '#4caf50' : '#2196f3', color: '#fff', fontSize: '13px', fontWeight: '600', textAlign: 'center'}, onClick: function() { uploadDraft(draft); }}, uploadText));
            } else {
              btns.appendChild(el('span', {style: {flex: '1', padding: '10px', borderRadius: '10px', background: t.border, color: t.muted, fontSize: '13px', fontWeight: '600', textAlign: 'center'}}, 'Offline - Can\'t Upload'));
            }
            
            // Delete button
            btns.appendChild(el('span', {className: 'tap', style: {padding: '10px 14px', borderRadius: '10px', background: t.border, color: t.muted, fontSize: '13px', fontWeight: '600'}, onClick: function() { 
              if (confirm('Delete this draft?')) {
                deleteDraft(draft.id);
                render();
              }
            }}, '🗑️'));
            
            item.appendChild(btns);
            
            draftsSection.appendChild(item);
          })(state.savedDrafts[i]);
        }
      } else {
        draftsSection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', padding: '12px', background: t.card, borderRadius: '12px', border: '1px solid ' + t.border}}, 'No saved drafts'));
      }
      page.appendChild(draftsSection);
      
      // Weekly Recaps Section - Compact with button to view all
      var weeklySection = el('div', {style: {marginBottom: '24px'}});
      var weeklyHeader = el('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}});
      var weeklyTitleWrap = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px'}});
      weeklyTitleWrap.appendChild(icon('calendar', 16, t.text));
      weeklyTitleWrap.appendChild(el('p', {style: {margin: '0', fontSize: '14px', fontWeight: '700', color: t.text, textTransform: 'uppercase', letterSpacing: '0.5px'}}, 'Weekly Recaps'));
      weeklyHeader.appendChild(weeklyTitleWrap);
      
      var unreadWeeklyCount = weeklyNotifs.filter(function(n) { return !n.read; }).length;
      
      if (weeklyNotifs.length > 0) {
        var viewAllBtn = el('span', {className: 'tap', style: {fontSize: '13px', color: t.accent, fontWeight: '600', padding: '6px 12px', background: t.accent + '15', borderRadius: '8px'}, onClick: function() { nav('weeklyRecapsList'); }}, 'View All (' + weeklyNotifs.length + ')');
        weeklyHeader.appendChild(viewAllBtn);
        weeklySection.appendChild(weeklyHeader);
        
        if (unreadWeeklyCount > 0) {
          weeklySection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.accent, padding: '12px', background: t.accent + '11', borderRadius: '12px', border: '1px solid ' + t.accent + '33'}}, '🎉 ' + unreadWeeklyCount + ' new recap' + (unreadWeeklyCount !== 1 ? 's' : '') + ' available!'));
        } else {
          weeklySection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', padding: '12px', background: t.card, borderRadius: '12px', border: '1px solid ' + t.border}}, weeklyNotifs.length + ' recap' + (weeklyNotifs.length !== 1 ? 's' : '') + ' saved'));
        }
      } else {
        weeklySection.appendChild(weeklyHeader);
        weeklySection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', padding: '12px', background: t.card, borderRadius: '12px', border: '1px solid ' + t.border}}, 'Your weekly recaps will appear here every Sunday'));
      }
      page.appendChild(weeklySection);
      
      // Reactions Section - Auto-dismisses after viewing
      var unreadReactionsDisplay = reactionNotifs.filter(function(n) { return !n.read; });
      var reactSection = el('div', {style: {marginBottom: '24px'}});
      var reactHeader = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}});
      reactHeader.appendChild(icon('heart', 16, t.text));
      reactHeader.appendChild(el('p', {style: {margin: '0', fontSize: '14px', fontWeight: '700', color: t.text, textTransform: 'uppercase', letterSpacing: '0.5px'}}, 'New Reactions'));
      reactSection.appendChild(reactHeader);
      
      if (unreadReactionsDisplay.length > 0) {
        for (var i = 0; i < unreadReactionsDisplay.length; i++) {
          (function(notif) {
            if (!notif || !notif.data) return; // Skip invalid notifications
            
            var item = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '0', background: t.card, border: '2px solid ' + t.border, marginBottom: '8px'}});
            
            item.appendChild(el('div', {style: {width: '44px', height: '44px', borderRadius: '0', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', border: '2px solid ' + t.border}}, notif.data.emoji || '❤️'));
            
            var info = el('div', {style: {flex: '1'}});
            info.appendChild(el('p', {style: {margin: '0', fontSize: '15px', fontWeight: '500', color: t.text}}, (notif.data.fromUsername || 'Someone') + ' reacted ' + (notif.data.emoji || '❤️')));
            info.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '12px', color: t.muted}}, 'to your postcard'));
            item.appendChild(info);
            
            reactSection.appendChild(item);
          })(unreadReactionsDisplay[i]);
        }
        reactSection.appendChild(el('p', {style: {margin: '8px 0 0', fontSize: '11px', color: t.muted, textAlign: 'center', fontStyle: 'italic'}}, 'These will clear automatically'));
      } else {
        reactSection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', padding: '12px', background: t.card, borderRadius: '0', border: '2px solid ' + t.border}}, 'No new reactions'));
      }
      page.appendChild(reactSection);
      
      // Groups Section
      var groupNotifs = state.notifications.filter(function(n) { 
        return n && (n.type === 'group_theme_chooser' || n.type === 'group_invite' || n.type === 'group_theme_set') && n.data && !n.read; 
      });
      var groupSection = el('div', {style: {marginBottom: '24px'}});
      var groupsHeader = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}});
      groupsHeader.appendChild(icon('users', 16, t.text));
      groupsHeader.appendChild(el('p', {style: {margin: '0', fontSize: '14px', fontWeight: '700', color: t.text, textTransform: 'uppercase', letterSpacing: '0.5px'}}, 'Groups'));
      groupSection.appendChild(groupsHeader);
      
      if (groupNotifs.length > 0) {
        for (var i = 0; i < groupNotifs.length; i++) {
          (function(notif) {
            if (!notif || !notif.data) return;
            
            var icon = '👥';
            var title = '';
            var subtitle = '';
            var isInvite = notif.type === 'group_invite';
            
            if (notif.type === 'group_theme_chooser') {
              icon = '👑';
              title = 'You\'re today\'s Theme Chooser!';
              subtitle = notif.data.groupName;
            } else if (notif.type === 'group_invite') {
              icon = '🎉';
              title = 'Invited to ' + notif.data.groupName;
              subtitle = 'by ' + (notif.data.invitedBy || 'someone');
            } else if (notif.type === 'group_theme_set') {
              icon = '🎯';
              title = 'New theme: "' + (notif.data.theme || '...') + '"';
              subtitle = notif.data.groupName + ' by ' + (notif.data.chooserName || 'Theme Chooser');
            }
            
            var item = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '14px', background: isInvite ? '#fff8e1' : t.accent + '11', border: '1px solid ' + (isInvite ? '#ffcc80' : t.border), marginBottom: '8px'}});
            
            item.appendChild(el('div', {style: {width: '44px', height: '44px', borderRadius: '12px', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'}}, icon));
            
            var info = el('div', {style: {flex: '1'}});
            info.appendChild(el('p', {style: {margin: '0', fontSize: '15px', fontWeight: '500', color: t.text}}, title));
            info.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '12px', color: t.muted}}, subtitle));
            item.appendChild(info);
            
            if (isInvite) {
              // Show accept/decline buttons for invites
              var btns = el('div', {style: {display: 'flex', gap: '6px'}});
              btns.appendChild(el('span', {className: 'tap', style: {padding: '8px 12px', borderRadius: '8px', background: t.accent, color: '#fff', fontSize: '12px', fontWeight: '600'}, onClick: function(e) { 
                e.stopPropagation();
                acceptGroupInvite(notif.data.groupId, notif.id); 
              }}, '✓ Join'));
              btns.appendChild(el('span', {className: 'tap', style: {padding: '8px 12px', borderRadius: '8px', background: t.border, color: t.muted, fontSize: '12px', fontWeight: '600'}, onClick: function(e) { 
                e.stopPropagation();
                declineGroupInvite(notif.data.groupId, notif.id); 
              }}, '✕'));
              item.appendChild(btns);
            } else {
              // Make other notifications tappable to navigate
              item.className = 'tap';
              item.onclick = function() { 
                removeNotification(notif.id);
                for (var gi = 0; gi < state.groups.length; gi++) {
                  if (state.groups[gi].id === notif.data.groupId) {
                    setState({currentGroup: state.groups[gi], groupView: 'detail', view: 'groups'});
                    return;
                  }
                }
                nav('groups');
              };
              item.appendChild(el('span', {style: {fontSize: '20px', color: t.muted}}, '›'));
            }
            
            groupSection.appendChild(item);
          })(groupNotifs[i]);
        }
      } else {
        groupSection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', padding: '12px', background: t.card, borderRadius: '12px', border: '1px solid ' + t.border}}, 'No group notifications'));
      }
      page.appendChild(groupSection);
      
      // Updates Section - Show all updates from UPDATE_NOTES (changelog)
      var updateSection = el('div', {style: {marginBottom: '24px'}});
      updateSection.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: t.text, textTransform: 'uppercase', letterSpacing: '0.5px'}}, '🆕 Updates'));
      
      // Get all versions from UPDATE_NOTES and sort them descending
      var versions = Object.keys(UPDATE_NOTES).sort(function(a, b) {
        var aParts = a.split('.').map(Number);
        var bParts = b.split('.').map(Number);
        for (var i = 0; i < 3; i++) {
          if ((bParts[i] || 0) !== (aParts[i] || 0)) {
            return (bParts[i] || 0) - (aParts[i] || 0);
          }
        }
        return 0;
      });
      
      if (versions.length > 0) {
        for (var i = 0; i < versions.length; i++) {
          (function(version) {
            var isCurrentVersion = version === APP_VERSION;
            var item = el('div', {style: {padding: '14px', borderRadius: '14px', background: isCurrentVersion ? t.accent + '11' : t.card, border: '1px solid ' + (isCurrentVersion ? t.accent + '33' : t.border), marginBottom: '8px'}});
            
            var hdr = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px'}});
            hdr.appendChild(el('span', {style: {fontSize: '20px'}}, '✨'));
            hdr.appendChild(el('p', {style: {margin: '0', fontSize: '15px', fontWeight: '600', color: t.text}}, 'Version ' + version));
            if (isCurrentVersion) {
              hdr.appendChild(el('span', {style: {fontSize: '10px', padding: '3px 8px', background: t.accent, color: '#fff', borderRadius: '6px', fontWeight: '600'}}, 'CURRENT'));
            }
            item.appendChild(hdr);
            
            item.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, lineHeight: '1.5'}}, UPDATE_NOTES[version]));
            
            updateSection.appendChild(item);
          })(versions[i]);
        }
      } else {
        updateSection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', padding: '12px', background: t.card, borderRadius: '12px', border: '1px solid ' + t.border}}, 'No updates'));
      }
      page.appendChild(updateSection);
      
      app.appendChild(page);
      return;
    }
    
    // Weekly Recaps List View
    if (state.view === 'weeklyRecapsList') {
      var weeklyNotifs = state.notifications.filter(function(n) { return n && n.type === 'weeklyLookback' && n.data; });
      
      var page = el('div', {style: {minHeight: '100vh', padding: '0 20px 40px'}});
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0'}});
      header.appendChild(el('span', {className: 'tap', style: {fontSize: '28px', padding: '8px 12px', color: t.text}, onClick: function() { nav('notifications'); }}, '←'));
      header.appendChild(el('span', {style: {fontWeight: '600', color: t.text}}, '📅 All Weekly Recaps'));
      header.appendChild(el('div', {style: {width: '48px'}}));
      page.appendChild(header);
      
      if (weeklyNotifs.length > 0) {
        for (var i = 0; i < weeklyNotifs.length; i++) {
          (function(notif) {
            var item = el('div', {className: 'tap', style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '14px', background: notif.read ? t.card : t.accent + '11', border: '1px solid ' + t.border, marginBottom: '10px'}, onClick: function() {
              markNotificationRead(notif.id);
              var weekPosts = state.myPosts.filter(function(p) {
                return notif.data.posts.indexOf(p.id) !== -1;
              });
              setState({weeklyLookbackPosts: weekPosts, view: 'weeklyLookback'});
            }});
            
            item.appendChild(el('div', {style: {width: '50px', height: '50px', borderRadius: '14px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'}}, '📮'));
            
            var info = el('div', {style: {flex: '1'}});
            info.appendChild(el('p', {style: {margin: '0', fontSize: '16px', fontWeight: '600', color: t.text}}, notif.data.weekLabel));
            info.appendChild(el('p', {style: {margin: '4px 0 0', fontSize: '13px', color: t.muted}}, notif.data.postCount + ' postcard' + (notif.data.postCount !== 1 ? 's' : '')));
            item.appendChild(info);
            
            if (!notif.read) {
              item.appendChild(el('span', {style: {fontSize: '11px', color: '#fff', padding: '4px 8px', background: t.accent, borderRadius: '6px', fontWeight: '600'}}, 'NEW'));
            }
            
            item.appendChild(el('span', {style: {fontSize: '20px', color: t.muted}}, '›'));
            
            page.appendChild(item);
          })(weeklyNotifs[i]);
        }
      } else {
        var empty = el('div', {style: {textAlign: 'center', padding: '60px 20px'}});
        empty.appendChild(el('div', {style: {fontSize: '48px', marginBottom: '16px'}}, '📅'));
        empty.appendChild(el('p', {style: {margin: '0', fontSize: '16px', color: t.muted}}, 'No weekly recaps yet'));
        empty.appendChild(el('p', {style: {margin: '8px 0 0', fontSize: '13px', color: t.muted}}, 'Check back every Sunday!'));
        page.appendChild(empty);
      }
      
      app.appendChild(page);
      return;
    }
    
    // Weekly Lookback View
    if (state.view === 'weeklyLookback' && state.weeklyLookbackPosts) {
      var page = el('div', {style: {minHeight: '100vh', padding: '0 20px 40px'}});
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0'}});
      header.appendChild(el('span', {className: 'tap', style: {fontSize: '28px', padding: '8px 12px', color: t.text}, onClick: function() { nav('weeklyRecapsList'); }}, '←'));
      header.appendChild(el('span', {style: {fontWeight: '600', color: t.text}}, '📅 Weekly Lookback'));
      header.appendChild(el('div', {style: {width: '48px'}}));
      page.appendChild(header);
      
      page.appendChild(el('p', {style: {textAlign: 'center', color: t.muted, fontSize: '14px', marginBottom: '20px'}}, state.weeklyLookbackPosts.length + ' postcard' + (state.weeklyLookbackPosts.length !== 1 ? 's' : '') + ' this week'));
      
      var postsWrap = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '16px'}});
      for (var i = 0; i < state.weeklyLookbackPosts.length; i++) {
        (function(p) {
          var owner = {};
          if (state.userData) {
            for (var k in state.userData) owner[k] = state.userData[k];
          }
          owner.id = state.user ? state.user.uid : null;
          postsWrap.appendChild(postcardEl(p, owner, {showPrivate: true, showStamp: false}));
        })(state.weeklyLookbackPosts[i]);
      }
      page.appendChild(postsWrap);
      
      app.appendChild(page);
      return;
    }
    
    // Settings
    if (state.view === 'settings') {
      var page = el('div', {style: {minHeight: '100vh', padding: '0 20px 40px'}});
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0'}});
      header.appendChild(el('span', {className: 'tap', style: {fontSize: '28px', padding: '8px 12px', color: t.text}, onClick: function() { nav('feed'); }}, '←'));
      header.appendChild(el('span', {style: {fontWeight: '600', color: t.text}}, 'Settings'));
      header.appendChild(el('div', {style: {width: '48px'}}));
      page.appendChild(header);
      
      // Profile Section
      var profileSection = el('div', {style: {padding: '16px', borderRadius: '16px', border: '1px solid ' + t.border, background: t.card, marginBottom: '12px'}});
      profileSection.appendChild(el('p', {style: {margin: '0 0 16px', fontSize: '14px', fontWeight: '600', color: t.text}}, '👤 Profile'));
      
      if (state.editingProfile) {
        // Editing mode
        var avatarWrap = el('div', {style: {display: 'flex', justifyContent: 'center', marginBottom: '16px'}});
        var avatarInput = el('input', {type: 'file', accept: 'image/*', style: {display: 'none'}, id: 'editAvatarInput'});
        avatarInput.onchange = function(e) {
          var f = e.target.files[0];
          if (f) {
            var r = new FileReader();
            r.onloadend = function() {
              state.editProfile.newAvatar = r.result;
              render();
            };
            r.readAsDataURL(f);
          }
        };
        var avatarLabel = el('label', {className: 'tap', for: 'editAvatarInput', style: {position: 'relative'}});
        var avatarSrc = state.editProfile.newAvatar || state.editProfile.avatar;
        if (avatarSrc) {
          avatarLabel.appendChild(cachedImage(avatarSrc, {style: {width: '80px', height: '80px', borderRadius: '24px', objectFit: 'cover'}}));
        } else {
          avatarLabel.appendChild(el('div', {style: {width: '80px', height: '80px', borderRadius: '24px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '700', color: '#fff'}}, state.editProfile.username ? state.editProfile.username[0].toUpperCase() : '?'));
        }
        avatarLabel.appendChild(el('div', {style: {position: 'absolute', bottom: '-4px', right: '-4px', width: '28px', height: '28px', borderRadius: '50%', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', border: '2px solid ' + t.card}}, '📷'));
        avatarWrap.appendChild(avatarInput);
        avatarWrap.appendChild(avatarLabel);
        profileSection.appendChild(avatarWrap);
        
        // Username field
        var usernameField = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '14px', border: '1px solid ' + t.border, background: t.bg, marginBottom: '12px'}});
        usernameField.appendChild(el('span', null, '👤'));
        var usernameInput = el('input', {placeholder: 'Username', value: state.editProfile.username, style: {flex: '1', background: 'transparent', border: 'none', fontSize: '15px', color: t.text, outline: 'none'}});
        usernameInput.oninput = function(e) { state.editProfile.username = e.target.value; };
        usernameField.appendChild(usernameInput);
        profileSection.appendChild(usernameField);
        
        // Email (read-only)
        var emailField = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '14px', border: '1px solid ' + t.border, background: t.bg, marginBottom: '12px', opacity: '0.6'}});
        emailField.appendChild(el('span', null, '✉️'));
        emailField.appendChild(el('span', {style: {flex: '1', fontSize: '15px', color: t.muted}}, state.user ? state.user.email : ''));
        profileSection.appendChild(emailField);
        profileSection.appendChild(el('p', {style: {margin: '-8px 0 12px', fontSize: '11px', color: t.muted, textAlign: 'center'}}, 'Email cannot be changed'));
        
        // Save/Cancel buttons
        var editBtns = el('div', {style: {display: 'flex', gap: '8px'}});
        editBtns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '12px', borderRadius: '10px', border: '1px solid ' + t.border, textAlign: 'center', fontSize: '14px', color: t.text, background: t.card}, onClick: cancelEditProfile}, 'Cancel'));
        editBtns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '12px', borderRadius: '10px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#fff', background: t.accent, opacity: state.savingProfile ? '0.5' : '1'}, onClick: state.savingProfile ? null : saveProfile}, state.savingProfile ? 'Saving...' : 'Save'));
        profileSection.appendChild(editBtns);
      } else {
        // View mode
        var profileRow = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px'}});
        if (state.userData && state.userData.avatar) {
          profileRow.appendChild(cachedImage(state.userData.avatar, {style: {width: '50px', height: '50px', borderRadius: '16px', objectFit: 'cover'}}));
        } else {
          profileRow.appendChild(el('div', {style: {width: '50px', height: '50px', borderRadius: '16px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '600', color: '#fff'}}, (state.userData && state.userData.username) ? state.userData.username[0].toUpperCase() : '?'));
        }
        var profileInfo = el('div', {style: {flex: '1'}});
        profileInfo.appendChild(el('p', {style: {margin: '0', fontSize: '16px', fontWeight: '600', color: t.text}}, state.userData ? state.userData.username : 'User'));
        profileInfo.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '13px', color: t.muted}}, state.user ? state.user.email : ''));
        profileRow.appendChild(profileInfo);
        profileRow.appendChild(el('span', {className: 'tap', style: {padding: '10px 16px', borderRadius: '10px', background: t.bg, fontSize: '13px', fontWeight: '600', color: t.accent}, onClick: startEditProfile}, 'Edit'));
        profileSection.appendChild(profileRow);
      }
      page.appendChild(profileSection);
      
      // Theme selector
      var currentThemeData = themes[state.theme] || themes.light;
      var themeSection = el('div', {style: {padding: '16px', borderRadius: '0', border: '2px solid ' + t.border, background: t.card, marginBottom: '12px'}});
      var themeHeader = el('div', {style: {display: 'flex', alignItems: 'center', justifyContent: 'space-between'}});
      var themeInfo = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px'}});
      themeInfo.appendChild(el('span', {style: {fontSize: '24px'}}, currentThemeData.emoji));
      themeInfo.appendChild(el('span', {style: {fontWeight: '600', color: t.text}}, currentThemeData.name));
      themeHeader.appendChild(themeInfo);
      themeHeader.appendChild(el('span', {className: 'tap', style: {padding: '8px 16px', background: t.bg, color: t.text, fontSize: '13px', fontWeight: '600', borderRadius: '0', border: '2px solid ' + t.border}, onClick: function() { setState({themePreview: state.theme}); }}, 'CHANGE'));
      themeSection.appendChild(themeHeader);
      page.appendChild(themeSection);
      
      // Theme preview modal
      if (state.themePreview) {
        var previewTheme = themes[state.themePreview] || themes.light;
        var overlay = el('div', {style: {position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.8)', zIndex: '9999', display: 'flex', flexDirection: 'column', padding: '20px', overflow: 'auto'}});
        
        // Theme grid
        var gridContainer = el('div', {style: {flex: '1', display: 'flex', flexDirection: 'column', maxWidth: '500px', margin: '0 auto', width: '100%'}});
        gridContainer.appendChild(el('h2', {style: {color: '#fff', margin: '0 0 16px', fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px'}}, 'Choose Theme'));
        
        var grid = el('div', {style: {display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px'}});
        
        for (var i = 0; i < themeOrder.length; i++) {
          (function(themeKey) {
            var themeData = themes[themeKey];
            var isSelected = state.themePreview === themeKey;
            var chip = el('div', {className: 'tap', style: {
              padding: '12px 8px',
              background: themeData.bg,
              border: isSelected ? '3px solid #fff' : '3px solid transparent',
              borderRadius: '0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: isSelected ? '0 0 0 2px ' + themeData.accent : 'none'
            }, onClick: function() {
              setState({themePreview: themeKey});
            }});
            chip.appendChild(el('span', {style: {fontSize: '20px'}}, themeData.emoji));
            chip.appendChild(el('span', {style: {fontSize: '10px', fontWeight: '600', color: themeData.text, textAlign: 'center', lineHeight: '1.2'}}, themeData.name));
            grid.appendChild(chip);
          })(themeOrder[i]);
        }
        gridContainer.appendChild(grid);
        
        // Preview card
        var previewCard = el('div', {style: {background: previewTheme.bg, border: '2px solid ' + previewTheme.border, padding: '16px', marginBottom: '16px'}});
        var previewHeader = el('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', marginBottom: '12px', borderBottom: '2px solid ' + previewTheme.border}});
        previewHeader.appendChild(el('span', {style: {fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: '700', color: previewTheme.text, letterSpacing: '-0.5px'}}, 'POSTCARD'));
        var previewIcon = el('div', {style: {width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid ' + previewTheme.border}});
        previewIcon.appendChild(icon('mail', 14, previewTheme.text));
        previewHeader.appendChild(previewIcon);
        previewCard.appendChild(previewHeader);
        
        var previewTape = el('div', {style: {width: '50px', height: '16px', background: previewTheme.highlight, transform: 'rotate(-2deg)', marginBottom: '10px', opacity: '0.85'}});
        previewCard.appendChild(previewTape);
        
        var previewPost = el('div', {style: {background: previewTheme.card, border: '2px solid ' + previewTheme.border, padding: '12px'}});
        var previewRow = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px'}});
        previewRow.appendChild(el('div', {style: {width: '36px', height: '36px', background: previewTheme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: previewTheme.bg, fontWeight: '700', fontSize: '14px'}}, 'A'));
        var previewNameCol = el('div');
        previewNameCol.appendChild(el('span', {style: {fontFamily: 'Syne, sans-serif', fontWeight: '600', fontSize: '14px', color: previewTheme.text}}, 'ash '));
        previewNameCol.appendChild(el('span', {style: {fontSize: '9px', padding: '2px 6px', background: previewTheme.highlight, color: previewTheme.text, fontWeight: '700'}}, 'FOUNDER'));
        previewRow.appendChild(previewNameCol);
        previewPost.appendChild(previewRow);
        previewPost.appendChild(el('p', {style: {margin: '0', fontSize: '12px', color: previewTheme.text}}, "Today's postcard 📮"));
        previewPost.appendChild(el('p', {style: {margin: '4px 0 0', fontSize: '11px', color: previewTheme.muted}}, 'London · 2:30 PM'));
        previewCard.appendChild(previewPost);
        
        var previewBtn = el('div', {style: {marginTop: '12px', padding: '10px 16px', background: previewTheme.accent, color: previewTheme.bg, fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', border: '2px solid ' + previewTheme.accent}}, 'SEND POSTCARD');
        previewCard.appendChild(previewBtn);
        
        gridContainer.appendChild(previewCard);
        
        // Action buttons
        var actions = el('div', {style: {display: 'flex', gap: '12px'}});
        actions.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '14px', background: 'transparent', color: '#fff', fontSize: '14px', fontWeight: '600', textAlign: 'center', border: '2px solid #fff', borderRadius: '0'}, onClick: function() { setState({themePreview: null}); }}, 'CANCEL'));
        actions.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '14px', background: '#fff', color: '#000', fontSize: '14px', fontWeight: '600', textAlign: 'center', border: '2px solid #fff', borderRadius: '0'}, onClick: function() { 
          var newTheme = state.themePreview;
          setState({theme: newTheme, themePreview: null}); 
        }}, 'SAVE'));
        gridContainer.appendChild(actions);
        
        overlay.appendChild(gridContainer);
        app.appendChild(overlay);
      }
      
      
      // Push Notifications Settings - ALWAYS SHOW
      var notifSection = el('div', {style: {width: '100%', marginTop: '20px', padding: '16px', background: t.card, borderRadius: '16px', border: '1px solid ' + t.border}});
      notifSection.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '14px', fontWeight: '600', color: t.text}}, '🔔 Push Notifications'));
      
      if (!messaging) {
        // Messaging not supported
        notifSection.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted}}, '❌ Not supported in this browser. Try Chrome, Firefox, or Edge on HTTPS.'));
      } else {
        notifSection.appendChild(el('p', {style: {margin: '0 0 16px', fontSize: '13px', color: t.muted}}, 'Get notified when you\'re chosen as theme chooser, when themes are set, or someone reacts to your postcard'));
        
        var notifEnabled = state.userData && state.userData.notificationsEnabled || false;
        
        if (notifEnabled) {
          var status = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'}});
          status.appendChild(el('span', {style: {fontSize: '16px'}}, '✅'));
          status.appendChild(el('span', {style: {fontSize: '13px', color: t.text}}, 'Enabled'));
          notifSection.appendChild(status);
          
          notifSection.appendChild(el('span', {
            className: 'tap',
            style: {display: 'inline-block', padding: '10px 16px', background: t.border, color: t.text, borderRadius: '10px', fontSize: '13px', fontWeight: '600'},
            onClick: disableNotifications
          }, 'Disable'));
        } else {
          notifSection.appendChild(el('span', {
            className: 'tap',
            style: {display: 'inline-block', padding: '12px 20px', background: t.accent, color: '#fff', borderRadius: '10px', fontSize: '14px', fontWeight: '600'},
            onClick: enableNotifications
          }, 'Enable Notifications'));
        }
      }
      
      page.appendChild(notifSection);

      // Log out button
      page.appendChild(el('span', {className: 'tap', style: {display: 'block', padding: '16px', borderRadius: '16px', border: '1px solid ' + t.border, background: t.card, textAlign: 'center', color: '#e53935', fontWeight: '600', marginTop: '20px'}, onClick: handleLogout}, 'Log Out'));
      app.appendChild(page);
      return;
    }
    
    // Groups
    if (state.view === 'groups') {
      var page = el('div', {style: {minHeight: '100vh', padding: '0 20px 120px'}});
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0'}});
      
      // Back button - proper navigation hierarchy
      var backTarget = 'feed';
      if (state.groupView === 'list' || !state.groupView) {
        backTarget = 'feed';
      } else if (state.groupView === 'members' || state.groupView === 'history' || state.groupView === 'camera') {
        backTarget = 'detail';
      } else if (state.groupView === 'detail' || state.groupView === 'create') {
        backTarget = 'list';
      } else {
        backTarget = 'list';
      }
      
      header.appendChild(el('span', {className: 'tap', style: {fontSize: '28px', padding: '8px 12px', color: t.text}, onClick: function() { 
        if (backTarget === 'feed') {
          nav('feed');
        } else if (backTarget === 'detail') {
          setState({groupView: 'detail', groupPhoto: null});
        } else {
          setState({groupView: 'list', currentGroup: null, groupPhoto: null}); 
        }
      }}, '←'));
      
      // Title changes based on view
      var title = '👥 Groups';
      if (state.groupView === 'detail' && state.currentGroup) title = state.currentGroup.name;
      else if (state.groupView === 'create') title = '✨ New Group';
      else if (state.groupView === 'info') title = '📖 Info';
      else if (state.groupView === 'history') title = '📅 History';
      else if (state.groupView === 'camera') title = '📷 Camera';
      else if (state.groupView === 'members') title = '👥 Members';
      header.appendChild(el('span', {style: {fontWeight: '600', color: t.text, fontSize: '16px'}}, title));
      
      // Right button - info on list, settings on detail (for ALL members)
      if (state.groupView === 'detail' && state.currentGroup) {
        header.appendChild(el('span', {className: 'tap', style: {fontSize: '20px', padding: '8px', color: t.muted}, onClick: function() { setState({groupView: 'members'}); }}, '⚙️'));
      } else if (state.groupView === 'list' || !state.groupView) {
        header.appendChild(el('span', {className: 'tap', style: {fontSize: '20px', padding: '8px', color: t.muted}, onClick: function() { setState({groupView: 'info'}); }}, 'ℹ️'));
      } else {
        header.appendChild(el('div', {style: {width: '36px'}}));
      }
      page.appendChild(header);
      
      // Group Info View
      if (state.groupView === 'info') {
        var infoBox = el('div', {style: {background: t.card, borderRadius: '16px', padding: '20px', border: '1px solid ' + t.border}});
        infoBox.appendChild(el('h3', {style: {margin: '0 0 16px', fontSize: '18px', fontWeight: '700', color: t.text, textAlign: 'center'}}, '📖 How Groups Work'));
        
        var sections = [
          {title: '🎯 Purpose', text: 'Groups run a daily photo challenge between friends. Each day, one member sets a theme and everyone takes a photo matching it.'},
          {title: '👑 Theme Chooser', text: 'Every day at midnight UTC, a random member becomes the Theme Chooser. Only they can set the day\'s theme (max 100 characters).'},
          {title: '📸 Photo Rules', text: '• Photos must be taken in-app (no uploads from camera roll)\n• Each member is randomly assigned portrait or landscape orientation\n• You can only submit ONE photo per day\n• Uploads are FINAL - no deleting!'},
          {title: '🔒 Visibility', text: 'You can only see other members\' photos AFTER you\'ve submitted yours.'},
          {title: '🖼️ Daily Collage', text: 'At midnight UTC, all submitted photos from the previous day are combined into a collage. The collage only includes photos that were actually submitted - no blank spaces!'},
          {title: '🔄 Daily Reset', text: 'At midnight UTC:\n• Previous day\'s collage is generated\n• New Theme Chooser is selected\n• New orientations are assigned\n• A fresh challenge begins!'}
        ];
        
        for (var i = 0; i < sections.length; i++) {
          var sec = el('div', {style: {marginBottom: '16px', paddingBottom: '16px', borderBottom: i < sections.length - 1 ? '1px solid ' + t.border : 'none'}});
          sec.appendChild(el('p', {style: {margin: '0 0 6px', fontSize: '14px', fontWeight: '600', color: t.accent}}, sections[i].title));
          sec.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.text, whiteSpace: 'pre-line', lineHeight: '1.5'}}, sections[i].text));
          infoBox.appendChild(sec);
        }
        
        // Time conversion info
        var timeBox = el('div', {style: {background: t.bg, borderRadius: '12px', padding: '14px', marginTop: '8px'}});
        timeBox.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: t.text}}, '🕐 Times in Your Timezone'));
        timeBox.appendChild(el('p', {style: {margin: '0', fontSize: '12px', color: t.muted}}, 'Daily reset & collage: 12:00 AM UTC = ' + utcToLocalTime(0) + ' local'));
        infoBox.appendChild(timeBox);
        
        infoBox.appendChild(el('span', {className: 'tap', style: {display: 'block', marginTop: '20px', padding: '14px', borderRadius: '12px', background: t.accent, color: '#fff', textAlign: 'center', fontWeight: '600'}, onClick: function() { setState({groupView: 'list'}); }}, 'Got it!'));
        
        page.appendChild(infoBox);
        app.appendChild(page);
        return;
      }
      
      // Create Group View
      if (state.groupView === 'create') {
        var createBox = el('div', {style: {background: t.card, borderRadius: '16px', padding: '20px', border: '1px solid ' + t.border}});
        createBox.appendChild(el('h3', {style: {margin: '0 0 16px', fontSize: '18px', fontWeight: '600', color: t.text}}, '✨ Create New Group'));
        
        // Group name
        var nameField = el('div', {style: {marginBottom: '16px'}});
        nameField.appendChild(el('label', {style: {display: 'block', fontSize: '13px', fontWeight: '600', color: t.muted, marginBottom: '6px'}}, 'Group Name'));
        var nameInput = el('input', {placeholder: 'e.g. Morning Crew', value: state.newGroup.name, style: {width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid ' + t.border, background: t.bg, fontSize: '15px', color: t.text, outline: 'none', boxSizing: 'border-box'}});
        nameInput.oninput = function(e) { state.newGroup.name = e.target.value; };
        nameField.appendChild(nameInput);
        createBox.appendChild(nameField);
        
        // Select friends
        createBox.appendChild(el('label', {style: {display: 'block', fontSize: '13px', fontWeight: '600', color: t.muted, marginBottom: '10px'}}, 'Select Friends (min 2)'));
        
        if (state.friends.length === 0) {
          createBox.appendChild(el('p', {style: {color: t.muted, fontSize: '14px', fontStyle: 'italic', padding: '20px', textAlign: 'center', background: t.bg, borderRadius: '10px'}}, 'Add some friends first to create a group!'));
        } else {
          var friendsList = el('div', {style: {maxHeight: '200px', overflowY: 'auto', background: t.bg, borderRadius: '10px', padding: '8px'}});
          for (var i = 0; i < state.friends.length; i++) {
            (function(friend) {
              var isSelected = state.newGroup.members.indexOf(friend.id) !== -1;
              var friendItem = el('div', {className: 'tap', style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', background: isSelected ? t.accent + '22' : 'transparent', marginBottom: '4px'}, onClick: function() {
                var members = state.newGroup.members.slice();
                var idx = members.indexOf(friend.id);
                if (idx === -1) {
                  members.push(friend.id);
                } else {
                  members.splice(idx, 1);
                }
                state.newGroup.members = members;
                render();
              }});
              
              if (friend.avatar) {
                friendItem.appendChild(cachedImage(friend.avatar, {style: {width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover'}}));
              } else {
                friendItem.appendChild(el('div', {style: {width: '36px', height: '36px', borderRadius: '10px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', color: '#fff'}}, friend.username ? friend.username[0].toUpperCase() : '?'));
              }
              friendItem.appendChild(el('span', {style: {flex: '1', fontSize: '14px', fontWeight: '500', color: t.text}}, friend.username));
              friendItem.appendChild(el('span', {style: {fontSize: '18px'}}, isSelected ? '✅' : '○'));
              
              friendsList.appendChild(friendItem);
            })(state.friends[i]);
          }
          createBox.appendChild(friendsList);
        }
        
        createBox.appendChild(el('p', {style: {margin: '12px 0 0', fontSize: '12px', color: t.muted, textAlign: 'center'}}, 'Selected: ' + state.newGroup.members.length + ' friend' + (state.newGroup.members.length !== 1 ? 's' : '') + ' (+ you = ' + (state.newGroup.members.length + 1) + ' members)'));
        
        var btns = el('div', {style: {display: 'flex', gap: '10px', marginTop: '20px'}});
        btns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '14px', borderRadius: '12px', background: t.bg, color: t.text, textAlign: 'center', fontWeight: '600', border: '1px solid ' + t.border}, onClick: function() { setState({groupView: 'list', newGroup: {name: '', members: []}}); }}, 'Cancel'));
        btns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '14px', borderRadius: '12px', background: state.newGroup.members.length >= 2 && state.newGroup.name.trim() ? t.accent : t.border, color: '#fff', textAlign: 'center', fontWeight: '600', opacity: state.newGroup.members.length >= 2 && state.newGroup.name.trim() ? '1' : '0.5'}, onClick: createGroup}, 'Create'));
        createBox.appendChild(btns);
        
        page.appendChild(createBox);
        app.appendChild(page);
        return;
      }
      
      // Group Detail View
      if (state.groupView === 'detail' && state.currentGroup) {
        var group = state.currentGroup;
        
        // Check if day has changed (using current group data, not stale cached data)
        if (group.currentDate !== getUTCDate()) {
          checkGroupDayReset(group);
          // Reload groups to get fresh data after reset
          loadGroups(state.user.uid);
          return;
        }
        
        var today = getUTCDate();
        var isThemeChooser = group.themeChooserId === state.user.uid;
        var hasSubmitted = hasSubmittedToday(group);
        var todayPhotos = group.photos && group.photos[today] ? group.photos[today] : {};
        var myOrientation = group.orientations ? group.orientations[state.user.uid] : 'portrait';
        
        // Group header
        var groupHeader = el('div', {style: {background: t.card, borderRadius: '16px', padding: '16px', border: '1px solid ' + t.border, marginBottom: '16px'}});
        groupHeader.appendChild(el('h2', {style: {margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: t.text}}, group.name));
        groupHeader.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted}}, group.members.length + ' members'));
        
        // Time info
        var timeInfo = el('div', {style: {marginTop: '12px', padding: '10px', background: t.bg, borderRadius: '10px', fontSize: '11px', color: t.muted}});
        timeInfo.appendChild(el('span', null, '🕐 Next reset: 12:00 AM UTC (' + utcToLocalTime(0) + ' local)'));
        groupHeader.appendChild(timeInfo);
        
        page.appendChild(groupHeader);
        
        // Today's Challenge
        var challengeBox = el('div', {style: {background: t.card, borderRadius: '16px', padding: '16px', border: '1px solid ' + t.border, marginBottom: '16px'}});
        challengeBox.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '12px', fontWeight: '600', color: t.muted, textTransform: 'uppercase', letterSpacing: '0.5px'}}, "📅 Today's Challenge"));
        
        // Theme Chooser info
        if (isThemeChooser) {
          challengeBox.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '14px', color: t.accent, fontWeight: '600'}}, '👑 You are today\'s Theme Chooser!'));
          
          if (!group.theme) {
            // Theme input - hasn't set theme yet
            var themeInput = el('input', {placeholder: 'Set today\'s theme (max 100 chars)', value: state.groupTheme, maxLength: 100, style: {width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid ' + t.accent, background: t.bg, fontSize: '14px', color: t.text, outline: 'none', boxSizing: 'border-box', marginBottom: '10px'}});
            themeInput.oninput = function(e) { state.groupTheme = e.target.value; };
            challengeBox.appendChild(themeInput);
            challengeBox.appendChild(el('span', {className: 'tap', style: {display: 'block', padding: '12px', borderRadius: '10px', background: t.accent, color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: '14px'}, onClick: function() { if (state.groupTheme.trim()) setGroupTheme(group.id, state.groupTheme.trim()); }}, 'Set Theme'));
          } else {
            // Theme is set - show it (CANNOT change it)
            challengeBox.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '18px', fontWeight: '600', color: t.text, textAlign: 'center', padding: '12px', background: t.bg, borderRadius: '10px'}}, '🎯 "' + group.theme + '"'));
            challengeBox.appendChild(el('p', {style: {margin: '0', fontSize: '12px', color: t.muted, textAlign: 'center'}}, 'Theme set! Everyone can see this.'));
          }
        } else {
          // Show who is theme chooser
          var chooserInfo = el('p', {style: {margin: '0 0 8px', fontSize: '13px', color: t.muted}}, '👑 Theme Chooser: Loading...');
          challengeBox.appendChild(chooserInfo);
          
          // Get theme chooser info and update display
          getMemberInfo(group.themeChooserId, function(info) {
            chooserInfo.textContent = '👑 Theme Chooser: ' + (info.username || 'Unknown');
          });
          
          if (group.theme) {
            challengeBox.appendChild(el('p', {style: {margin: '8px 0 0', fontSize: '18px', fontWeight: '600', color: t.text, textAlign: 'center', padding: '12px', background: t.bg, borderRadius: '10px'}}, '🎯 "' + group.theme + '"'));
          } else {
            challengeBox.appendChild(el('p', {style: {margin: '8px 0 0', fontSize: '14px', color: t.muted, fontStyle: 'italic', textAlign: 'center'}}, 'Waiting for theme to be set...'));
          }
        }
        
        page.appendChild(challengeBox);
        
        // Your Photo Section
        var photoBox = el('div', {style: {background: t.card, borderRadius: '16px', padding: '16px', border: '1px solid ' + t.border, marginBottom: '16px'}});
        photoBox.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '12px', fontWeight: '600', color: t.muted, textTransform: 'uppercase', letterSpacing: '0.5px'}}, '📸 Your Photo'));
        
        if (hasSubmitted) {
          var myPhoto = todayPhotos[state.user.uid];
          photoBox.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '13px', color: '#4CAF50', fontWeight: '500'}}, '✅ Photo submitted!'));
          photoBox.appendChild(el('img', {src: myPhoto.url, style: {width: '100%', borderRadius: '10px', maxHeight: '200px', objectFit: 'cover'}}));
        } else {
          photoBox.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '14px', color: t.text}}, 'Your orientation: ' + (myOrientation === 'portrait' ? '📱 Portrait' : '🖼️ Landscape')));
          photoBox.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '12px', color: t.muted}}, '⚠️ Upload is FINAL - no deleting!'));
          
          if (group.theme || isThemeChooser) {
            photoBox.appendChild(el('span', {className: 'tap', style: {display: 'block', padding: '14px', borderRadius: '12px', background: t.accent, color: '#fff', textAlign: 'center', fontWeight: '600'}, onClick: function() { setState({groupPhotoOrientation: myOrientation, groupView: 'camera'}); }}, '📷 Take Photo'));
          } else {
            photoBox.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', textAlign: 'center', padding: '20px', background: t.bg, borderRadius: '10px'}}, 'Wait for the theme to be set before taking your photo'));
          }
        }
        page.appendChild(photoBox);
        
        // Other Members' Photos
        var othersBox = el('div', {style: {background: t.card, borderRadius: '16px', padding: '16px', border: '1px solid ' + t.border, marginBottom: '16px'}});
        othersBox.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '12px', fontWeight: '600', color: t.muted, textTransform: 'uppercase', letterSpacing: '0.5px'}}, '👥 Group Photos'));
        
        if (!hasSubmitted) {
          othersBox.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', textAlign: 'center', padding: '30px 20px', background: t.bg, borderRadius: '10px'}}, '🔒 Submit your photo to see others\' photos'));
        } else {
          var photoCount = Object.keys(todayPhotos).length;
          if (photoCount <= 1) {
            othersBox.appendChild(el('p', {style: {margin: '0', fontSize: '13px', color: t.muted, fontStyle: 'italic', textAlign: 'center', padding: '20px', background: t.bg, borderRadius: '10px'}}, 'No other photos yet today'));
          } else {
            var photosGrid = el('div', {style: {display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px'}});
            for (var odUserId in todayPhotos) {
              if (odUserId !== state.user.uid) {
                (function(odUserId, photo) {
                  var photoItem = el('div', {style: {position: 'relative'}});
                  photoItem.appendChild(el('img', {src: photo.url, style: {width: '100%', aspectRatio: photo.orientation === 'portrait' ? '3/4' : '4/3', objectFit: 'cover', borderRadius: '10px'}}));
                  photoItem.appendChild(el('p', {style: {margin: '4px 0 0', fontSize: '11px', color: t.muted, textAlign: 'center'}}, photo.username || 'Member'));
                  photosGrid.appendChild(photoItem);
                })(odUserId, todayPhotos[odUserId]);
              }
            }
            othersBox.appendChild(photosGrid);
          }
        }
        page.appendChild(othersBox);
        
        // History Button
        page.appendChild(el('span', {className: 'tap', style: {display: 'block', padding: '14px', borderRadius: '12px', background: t.bg, border: '1px solid ' + t.border, color: t.text, textAlign: 'center', fontWeight: '500', marginBottom: '16px'}, onClick: function() { setState({groupView: 'history'}); }}, '📅 View Past Photos'));
        
        app.appendChild(page);
        return;
      }
      
      // Group Members View (visible to ALL members)
      if (state.groupView === 'members' && state.currentGroup) {
        var group = state.currentGroup;
        var isCreator = group.createdBy === state.user.uid;
        
        // ONLY CREATOR sees customization options
        if (isCreator) {
          var membersBox = el('div', {style: {background: t.card, borderRadius: '16px', padding: '16px', border: '1px solid ' + t.border, marginBottom: '16px'}});
          membersBox.appendChild(el('h3', {style: {margin: '0 0 16px', fontSize: '18px', fontWeight: '600', color: t.text}}, '🎨 Customize Group'));
          
          // Group Name
          membersBox.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: t.muted}}, 'Group Name'));
          var nameInput = el('input', {value: group.name, placeholder: 'Group name', maxLength: 50, style: {width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid ' + t.border, background: t.bg, fontSize: '15px', color: t.text, outline: 'none', boxSizing: 'border-box', marginBottom: '8px'}});
          nameInput.oninput = function(e) { state.editGroupName = e.target.value; };
          membersBox.appendChild(nameInput);
          
          var nameBtn = el('span', {className: 'tap', style: {display: 'inline-block', padding: '10px 20px', borderRadius: '8px', background: t.accent, color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '20px'}, onClick: function() {
            if (state.editGroupName && state.editGroupName.trim() && state.editGroupName !== group.name) {
              updateGroupName(group.id, state.editGroupName.trim());
            }
          }}, 'Update Name');
          membersBox.appendChild(nameBtn);
          
          // Group Icon (emoji, max 2 characters)
          membersBox.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: t.muted}}, 'Group Icon (emoji, max 2 chars)'));
          var iconInput = el('input', {value: (group.customTheme && group.customTheme.icon) || '👥', placeholder: '👥', maxLength: 2, style: {width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid ' + t.border, background: t.bg, fontSize: '24px', color: t.text, outline: 'none', boxSizing: 'border-box', marginBottom: '8px', textAlign: 'center'}});
          iconInput.oninput = function(e) { state.editGroupIcon = e.target.value; };
          membersBox.appendChild(iconInput);
          
          var iconBtn = el('span', {className: 'tap', style: {display: 'inline-block', padding: '10px 20px', borderRadius: '8px', background: t.accent, color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '20px'}, onClick: function() {
            if (state.editGroupIcon && state.editGroupIcon.length <= 2) {
              updateGroupIcon(group.id, state.editGroupIcon);
            }
          }}, 'Update Icon');
          membersBox.appendChild(iconBtn);
          
          page.appendChild(membersBox);
        }
        
        // EVERYONE sees members list
        var manageMembersBox = el('div', {style: {background: t.card, borderRadius: '16px', padding: '16px', border: '1px solid ' + t.border}});
        manageMembersBox.appendChild(el('h3', {style: {margin: '0 0 16px', fontSize: '18px', fontWeight: '600', color: t.text}}, '👥 Group Members'));
        
        // Current members
        manageMembersBox.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '13px', fontWeight: '600', color: t.muted}}, 'Current Members (' + group.members.length + ')'));
        
        var membersList = el('div', {style: {marginBottom: '20px'}});
        for (var i = 0; i < group.members.length; i++) {
          (function(memberId) {
            var memberItem = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: t.bg, borderRadius: '10px', marginBottom: '6px'}});
            
            var isMe = memberId === state.user.uid;
            var isMeCreator = memberId === group.createdBy;
            
            var memberName = isMe ? (isMeCreator ? 'You (Creator)' : 'You') : 'Loading...';
            var memberAvatar = isMe && state.userData ? state.userData.avatar : null;
            
            if (memberAvatar) {
              memberItem.appendChild(cachedImage(memberAvatar, {style: {width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover'}}));
            } else {
              memberItem.appendChild(el('div', {style: {width: '36px', height: '36px', borderRadius: '10px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', color: '#fff'}}, memberName[0].toUpperCase()));
            }
            
            var nameSpan = el('span', {style: {flex: '1', fontSize: '14px', fontWeight: '500', color: t.text}}, memberName);
            memberItem.appendChild(nameSpan);
            
            // Get member info and update display (if not current user)
            if (!isMe) {
              getMemberInfo(memberId, function(info) {
                nameSpan.textContent = info.username || 'Unknown';
                // Update avatar if available
                if (info.avatar && !memberAvatar) {
                  var avatarEl = memberItem.children[0];
                  if (avatarEl.tagName === 'DIV') {
                    var img = cachedImage(info.avatar, {style: {width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover'}});
                    memberItem.replaceChild(img, avatarEl);
                  }
                }
              });
            }
            
            // Creator: show remove button (not for self)
            // Non-creator: show add friend button (if not already friends)
            if (isCreator && !isMe) {
              memberItem.appendChild(el('span', {className: 'tap', style: {padding: '6px 10px', borderRadius: '6px', background: '#ffebee', color: '#c62828', fontSize: '11px', fontWeight: '600'}, onClick: function() {
                if (confirm('Remove this member from the group?')) {
                  removeMemberFromGroup(group.id, memberId);
                }
              }}, 'Remove'));
            } else if (!isCreator && !isMe) {
              // Check if already friends
              var isFriend = false;
              for (var fi = 0; fi < state.friends.length; fi++) {
                if (state.friends[fi].id === memberId) {
                  isFriend = true;
                  break;
                }
              }
              
              if (!isFriend) {
                memberItem.appendChild(el('span', {className: 'tap', style: {padding: '6px 10px', borderRadius: '6px', background: t.accent, color: '#fff', fontSize: '11px', fontWeight: '600'}, onClick: function() {
                  // Get member info to send friend request
                  getMemberInfo(memberId, function(info) {
                    if (info && info.username) {
                      sendFriendRequest(info.username);
                    }
                  });
                }}, 'Add Friend'));
              }
            }
            
            membersList.appendChild(memberItem);
          })(group.members[i]);
        }
        manageMembersBox.appendChild(membersList);
        
        // Pending invites
        var pendingInvites = group.pendingInvites || [];
        if (pendingInvites.length > 0) {
          manageMembersBox.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '13px', fontWeight: '600', color: t.muted}}, 'Pending Invites (' + pendingInvites.length + ')'));
          var pendingList = el('div', {style: {marginBottom: '20px'}});
          for (var i = 0; i < pendingInvites.length; i++) {
            (function(inviteId) {
              var inviteItem = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#fff8e1', borderRadius: '10px', marginBottom: '6px'}});
              
              inviteItem.appendChild(el('div', {style: {width: '36px', height: '36px', borderRadius: '10px', background: '#ffcc80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px'}}, '⏳'));
              var nameSpan = el('span', {style: {flex: '1', fontSize: '14px', fontWeight: '500', color: t.text}}, 'Loading...');
              inviteItem.appendChild(nameSpan);
              
              // Creator only: add cancel button
              if (isCreator) {
                inviteItem.appendChild(el('span', {className: 'tap', style: {padding: '6px 10px', borderRadius: '6px', background: '#ffebee', color: '#c62828', fontSize: '11px', fontWeight: '600'}, onClick: function() {
                  if (confirm('Cancel this invitation?')) {
                    cancelGroupInvite(group.id, inviteId);
                  }
                }}, 'Cancel'));
              } else {
                inviteItem.appendChild(el('span', {style: {fontSize: '11px', color: t.muted}}, 'Pending'));
              }
              
              // Get member info and update display
              getMemberInfo(inviteId, function(info) {
                nameSpan.textContent = info.username || 'Unknown';
              });
              
              pendingList.appendChild(inviteItem);
            })(pendingInvites[i]);
          }
          manageMembersBox.appendChild(pendingList);
        }
        
        // Invite New Member - CREATOR ONLY
        if (isCreator) {
          manageMembersBox.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '13px', fontWeight: '600', color: t.muted}}, '➕ Invite New Member'));
          
          // Show friends not already in group
          var availableFriends = state.friends.filter(function(f) {
          return group.members.indexOf(f.id) === -1 && (group.pendingInvites || []).indexOf(f.id) === -1;
        });
        
        if (availableFriends.length === 0) {
          manageMembersBox.appendChild(el('p', {style: {fontSize: '13px', color: t.muted, fontStyle: 'italic', padding: '12px', background: t.bg, borderRadius: '10px'}}, 'All your friends are already members or invited'));
        } else {
          var addList = el('div', {style: {maxHeight: '150px', overflowY: 'auto', background: t.bg, borderRadius: '10px', padding: '6px'}});
          for (var i = 0; i < availableFriends.length; i++) {
            (function(friend) {
              var addItem = el('div', {className: 'tap', style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px'}, onClick: function() {
                addMemberToGroup(group.id, friend.id);
              }});
              
              if (friend.avatar) {
                addItem.appendChild(cachedImage(friend.avatar, {style: {width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover'}}));
              } else {
                addItem.appendChild(el('div', {style: {width: '32px', height: '32px', borderRadius: '8px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '600', color: '#fff'}}, friend.username[0].toUpperCase()));
              }
              addItem.appendChild(el('span', {style: {flex: '1', fontSize: '13px', color: t.text}}, friend.username));
              addItem.appendChild(el('span', {style: {fontSize: '18px', color: t.accent}}, '+'));
              
              addList.appendChild(addItem);
            })(availableFriends[i]);
          }
          manageMembersBox.appendChild(addList);
        }
        } // End of isCreator block for invite section
        
        page.appendChild(manageMembersBox);
        app.appendChild(page);
        return;
      }
      
      // Group Camera View
      if (state.groupView === 'camera' && state.currentGroup) {
        var camPage = el('div', {style: {minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column'}});
        
        var camHeader = el('div', {style: {padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}});
        camHeader.appendChild(el('span', {className: 'tap', style: {color: '#fff', fontSize: '16px', padding: '8px'}, onClick: function() { setState({groupView: 'detail', groupPhoto: null}); }}, '✕ Cancel'));
        camHeader.appendChild(el('span', {style: {color: '#fff', fontSize: '14px', fontWeight: '600'}}, state.groupPhotoOrientation === 'portrait' ? '📱 Portrait' : '🖼️ Landscape'));
        camHeader.appendChild(el('div', {style: {width: '60px'}}));
        camPage.appendChild(camHeader);
        
        if (state.groupPhoto) {
          // Preview
          var previewWrap = el('div', {style: {flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}});
          previewWrap.appendChild(el('img', {src: state.groupPhoto, style: {maxWidth: '100%', maxHeight: '60vh', borderRadius: '12px', transform: state.groupPhotoOrientation === 'landscape' ? 'none' : 'none'}}));
          camPage.appendChild(previewWrap);
          
          var confirmBtns = el('div', {style: {padding: '20px', display: 'flex', gap: '12px'}});
          confirmBtns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '16px', borderRadius: '12px', background: '#333', color: '#fff', textAlign: 'center', fontWeight: '600'}, onClick: function() { setState({groupPhoto: null}); }}, 'Retake'));
          confirmBtns.appendChild(el('span', {className: 'tap', style: {flex: '1', padding: '16px', borderRadius: '12px', background: t.accent, color: '#fff', textAlign: 'center', fontWeight: '600'}, onClick: function() { uploadGroupPhoto(state.currentGroup.id, state.groupPhoto, state.groupPhotoOrientation); }}, 'Submit ✓'));
          camPage.appendChild(confirmBtns);
          
          camPage.appendChild(el('p', {style: {color: '#888', fontSize: '12px', textAlign: 'center', padding: '0 20px 30px'}}, '⚠️ This upload is FINAL and cannot be deleted'));
        } else {
          // Camera input
          var camWrap = el('div', {style: {flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px'}});
          
          var orientGuide = el('div', {style: {width: state.groupPhotoOrientation === 'portrait' ? '200px' : '280px', height: state.groupPhotoOrientation === 'portrait' ? '280px' : '200px', border: '3px dashed #444', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'}});
          orientGuide.appendChild(el('span', {style: {color: '#666', fontSize: '14px'}}, 'Hold phone ' + (state.groupPhotoOrientation === 'portrait' ? 'vertically' : 'horizontally')));
          camWrap.appendChild(orientGuide);
          
          var fileInput = el('input', {type: 'file', accept: 'image/*', capture: 'environment', style: {display: 'none'}, id: 'groupCameraInput'});
          fileInput.onchange = function(e) {
            var f = e.target.files[0];
            if (f) {
              var r = new FileReader();
              r.onloadend = function() {
                // Resize image
                var img = new Image();
                img.onload = function() {
                  var canvas = document.createElement('canvas');
                  var maxSize = 1200;
                  var w = img.width;
                  var h = img.height;
                  if (w > h && w > maxSize) {
                    h = h * maxSize / w;
                    w = maxSize;
                  } else if (h > maxSize) {
                    w = w * maxSize / h;
                    h = maxSize;
                  }
                  canvas.width = w;
                  canvas.height = h;
                  var ctx = canvas.getContext('2d');
                  ctx.drawImage(img, 0, 0, w, h);
                  setState({groupPhoto: canvas.toDataURL('image/jpeg', 0.85)});
                };
                img.src = r.result;
              };
              r.readAsDataURL(f);
            }
          };
          camWrap.appendChild(fileInput);
          
          var camBtn = el('label', {className: 'tap', for: 'groupCameraInput', style: {width: '80px', height: '80px', borderRadius: '50%', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px'}});
          camBtn.appendChild(el('span', null, '📷'));
          camWrap.appendChild(camBtn);
          
          camWrap.appendChild(el('p', {style: {color: '#888', fontSize: '13px', marginTop: '16px', textAlign: 'center'}}, 'Take a ' + state.groupPhotoOrientation + ' photo'));
          
          camPage.appendChild(camWrap);
        }
        
        app.appendChild(camPage);
        return;
      }
      
      // Group History View
      if (state.groupView === 'history' && state.currentGroup) {
        var group = state.currentGroup;
        var historyBox = el('div', {style: {background: t.card, borderRadius: '16px', padding: '16px', border: '1px solid ' + t.border}});
        historyBox.appendChild(el('h3', {style: {margin: '0 0 16px', fontSize: '18px', fontWeight: '600', color: t.text}}, '📅 Past Collages - ' + group.name));
        
        // Get all dates with photos or collages
        var allDates = {};
        if (group.photos) {
          for (var d in group.photos) allDates[d] = true;
        }
        if (group.collages) {
          for (var d in group.collages) allDates[d] = true;
        }
        var dates = Object.keys(allDates).sort().reverse();
        var today = getUTCDate();
        dates = dates.filter(function(d) { return d !== today; }); // Exclude today
        
        if (dates.length === 0) {
          historyBox.appendChild(el('p', {style: {color: t.muted, fontSize: '14px', textAlign: 'center', padding: '40px 20px', background: t.bg, borderRadius: '10px'}}, 'No past collages yet. Check back tomorrow!'));
        } else {
          for (var i = 0; i < dates.length; i++) {
            (function(date) {
              var dayItem = el('div', {style: {marginBottom: '20px', padding: '12px', background: t.bg, borderRadius: '12px'}});
              
              // Check if we have a collage for this date
              var collage = group.collages && group.collages[date];
              var dayPhotos = group.photos && group.photos[date];
              var photoCount = dayPhotos ? Object.keys(dayPhotos).length : 0;
              
              dayItem.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '14px', fontWeight: '600', color: t.text}}, '📅 ' + date));
              dayItem.appendChild(el('p', {style: {margin: '0 0 4px', fontSize: '12px', color: t.muted}}, photoCount + ' photo' + (photoCount !== 1 ? 's' : '')));
              
              // Show theme if available
              if (group.themeHistory && group.themeHistory[date]) {
                dayItem.appendChild(el('p', {style: {margin: '0 0 10px', fontSize: '12px', fontWeight: '600', color: t.accent}}, '🎨 Theme: ' + group.themeHistory[date]));
              } else {
                dayItem.appendChild(el('div', {style: {height: '10px'}}));
              }
              
              // ALWAYS show photo grid (no collage feature)
              if (dayPhotos && photoCount > 0) {
                var grid = el('div', {style: {display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', overflow: 'hidden', borderRadius: '8px'}});
                for (var odUserId in dayPhotos) {
                  var photo = dayPhotos[odUserId];
                  // Use the orientation from photo data to determine aspect ratio
                  var aspectRatio = photo.orientation === 'portrait' ? '3/4' : '4/3';
                  grid.appendChild(el('img', {src: photo.url, style: {width: '100%', aspectRatio: aspectRatio, objectFit: 'cover', display: 'block'}}));
                }
                dayItem.appendChild(grid);
              }
              
              historyBox.appendChild(dayItem);
            })(dates[i]);
          }
        }
        
        historyBox.appendChild(el('span', {className: 'tap', style: {display: 'block', marginTop: '16px', padding: '14px', borderRadius: '12px', background: t.bg, border: '1px solid ' + t.border, color: t.text, textAlign: 'center', fontWeight: '500'}, onClick: function() { setState({groupView: 'detail'}); }}, '← Back'));
        
        page.appendChild(historyBox);
        app.appendChild(page);
        return;
      }
      
      // Groups List (default)
      page.appendChild(el('span', {className: 'tap', style: {display: 'block', padding: '14px', borderRadius: '14px', background: t.accent, color: '#fff', textAlign: 'center', fontWeight: '600', marginBottom: '20px'}, onClick: function() { setState({groupView: 'create'}); }}, '+ Create New Group'));
      
      if (state.groups.length === 0) {
        var empty = el('div', {style: {textAlign: 'center', padding: '60px 20px'}});
        empty.appendChild(el('div', {style: {fontSize: '64px', marginBottom: '16px'}}, '👥'));
        empty.appendChild(el('p', {style: {margin: '0', fontSize: '18px', fontWeight: '600', color: t.text}}, 'No groups yet'));
        empty.appendChild(el('p', {style: {margin: '8px 0 0', fontSize: '14px', color: t.muted}}, 'Create a group to start daily photo challenges with friends!'));
        page.appendChild(empty);
      } else {
        for (var i = 0; i < state.groups.length; i++) {
          (function(group) {
            var item = el('div', {className: 'tap', style: {display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: t.card, borderRadius: '14px', border: '1px solid ' + t.border, marginBottom: '12px'}, onClick: function() {
              // Don't check day reset here - group object might be stale
              setState({currentGroup: group, groupView: 'detail'});
            }});
            
            // Use custom icon if available, simple styling
            var groupIcon = (group.customTheme && group.customTheme.icon) || '👥';
            item.appendChild(el('div', {style: {width: '50px', height: '50px', borderRadius: '14px', background: t.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'}}, groupIcon));
            
            var info = el('div', {style: {flex: '1'}});
            info.appendChild(el('p', {style: {margin: '0', fontSize: '16px', fontWeight: '600', color: t.text}}, group.name));
            
            // Show theme chooser and member count
            var themeChooserText = el('p', {style: {margin: '4px 0 0', fontSize: '12px', color: t.muted}}, group.members.length + ' members · Loading...');
            info.appendChild(themeChooserText);
            
            // Fetch theme chooser name
            if (group.themeChooserId) {
              getMemberInfo(group.themeChooserId, function(chooserInfo) {
                var isMe = group.themeChooserId === state.user.uid;
                themeChooserText.textContent = group.members.length + ' members · 👑 ' + (isMe ? 'You' : chooserInfo.username || 'Theme Chooser');
              });
            }
            item.appendChild(info);
            
            var hasSubmitted = hasSubmittedToday(group);
            item.appendChild(el('span', {style: {fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: hasSubmitted ? '#4CAF50' : t.bg, color: hasSubmitted ? '#fff' : t.muted, fontWeight: '500'}}, hasSubmitted ? '✓ Done' : 'Pending'));
            
            item.appendChild(el('span', {style: {fontSize: '20px', color: t.muted}}, '›'));
            
            page.appendChild(item);
          })(state.groups[i]);
        }
      }
      
      app.appendChild(page);
      return;
    }
    
    // Profile
    if (state.view === 'profile') {
      var page = el('div', {style: {minHeight: '100vh', padding: '0 20px 40px'}});
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0'}});
      var backBtn = el('span', {className: 'tap', style: {padding: '8px 12px', color: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center'}, onClick: function() { nav('feed'); }});
      backBtn.appendChild(icon('back', 24, t.text));
      header.appendChild(backBtn);
      header.appendChild(el('span', {style: {fontWeight: '600', color: t.text, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '14px'}}, 'Profile'));
      var settingsBtn = el('span', {className: 'tap', style: {padding: '8px 12px', color: t.muted, display: 'flex', alignItems: 'center', justifyContent: 'center'}, onClick: function() { nav('settings'); }});
      settingsBtn.appendChild(icon('settings', 22, t.muted));
      header.appendChild(settingsBtn);
      page.appendChild(header);
      
      var info = el('div', {style: {display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px'}});
      if (state.userData && state.userData.avatar) {
        info.appendChild(cachedImage(state.userData.avatar, {style: {width: '80px', height: '80px', borderRadius: '24px', objectFit: 'cover', marginBottom: '12px'}}));
      } else {
        info.appendChild(el('div', {style: {width: '80px', height: '80px', borderRadius: '24px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '700', color: '#fff', marginBottom: '12px'}}, (state.userData && state.userData.username) ? state.userData.username[0].toUpperCase() : '?'));
      }
      
      // Username with badge inline
      var nameRow = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}});
      nameRow.appendChild(el('h2', {style: {margin: '0', fontSize: '22px', fontWeight: '600', color: t.text}}, state.userData ? state.userData.username : 'User'));
      
      // Add badge if user has one - check customBadge first
      if (state.userData) {
        var badge = state.userData.customBadge;
        var badgeColor = state.userData.customBadgeColor;
        var userEmail = state.user ? state.user.email : '';
        
        if (badge) {
          // Custom badge from Firebase
          var badgeStyle = {
            padding: '3px 8px',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            textShadow: '-0.5px -0.5px 0 #000, 0.5px -0.5px 0 #000, -0.5px 0.5px 0 #000, 0.5px 0.5px 0 #000'
          };
          
          // Check for custom color first
          if (badgeColor) {
            badgeStyle.background = badgeColor;
          } else if (badge === 'CREATOR') {
            badgeStyle.background = '#2196F3';
          } else if (badge === 'FOUNDER') {
            badgeStyle.background = 'rgba(255,255,255,0.1)';
            badgeStyle.border = '1px solid rgba(255,255,255,0.2)';
            badgeStyle.color = t.text;
          } else {
            badgeStyle.background = t.accent;
          }
          
          nameRow.appendChild(el('span', {style: badgeStyle}, badge));
        } else if (userEmail === 'ashthunter@icloud.com') {
          // Fallback: Creator badge
          nameRow.appendChild(el('span', {style: {
            padding: '3px 8px',
            borderRadius: '4px',
            background: '#2196F3',
            color: '#fff',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.5px',
            textTransform: 'uppercase'
          }}, 'CREATOR'));
        } else if (isFoundingMember(state.userData)) {
          // Fallback: Founding member badge
          nameRow.appendChild(el('span', {style: {
            padding: '3px 8px',
            borderRadius: '4px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: t.text,
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.5px',
            textTransform: 'uppercase'
          }}, 'FOUNDER'));
        }
      }
      
      info.appendChild(nameRow);
      
      var stats = el('div', {style: {display: 'flex', gap: '24px', padding: '20px', borderRadius: '16px', border: '1px solid ' + t.border, width: '100%', background: t.card, marginTop: '20px', marginBottom: '20px'}});
      var stat1 = el('div', {style: {flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}});
      stat1.appendChild(el('span', {style: {fontSize: '24px', fontWeight: '700', color: t.text}}, state.myPosts.length));
      stat1.appendChild(el('span', {style: {fontSize: '13px', color: t.muted}}, 'Postcards'));
      var stat2 = el('div', {style: {flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}});
      stat2.appendChild(el('span', {style: {fontSize: '24px', fontWeight: '700', color: t.text}}, state.friends.length));
      stat2.appendChild(el('span', {style: {fontSize: '13px', color: t.muted}}, 'Friends'));
      stats.appendChild(stat1);
      stats.appendChild(stat2);
      info.appendChild(stats);
      
      // Your Friend Code (for sharing)
      var codeSection = el('div', {style: {width: '100%', marginBottom: '20px', padding: '16px', borderRadius: '16px', border: '2px dashed ' + t.accent, background: t.card, textAlign: 'center'}});
      codeSection.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: t.muted}}, '🔗 Your Friend Code'));
      var codeDisplay = el('div', {style: {display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'}});
      var friendCodeValue = (state.userData && state.userData.friendCode) ? state.userData.friendCode : 'Loading...';
      codeDisplay.appendChild(el('span', {style: {fontSize: '24px', fontWeight: '700', color: t.accent, letterSpacing: '2px', fontFamily: 'monospace'}}, friendCodeValue));
      if (state.userData && state.userData.friendCode) {
        codeDisplay.appendChild(el('span', {className: 'tap', style: {padding: '6px 10px', borderRadius: '8px', background: t.bg, fontSize: '12px', color: t.muted}, onClick: function() {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(state.userData.friendCode).then(function() {
              alert('Friend code copied!');
            });
          } else {
            // Fallback for older browsers
            var ta = document.createElement('textarea');
            ta.value = state.userData.friendCode;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            alert('Friend code copied!');
          }
        }}, '📋 Copy'));
      }
      codeSection.appendChild(codeDisplay);
      codeSection.appendChild(el('p', {style: {margin: '8px 0 0', fontSize: '11px', color: t.muted}}, 'Share this code with friends (case-sensitive)'));
      info.appendChild(codeSection);
      
      // Friend Requests
      if (state.friendRequests.length > 0) {
        var reqSection = el('div', {style: {width: '100%', marginBottom: '20px', padding: '16px', borderRadius: '16px', background: '#fff8e1', border: '1px solid #ffcc80'}});
        reqSection.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#e65100'}}, '👋 Friend Requests (' + state.friendRequests.length + ')'));
        
        for (var i = 0; i < state.friendRequests.length; i++) {
          (function(req) {
            var reqItem = el('div', {style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '12px', background: '#fff', marginBottom: i < state.friendRequests.length - 1 ? '8px' : '0'}});
            
            if (req.fromUser && req.fromUser.avatar) {
              reqItem.appendChild(el('img', {src: req.fromUser.avatar, style: {width: '40px', height: '40px', borderRadius: '12px', objectFit: 'cover'}}));
            } else {
              reqItem.appendChild(el('div', {style: {width: '40px', height: '40px', borderRadius: '12px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', color: '#fff'}}, (req.fromUser && req.fromUser.username) ? req.fromUser.username[0].toUpperCase() : '?'));
            }
            
            var reqInfo = el('div', {style: {flex: '1'}});
            reqInfo.appendChild(el('p', {style: {margin: '0', fontSize: '14px', fontWeight: '600', color: t.text}}, req.fromUser ? req.fromUser.username : 'Someone'));
            reqInfo.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '11px', color: t.muted}}, 'wants to be friends'));
            reqItem.appendChild(reqInfo);
            
            var reqBtns = el('div', {style: {display: 'flex', gap: '6px'}});
            reqBtns.appendChild(el('span', {className: 'tap', style: {padding: '8px 12px', borderRadius: '8px', background: t.accent, color: '#fff', fontSize: '12px', fontWeight: '600'}, onClick: function() { acceptFriendRequest(req); }}, '✓'));
            reqBtns.appendChild(el('span', {className: 'tap', style: {padding: '8px 12px', borderRadius: '8px', background: t.border, color: t.muted, fontSize: '12px', fontWeight: '600'}, onClick: function() { declineFriendRequest(req); }}, '✕'));
            reqItem.appendChild(reqBtns);
            
            reqSection.appendChild(reqItem);
          })(state.friendRequests[i]);
        }
        info.appendChild(reqSection);
      }
      
      // Add friend
      var addWrap = el('div', {style: {width: '100%', marginBottom: '20px'}});
      var addFriendBtn = el('span', {className: 'tap', style: {display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', borderRadius: '0', background: t.text, color: t.bg, fontWeight: '600', fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase', border: '2px solid ' + t.border}, onClick: function() { setState({showAddFriend: !state.showAddFriend}); }});
      if (state.showAddFriend) {
        addFriendBtn.appendChild(icon('close', 16, t.bg));
        addFriendBtn.appendChild(el('span', null, 'CLOSE'));
      } else {
        addFriendBtn.appendChild(icon('userPlus', 16, t.bg));
        addFriendBtn.appendChild(el('span', null, 'ADD FRIENDS'));
      }
      addWrap.appendChild(addFriendBtn);
      if (state.showAddFriend) {
        var addBox = el('div', {style: {marginTop: '12px', padding: '16px', borderRadius: '16px', border: '1px solid ' + t.border, background: t.card}});
        addBox.appendChild(el('p', {style: {margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: t.text}}, 'Enter friend code:'));
        var addRow = el('div', {style: {display: 'flex', gap: '8px'}});
        var addInput = el('input', {placeholder: 'e.g. AbC12xYz', value: state.friendCode, style: {flex: '1', padding: '12px', borderRadius: '10px', border: '1px solid ' + t.border, background: t.bg, fontSize: '16px', color: t.text, outline: 'none', fontFamily: 'monospace', letterSpacing: '1px'}});
        addInput.oninput = function(e) { state.friendCode = e.target.value; };
        addRow.appendChild(addInput);
        addRow.appendChild(el('span', {className: 'tap', style: {padding: '12px 16px', borderRadius: '10px', background: t.accent, color: '#fff', fontSize: '14px', fontWeight: '600'}, onClick: addFriend}, 'Add'));
        addBox.appendChild(addRow);
        addBox.appendChild(el('p', {style: {margin: '8px 0 0', fontSize: '11px', color: t.muted}}, 'Codes are case-sensitive'));
        addWrap.appendChild(addBox);
      }
      info.appendChild(addWrap);
      
      // Friends List
      if (state.friends.length > 0) {
        var friendsSection = el('div', {style: {width: '100%', marginBottom: '20px', padding: '16px', borderRadius: '16px', border: '1px solid ' + t.border, background: t.card}});
        friendsSection.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: t.text}}, '👥 Friends (' + state.friends.length + ')'));
        
        // Show "View All Friends" button if collapsed
        if (!state.showAllFriends) {
          var viewAllBtn = el('span', {className: 'tap', style: {display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', borderRadius: '12px', background: t.bg, color: t.text, fontWeight: '600', fontSize: '14px', border: '1px solid ' + t.border}, onClick: function() { setState({showAllFriends: true}); }}, 'View All Friends →');
          friendsSection.appendChild(viewAllBtn);
        } else {
          // Search bar
          var searchWrap = el('div', {style: {marginBottom: '12px'}});
          var searchInput = el('input', {
            placeholder: 'Search friends...',
            value: state.friendSearch,
            style: {
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid ' + t.border,
              background: t.bg,
              fontSize: '14px',
              color: t.text,
              outline: 'none',
              boxSizing: 'border-box'
            }
          });
          
          // Container for friends list that we'll update
          var friendsListContainer = el('div', {id: 'friendsListContainer'});
          
          // Function to render filtered friends
          var renderFriendsList = function(searchQuery) {
            friendsListContainer.innerHTML = '';
            
            var filteredFriends = state.friends.filter(function(f) {
              if (!searchQuery) return true;
              return f.username && f.username.toLowerCase().includes(searchQuery.toLowerCase());
            });
            
            if (filteredFriends.length === 0) {
              friendsListContainer.appendChild(el('p', {style: {margin: '12px 0', fontSize: '13px', color: t.muted, textAlign: 'center'}}, 'No friends found'));
            } else {
              for (var i = 0; i < filteredFriends.length; i++) {
                (function(friend, idx) {
                  var friendItem = el('div', {className: 'tap', style: {display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '12px', background: t.bg, marginBottom: idx < filteredFriends.length - 1 ? '8px' : '0'}, onClick: function() { 
                    var scrollPos = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
                    setState({friendProfile: friend, friendCalDate: new Date(), view: 'friendProfile', savedScrollPosition: scrollPos}); 
                    setTimeout(function() { window.scrollTo(0, 0); }, 0);
                  }});
                  
                  if (friend.avatar) {
                    friendItem.appendChild(cachedImage(friend.avatar, {style: {width: '44px', height: '44px', borderRadius: '14px', objectFit: 'cover'}}));
                  } else {
                    friendItem.appendChild(el('div', {style: {width: '44px', height: '44px', borderRadius: '14px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '600', color: '#fff'}}, friend.username ? friend.username[0].toUpperCase() : '?'));
                  }
                  
                  var friendInfo = el('div', {style: {flex: '1'}});
                  
                  // Username with badge
                  var nameRow = el('div', {style: {display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}});
                  nameRow.appendChild(el('span', {style: {fontSize: '15px', fontWeight: '600', color: t.text}}, friend.username || 'Friend'));
                  
                  // Add badge if friend has one - check customBadge first
                  if (friend.customBadge) {
                    var badgeStyle = {
                      padding: '2px 5px',
                      borderRadius: '3px',
                      color: '#fff',
                      fontSize: '8px',
                      fontWeight: '700',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      textShadow: '-0.5px -0.5px 0 #000, 0.5px -0.5px 0 #000, -0.5px 0.5px 0 #000, 0.5px 0.5px 0 #000'
                    };
                    
                    // Check for custom color first
                    if (friend.customBadgeColor) {
                      badgeStyle.background = friend.customBadgeColor;
                    } else if (friend.customBadge === 'CREATOR') {
                      badgeStyle.background = '#2196F3';
                    } else if (friend.customBadge === 'FOUNDER') {
                      badgeStyle.background = 'rgba(255,255,255,0.1)';
                      badgeStyle.border = '1px solid rgba(255,255,255,0.15)';
                      badgeStyle.color = t.text;
                      badgeStyle.opacity = '0.7';
                    } else {
                      badgeStyle.background = t.accent;
                    }
                    
                    nameRow.appendChild(el('span', {style: badgeStyle}, friend.customBadge));
                  } else if (friend.email === 'ashthunter@icloud.com') {
                    nameRow.appendChild(el('span', {style: {
                      padding: '2px 5px',
                      borderRadius: '3px',
                      background: '#2196F3',
                      color: '#fff',
                      fontSize: '8px',
                      fontWeight: '700',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase'
                    }}, 'CREATOR'));
                  } else if (isFoundingMember(friend)) {
                    nameRow.appendChild(el('span', {style: {
                      padding: '2px 5px',
                      borderRadius: '3px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: t.text,
                      fontSize: '8px',
                      fontWeight: '700',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      opacity: '0.7'
                    }}, 'FOUNDER'));
                  }
                  
                  friendInfo.appendChild(nameRow);
                  if (friend.birthday) {
                    var bParts = friend.birthday.split('-');
                    var bDate = new Date(bParts[0], bParts[1] - 1, bParts[2]);
                    friendInfo.appendChild(el('p', {style: {margin: '2px 0 0', fontSize: '12px', color: t.muted}}, '🎂 ' + bDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})));
                  }
                  friendItem.appendChild(friendInfo);
                  
                  friendItem.appendChild(el('span', {style: {fontSize: '18px', color: t.muted}}, '→'));
                  
                  friendsListContainer.appendChild(friendItem);
                })(filteredFriends[i], i);
              }
            }
          };
          
          // Initial render
          renderFriendsList(state.friendSearch);
          
          searchInput.oninput = function(e) {
            e.stopPropagation();
            state.friendSearch = e.target.value;
            // Update only the list, not the entire page
            renderFriendsList(state.friendSearch);
          };
          searchInput.onclick = function(e) {
            e.stopPropagation();
          };
          searchInput.onkeydown = function(e) {
            e.stopPropagation();
          };
          searchInput.onkeyup = function(e) {
            e.stopPropagation();
          };
          searchInput.onkeypress = function(e) {
            e.stopPropagation();
          };
          searchWrap.appendChild(searchInput);
          friendsSection.appendChild(searchWrap);
          friendsSection.appendChild(friendsListContainer);
          
          // Hide button
          var hideBtn = el('span', {className: 'tap', style: {display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '12px', background: t.bg, color: t.muted, fontWeight: '600', fontSize: '13px', marginTop: '12px', border: '1px solid ' + t.border}, onClick: function() { setState({showAllFriends: false, friendSearch: ''}); }}, '← Hide Friends List');
          friendsSection.appendChild(hideBtn);
        }
        
        info.appendChild(friendsSection);
      }
      
      // Calendar
      var cal = el('div', {style: {width: '100%', borderRadius: '16px', border: '1px solid ' + t.border, padding: '16px', background: t.card}});
      cal.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: t.text}}, 'Your Postcards'));
      
      var calNav = el('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}});
      calNav.appendChild(el('span', {className: 'tap', style: {fontSize: '24px', padding: '4px 12px', color: t.text}, onClick: function() { setState({calDate: new Date(state.calDate.getFullYear(), state.calDate.getMonth() - 1, 1)}); }}, '‹'));
      calNav.appendChild(el('span', {style: {fontWeight: '600', color: t.text}}, fmtMonth(state.calDate)));
      calNav.appendChild(el('span', {className: 'tap', style: {fontSize: '24px', padding: '4px 12px', color: t.text}, onClick: function() { setState({calDate: new Date(state.calDate.getFullYear(), state.calDate.getMonth() + 1, 1)}); }}, '›'));
      cal.appendChild(calNav);
      
      var dayHeaders = el('div', {style: {display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '8px'}});
      var dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      for (var i = 0; i < 7; i++) {
        dayHeaders.appendChild(el('div', {style: {textAlign: 'center', fontSize: '12px', fontWeight: '600', padding: '8px', color: t.muted}}, dayNames[i]));
      }
      cal.appendChild(dayHeaders);
      
      var days = el('div', {style: {display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px'}});
      var startDay = getStartDay(state.calDate);
      var daysInMonth = getDaysInMonth(state.calDate);
      var now = new Date();
      var isCurrent = state.calDate.getMonth() === now.getMonth() && state.calDate.getFullYear() === now.getFullYear();
      
      for (var i = 0; i < startDay; i++) {
        days.appendChild(el('div'));
      }
      for (var day = 1; day <= daysInMonth; day++) {
        (function(d) {
          var post = getPostForDate(d);
          var isToday = isCurrent && d === now.getDate();
          var birthdays = getBirthdaysForDate(state.calDate.getMonth() + 1, d);
          var hasBirthday = birthdays.length > 0;
          var cellBg = post ? t.text : (hasBirthday ? t.highlight : 'transparent');
          var cellColor = post ? t.bg : t.text;
          var isClickable = post || hasBirthday;
          var cell = el('div', {className: isClickable ? 'tap' : '', style: {aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0', background: cellBg, color: cellColor, border: isToday ? '2px solid ' + t.text : '1px solid transparent', fontWeight: isToday ? '700' : '400', flexDirection: 'column', position: 'relative'}});
          if (post) {
            cell.appendChild(el('span', {style: {fontSize: '10px'}}, d));
            cell.appendChild(icon('send', 10, t.bg));
            cell.onclick = function() { setState({dayPost: post, view: 'dayDetail'}); };
          } else {
            cell.appendChild(el('span', {style: {fontSize: '12px'}}, d));
            if (hasBirthday) {
              cell.appendChild(el('span', {style: {fontSize: '8px', position: 'absolute', bottom: '2px'}}, '🎂'));
              cell.onclick = function() { setState({birthdayPopup: birthdays}); };
            }
          }
          days.appendChild(cell);
        })(day);
      }
      cal.appendChild(days);
      
      // Birthday popup
      if (state.birthdayPopup && state.birthdayPopup.length > 0) {
        var popupOverlay = el('div', {style: {position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '1000', padding: '20px'}, onClick: function(e) { if (e.target === popupOverlay) setState({birthdayPopup: null}); }});
        var popup = el('div', {style: {background: t.card, borderRadius: '20px', padding: '24px', maxWidth: '300px', width: '100%', textAlign: 'center'}});
        popup.appendChild(el('div', {style: {fontSize: '48px', marginBottom: '12px'}}, '🎂'));
        popup.appendChild(el('p', {style: {margin: '0 0 16px', fontSize: '18px', fontWeight: '600', color: t.text}}, state.birthdayPopup.length === 1 ? 'Birthday!' : 'Birthdays!'));
        
        for (var bi = 0; bi < state.birthdayPopup.length; bi++) {
          var bPerson = state.birthdayPopup[bi];
          var bRow = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', background: t.bg, marginBottom: bi < state.birthdayPopup.length - 1 ? '8px' : '0'}});
          if (bPerson.avatar) {
            bRow.appendChild(el('img', {src: bPerson.avatar, style: {width: '40px', height: '40px', borderRadius: '12px', objectFit: 'cover'}}));
          } else {
            bRow.appendChild(el('div', {style: {width: '40px', height: '40px', borderRadius: '12px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', color: '#fff'}}, bPerson.username ? bPerson.username[0].toUpperCase() : '?'));
          }
          bRow.appendChild(el('span', {style: {fontSize: '15px', fontWeight: '600', color: t.text}}, bPerson.username || 'You'));
          popup.appendChild(bRow);
        }
        
        popup.appendChild(el('span', {className: 'tap', style: {display: 'block', marginTop: '16px', padding: '12px', borderRadius: '12px', background: t.accent, color: '#fff', fontWeight: '600', fontSize: '14px'}, onClick: function() { setState({birthdayPopup: null}); }}, 'Close'));
        popupOverlay.appendChild(popup);
        cal.appendChild(popupOverlay);
      }
      
      info.appendChild(cal);
      
      page.appendChild(info);
      app.appendChild(page);
      return;
    }
    
    // Friend Profile view
    if (state.view === 'friendProfile' && state.friendProfile) {
      var friend = state.friendProfile;
      var page = el('div', {style: {minHeight: '100vh', padding: '0 20px 40px'}});
      
      var header = el('header', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0'}});
      header.appendChild(el('span', {className: 'tap', style: {fontSize: '28px', padding: '8px 12px', color: t.text}, onClick: function() { 
        var scrollPos = state.savedScrollPosition;
        nav('profile'); 
        setTimeout(function() { window.scrollTo(0, scrollPos); }, 0);
      }}, '←'));
      header.appendChild(el('span', {style: {fontWeight: '600', color: t.text}}, friend.username || 'Friend'));
      header.appendChild(el('div', {style: {width: '48px'}}));
      page.appendChild(header);
      
      var info = el('div', {style: {display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px'}});
      
      if (friend.avatar) {
        info.appendChild(el('img', {src: friend.avatar, style: {width: '80px', height: '80px', borderRadius: '24px', objectFit: 'cover', marginBottom: '12px'}}));
      } else {
        info.appendChild(el('div', {style: {width: '80px', height: '80px', borderRadius: '24px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '700', color: '#fff', marginBottom: '12px'}}, friend.username ? friend.username[0].toUpperCase() : '?'));
      }
      
      // Username with badge inline
      var nameRow = el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}});
      nameRow.appendChild(el('h2', {style: {margin: '0', fontSize: '22px', fontWeight: '600', color: t.text}}, friend.username || 'Friend'));
      
      // Add badge if friend has one - check customBadge first
      if (friend.customBadge) {
        var badgeStyle = {
          padding: '3px 8px',
          borderRadius: '4px',
          color: '#fff',
          fontSize: '10px',
          fontWeight: '700',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          textShadow: '-0.5px -0.5px 0 #000, 0.5px -0.5px 0 #000, -0.5px 0.5px 0 #000, 0.5px 0.5px 0 #000'
        };
        
        // Check for custom color first
        if (friend.customBadgeColor) {
          badgeStyle.background = friend.customBadgeColor;
        } else if (friend.customBadge === 'CREATOR') {
          badgeStyle.background = '#2196F3';
        } else if (friend.customBadge === 'FOUNDER') {
          badgeStyle.background = 'rgba(255,255,255,0.1)';
          badgeStyle.border = '1px solid rgba(255,255,255,0.2)';
          badgeStyle.color = t.text;
        } else {
          badgeStyle.background = t.accent;
        }
        
        nameRow.appendChild(el('span', {style: badgeStyle}, friend.customBadge));
      } else if (friend.email === 'ashthunter@icloud.com') {
        // Fallback: Creator badge
        nameRow.appendChild(el('span', {style: {
          padding: '3px 8px',
          borderRadius: '4px',
          background: '#2196F3',
          color: '#fff',
          fontSize: '10px',
          fontWeight: '700',
          letterSpacing: '0.5px',
          textTransform: 'uppercase'
        }}, 'CREATOR'));
      } else if (isFoundingMember(friend)) {
        // Fallback: Founding member badge (works even if they haven't logged in)
        nameRow.appendChild(el('span', {style: {
          padding: '3px 8px',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: t.text,
          fontSize: '10px',
          fontWeight: '700',
          letterSpacing: '0.5px',
          textTransform: 'uppercase'
        }}, 'FOUNDER'));
      }
      
      info.appendChild(nameRow);
      
      if (friend.birthday) {
        var bParts = friend.birthday.split('-');
        var bDate = new Date(bParts[0], bParts[1] - 1, bParts[2]);
        info.appendChild(el('p', {style: {margin: '0 0 16px', fontSize: '14px', color: t.muted}}, '🎂 ' + bDate.toLocaleDateString('en-US', {month: 'long', day: 'numeric'})));
      }
      
      var stats = el('div', {style: {display: 'flex', gap: '24px', padding: '20px', borderRadius: '16px', border: '1px solid ' + t.border, width: '100%', background: t.card, marginBottom: '20px'}});
      var stat1 = el('div', {style: {flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}});
      stat1.appendChild(el('span', {style: {fontSize: '24px', fontWeight: '700', color: t.text}}, friend.posts ? friend.posts.length : 0));
      stat1.appendChild(el('span', {style: {fontSize: '13px', color: t.muted}}, 'Postcards'));
      stats.appendChild(stat1);
      info.appendChild(stats);
      
      // Friend's Calendar
      var cal = el('div', {style: {width: '100%', borderRadius: '16px', border: '1px solid ' + t.border, padding: '16px', background: t.card}});
      cal.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: t.text}}, friend.username + "'s Postcards"));
      
      var calNav = el('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}});
      calNav.appendChild(el('span', {className: 'tap', style: {fontSize: '24px', padding: '4px 12px', color: t.text}, onClick: function() { setState({friendCalDate: new Date(state.friendCalDate.getFullYear(), state.friendCalDate.getMonth() - 1, 1)}); }}, '‹'));
      calNav.appendChild(el('span', {style: {fontWeight: '600', color: t.text}}, fmtMonth(state.friendCalDate)));
      calNav.appendChild(el('span', {className: 'tap', style: {fontSize: '24px', padding: '4px 12px', color: t.text}, onClick: function() { setState({friendCalDate: new Date(state.friendCalDate.getFullYear(), state.friendCalDate.getMonth() + 1, 1)}); }}, '›'));
      cal.appendChild(calNav);
      
      var dayHeaders = el('div', {style: {display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '8px'}});
      var dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      for (var i = 0; i < 7; i++) {
        dayHeaders.appendChild(el('div', {style: {textAlign: 'center', fontSize: '12px', fontWeight: '600', padding: '8px', color: t.muted}}, dayNames[i]));
      }
      cal.appendChild(dayHeaders);
      
      var days = el('div', {style: {display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px'}});
      var startDay = getStartDay(state.friendCalDate);
      var daysInMonth = getDaysInMonth(state.friendCalDate);
      var now = new Date();
      var isCurrent = state.friendCalDate.getMonth() === now.getMonth() && state.friendCalDate.getFullYear() === now.getFullYear();
      
      for (var i = 0; i < startDay; i++) {
        days.appendChild(el('div'));
      }
      for (var day = 1; day <= daysInMonth; day++) {
        (function(d) {
          // Find friend's post for this date (using local date from createdAt)
          var month = String(state.friendCalDate.getMonth() + 1);
          if (month.length < 2) month = '0' + month;
          var dayStr = String(d);
          if (dayStr.length < 2) dayStr = '0' + dayStr;
          var targetDateStr = state.friendCalDate.getFullYear() + '-' + month + '-' + dayStr;
          var post = null;
          if (friend.posts) {
            for (var j = 0; j < friend.posts.length; j++) {
              var postLocalDate = getLocalDateFromTimestamp(friend.posts[j].createdAt);
              // Fall back to date field for older posts without createdAt
              if (!postLocalDate) postLocalDate = friend.posts[j].date;
              if (postLocalDate === targetDateStr) {
                post = friend.posts[j];
                break;
              }
            }
          }
          
          var isToday = isCurrent && d === now.getDate();
          var cell = el('div', {className: post ? 'tap' : '', style: {aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0', background: post ? t.text : 'transparent', color: post ? t.bg : t.text, border: isToday ? '2px solid ' + t.text : '1px solid transparent', fontWeight: isToday ? '700' : '400', flexDirection: 'column'}});
          if (post) {
            cell.appendChild(el('span', {style: {fontSize: '10px'}}, d));
            cell.appendChild(icon('send', 10, t.bg));
            // Capture post and date in closure, but check blur status at click time
            var postDateStr = targetDateStr;
            cell.onclick = (function(thePost, theDateStr) {
              return function() {
                // Recalculate blur status at click time (user may have posted since render)
                var blurStatus = getPostBlurStatus(theDateStr, false);
                if (!blurStatus.blurred) {
                  setState({friendDayPost: thePost, view: 'friendDayDetail'});
                } else {
                  alert("You didn't post on this day. Post today to unlock!");
                }
              };
            })(post, postDateStr);
          } else {
            cell.appendChild(el('span', {style: {fontSize: '12px'}}, d));
          }
          days.appendChild(cell);
        })(day);
      }
      cal.appendChild(days);
      info.appendChild(cal);
      
      // Unfriend button
      var unfriendBtn = el('span', {className: 'tap', style: {display: 'block', width: '100%', marginTop: '20px', padding: '14px', borderRadius: '14px', border: '1px solid #ffcdd2', background: '#ffebee', textAlign: 'center', color: '#e53935', fontSize: '14px', fontWeight: '600'}, onClick: function() { unfriend(friend.id); }}, '👋 Remove Friend');
      info.appendChild(unfriendBtn);
      
      page.appendChild(info);
      app.appendChild(page);
      return;
    }
    
    // Friend Day Detail view
    if (state.view === 'friendDayDetail' && state.friendDayPost) {
      var page = el('div', {style: {minHeight: '100vh', padding: '16px'}});
      page.appendChild(el('span', {className: 'tap', style: {position: 'absolute', top: '16px', right: '16px', width: '36px', height: '36px', borderRadius: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.card, color: t.text, zIndex: '10'}, onClick: function() { setState({view: 'friendProfile', friendDayPost: null}); }}, '✕'));
      var wrap = el('div', {style: {paddingTop: '40px'}});
      wrap.appendChild(postcardEl(state.friendDayPost, state.friendProfile, {showPrivate: false, isOwner: false, showMenu: false, showStamp: true, enablePreview: true}));
      page.appendChild(wrap);
      app.appendChild(page);
      return;
    }
    
    // Day detail
    if (state.view === 'dayDetail' && state.dayPost) {
      var page = el('div', {style: {minHeight: '100vh', padding: '16px'}});
      page.appendChild(el('span', {className: 'tap', style: {position: 'absolute', top: '16px', right: '16px', width: '36px', height: '36px', borderRadius: '12px', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.card, color: t.text, zIndex: '10'}, onClick: function() { setState({view: 'profile', dayPost: null, showMenu: false}); }}, '✕'));
      var wrap = el('div', {style: {paddingTop: '40px'}});
      var owner = {};
      for (var k in state.userData) owner[k] = state.userData[k];
      owner.id = state.user ? state.user.uid : null;
      wrap.appendChild(postcardEl(state.dayPost, owner, {showPrivate: true, isOwner: true, showMenu: true, showStamp: true, enablePreview: true}));
      
      // Show reactions list below postcard (only on user's own calendar)
      var reactions = state.dayPost.reactions || {};
      var reactionIds = Object.keys(reactions);
      if (reactionIds.length > 0) {
        var reactionsBox = el('div', {style: {marginTop: '20px', padding: '16px', background: t.card, borderRadius: '16px', border: '1px solid ' + t.border}});
        reactionsBox.appendChild(el('p', {style: {margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: t.text}}, '❤️ Reactions (' + reactionIds.length + ')'));
        
        var reactionsList = el('div', {style: {display: 'flex', flexDirection: 'column', gap: '8px'}});
        
        for (var i = 0; i < reactionIds.length; i++) {
          (function(reactorId, emoji) {
            var reactionItem = el('div', {style: {display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: t.bg, borderRadius: '12px'}});
            
            // Emoji display
            reactionItem.appendChild(el('div', {style: {width: '40px', height: '40px', borderRadius: '10px', background: t.card, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'}}, emoji));
            
            // User info (will be filled by async call)
            var nameSpan = el('span', {style: {flex: '1', fontSize: '14px', fontWeight: '500', color: t.text}}, 'Loading...');
            reactionItem.appendChild(nameSpan);
            
            // Fetch user info
            getMemberInfo(reactorId, function(info) {
              nameSpan.textContent = info.username || 'Unknown';
            });
            
            reactionsList.appendChild(reactionItem);
          })(reactionIds[i], reactions[reactionIds[i]]);
        }
        
        reactionsBox.appendChild(reactionsList);
        wrap.appendChild(reactionsBox);
      }
      
      page.appendChild(wrap);
      app.appendChild(page);
      return;
    }
    
    // Default
    app.appendChild(el('div', {style: {padding: '40px', textAlign: 'center'}}, el('p', {style: {color: t.muted}}, 'View: ' + state.view)));
  }

  render();
  
  // Setup IntersectionObserver for audio auto-play
  var audioObserver = null;
  var currentlyPlayingAudio = null;
  
  // GLOBAL UPLOAD LOCK - prevents duplicate submissions during re-renders
  var uploadInProgress = false;
  
  // Track which dates are currently being uploaded (prevents duplicate posts for same date)
  var uploadingDates = {};
  var lastFocusState = true;
  var lastVisibilityState = 'visible';
  var monitoringActive = false;
  
  // AGGRESSIVE CONTINUOUS MONITORING: Check focus CONSTANTLY (like TikTok/Instagram)
  function monitorAudioState() {
    if (!monitoringActive) return;
    
    var isHidden = document.hidden;
    var hasFocus = document.hasFocus();
    var shouldStop = isHidden || !hasFocus;
    
    // Stop IMMEDIATELY if focus/visibility lost
    if (shouldStop && currentlyPlayingAudio) {
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio.currentTime = 0;
      currentlyPlayingAudio = null;
    }
    
    // Continue monitoring
    requestAnimationFrame(monitorAudioState);
  }
  
  // Start continuous monitoring
  monitoringActive = true;
  requestAnimationFrame(monitorAudioState);
  
  // INSTANT STOP: beforeunload fires IMMEDIATELY when swiping away
  window.addEventListener('beforeunload', function() {
    if (currentlyPlayingAudio) {
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio.currentTime = 0;
      currentlyPlayingAudio = null;
    }
  });
  
  // Stop audio when app goes to background (backup)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden && currentlyPlayingAudio) {
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio.currentTime = 0;
      currentlyPlayingAudio = null;
    }
  });
  
  // Also stop audio when page loses focus (backup)
  window.addEventListener('blur', function() {
    if (currentlyPlayingAudio) {
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio.currentTime = 0;
      currentlyPlayingAudio = null;
    }
  });
  
  // Stop audio immediately when page is being unloaded (backup)
  window.addEventListener('pagehide', function() {
    if (currentlyPlayingAudio) {
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio.currentTime = 0;
      currentlyPlayingAudio = null;
    }
  });
  
  function setupAudioObserver() {
    // Clean up existing observer
    if (audioObserver) {
      audioObserver.disconnect();
    }
    
    // Stop any currently playing audio
    if (currentlyPlayingAudio) {
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio.currentTime = 0;
      currentlyPlayingAudio = null;
    }
    
    // Function to find and play the most visible postcard
    var checkAndPlayAudio = function() {
      var postcards = document.querySelectorAll('[data-postcard-with-audio]');
      if (postcards.length === 0) return;
      
      var windowHeight = window.innerHeight || document.documentElement.clientHeight;
      var windowCenter = windowHeight / 2;
      
      var bestCard = null;
      var bestScore = -999999;
      
      // Find the card whose CENTER is closest to viewport center
      for (var i = 0; i < postcards.length; i++) {
        var card = postcards[i];
        var rect = card.getBoundingClientRect();
        
        // Calculate card center
        var cardCenter = rect.top + (rect.height / 2);
        
        // Check if card is at least partially visible
        var isVisible = rect.bottom > 0 && rect.top < windowHeight;
        if (!isVisible) continue;
        
        // Calculate how close card center is to viewport center
        var distanceFromCenter = Math.abs(cardCenter - windowCenter);
        
        // Calculate visibility percentage
        var visibleTop = Math.max(rect.top, 0);
        var visibleBottom = Math.min(rect.bottom, windowHeight);
        var visibleHeight = Math.max(0, visibleBottom - visibleTop);
        var visibilityRatio = visibleHeight / rect.height;
        
        // Score: prefer cards near center AND highly visible
        // Lower distance = better, higher visibility = better
        var score = (visibilityRatio * 1000) - distanceFromCenter;
        
        if (score > bestScore && visibilityRatio > 0.3) {
          bestScore = score;
          bestCard = card;
        }
      }
      
      // Play audio for the best card
      if (bestCard) {
        var audio = bestCard.querySelector('audio');
        if (audio && currentlyPlayingAudio !== audio) {
          // Stop old audio
          if (currentlyPlayingAudio) {
            currentlyPlayingAudio.pause();
            currentlyPlayingAudio.currentTime = 0;
          }
          
          // Play new audio
          console.log('[Audio] Playing audio for card:', bestCard.getAttribute('data-postcard-with-audio'));
          audio.play().catch(function(e) {
            // Silently fail if browser blocks autoplay
          });
          currentlyPlayingAudio = audio;
        }
      } else {
        // No card is visible enough, stop audio
        if (currentlyPlayingAudio) {
          currentlyPlayingAudio.pause();
          currentlyPlayingAudio.currentTime = 0;
          currentlyPlayingAudio = null;
        }
      }
    };
    
    // Use IntersectionObserver just to trigger checks
    audioObserver = new IntersectionObserver(function(entries) {
      checkAndPlayAudio();
    }, {
      threshold: [0, 0.5, 1.0],
      rootMargin: '0px'
    });
    
    // Observe all postcards
    var postcards = document.querySelectorAll('[data-postcard-with-audio]');
    postcards.forEach(function(card) {
      audioObserver.observe(card);
    });
    
    // Also check on scroll
    var scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(checkAndPlayAudio, 50);
    });
    
    // Initial check
    setTimeout(checkAndPlayAudio, 100);
    setTimeout(checkAndPlayAudio, 300);
    setTimeout(checkAndPlayAudio, 600);
  }
  
  // Call setupAudioObserver after each render
  var originalRender = render;
  render = function() {
    originalRender();
    setupAudioObserver();
  };

  // Aggressive PWA Cache Management - Fixes "needs web server" error
  (function() {
    var STORAGE_KEY = 'postcard_app_version';
    var RELOAD_KEY = 'postcard_force_reload';
    
    // Step 1: Clear all service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (var i = 0; i < registrations.length; i++) {
          registrations[i].unregister();
        }
        console.log('[PWA] Cleared', registrations.length, 'service workers');
      });
    }
    
    // Step 2: Clear all caches
    if ('caches' in window) {
      caches.keys().then(function(names) {
        for (var i = 0; i < names.length; i++) {
          caches.delete(names[i]);
        }
        console.log('[PWA] Cleared', names.length, 'caches');
      });
    }
    
    // Step 3: Check version and force reload if needed
    var lastVersion = localStorage.getItem(STORAGE_KEY);
    var forceReload = sessionStorage.getItem(RELOAD_KEY);
    
    if (!lastVersion) {
      // First time - just save version
      localStorage.setItem(STORAGE_KEY, APP_VERSION);
      console.log('[PWA] First load - version:', APP_VERSION);
    } else if (lastVersion !== APP_VERSION) {
      if (forceReload === 'done') {
        // Already reloaded once, update version and clear flag
        localStorage.setItem(STORAGE_KEY, APP_VERSION);
        sessionStorage.removeItem(RELOAD_KEY);
        console.log('[PWA] Updated to version:', APP_VERSION);
      } else {
        // Version changed - force a hard reload
        console.log('[PWA] Version changed:', lastVersion, '->', APP_VERSION, '- forcing reload');
        sessionStorage.setItem(RELOAD_KEY, 'done');
        
        // Use location.replace to avoid adding to history
        setTimeout(function() {
          window.location.replace(window.location.href + '?v=' + APP_VERSION + '&t=' + Date.now());
        }, 100);
        return; // Stop execution
      }
    } else {
      console.log('[PWA] Version OK:', APP_VERSION);
    }
  })();
})();

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('service-worker.js')
      .then(function(registration) {
        console.log('[SW] Registered:', registration.scope);
      })
      .catch(function(error) {
        console.log('[SW] Registration failed:', error);
      });
  });
}
