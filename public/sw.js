// QRoll Official Web Push & PWA Service Worker
// Kwame Nkrumah University of Science and Technology (KNUST)

const CACHE_NAME = "qroll-pwa-v2";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/manifest.json",
  "/favicon.png",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/pwa-maskable-512x512.png",
  "/knust-logo.svg",
];

// Install: Cache essential shell assets & skip waiting
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Precaching error:", err);
      });
    })
  );
});

// Activate: Clean up older caches & claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      }),
    ])
  );
});

// Real Web Push Event: Display OS / Lockscreen / Notification Center banner
self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "KNUST Attendance", body: event.data.text() };
    }
  }

  const title = payload.title || "KNUST-ATTENDANCE-APP";
  const body = payload.body || "New academic update from QRoll";
  const icon = payload.icon || "/favicon.png";
  const badge = payload.badge || "/favicon.png";
  const url = payload.url || "/";
  const tag = payload.tag || (payload.entityId ? `${payload.type || "qroll"}_${payload.entityId}` : `qroll_${Date.now()}`);

  const options = {
    body,
    icon,
    badge,
    data: {
      url,
      type: payload.type || "GENERAL",
      entityId: payload.entityId || null,
      entityType: payload.entityType || null,
      timestamp: payload.timestamp || Date.now(),
    },
    tag,
    renotify: true,
    requireInteraction: payload.type === "ATTENDANCE", // keep attendance on screen till actioned
    vibrate: [200, 100, 200],
    actions: payload.actions || [
      { action: "open", title: "View Update" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click: Focus existing app window or open target deep-link
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const clickAction = event.action;
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  const origin = self.location.origin;
  const destination = targetUrl.startsWith("http") ? targetUrl : `${origin}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Look for already open QRoll window
      for (const client of windowClients) {
        if (client.url.startsWith(origin) && "focus" in client) {
          if ("navigate" in client) {
            client.navigate(destination);
          }
          return client.focus();
        }
      }
      // If no window is currently open, open a new window to destination
      if (self.clients.openWindow) {
        return self.clients.openWindow(destination);
      }
    })
  );
});

// Fetch handler: Network-first for dynamic content & APIs, cache-fallback for static icons
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass service worker for API calls, Firestore, and non-GET requests
  if (
    req.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com")
  ) {
    return;
  }

  // Network-first strategy for pages and assets
  event.respondWith(
    fetch(req)
      .then((response) => {
        // Cache successful responses for static assets
        if (
          response.ok &&
          (url.pathname.endsWith(".png") ||
            url.pathname.endsWith(".svg") ||
            url.pathname.endsWith(".jpg") ||
            url.pathname.endsWith(".webmanifest"))
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Offline", { status: 503, statusText: "Offline" });
        });
      })
  );
});
