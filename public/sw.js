// Registered as /sw.js?v=<build>. A new build means a new worker and fresh caches,
// so phones cannot keep running an old app version.
const BUILD = new URL(self.location.href).searchParams.get("v") || "0";
const CACHE_NAME = "inspekt-v7-" + BUILD;
const SHELL_CACHE = "inspekt-shell-v7-" + BUILD;
const STATIC_CACHE = "inspekt-static-v7-" + BUILD;
const CURRENT_CACHES = [CACHE_NAME, SHELL_CACHE, STATIC_CACHE];

function isApi(url) {
  return url.pathname.startsWith("/api/");
}

function isNextStatic(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isBrandAsset(url) {
  return (
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/splash/")
  );
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = await cache.match("/");
      if (home) return home;
    }
    throw err;
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "/manifest.json?v=5",
        "/favicon.ico?v=5",
        "/apple-touch-icon.png?v=5",
        "/icons/icon-192.png?v=5",
        "/icons/icon-512.png?v=5",
        "/icons/icon-maskable-192.png?v=5",
        "/icons/icon-maskable-512.png?v=5",
      ])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const stale = keys.filter((key) => !CURRENT_CACHES.includes(key));
      await Promise.all(stale.map((key) => caches.delete(key)));
      await self.clients.claim();
      // Old app versions had no reload-on-update code. If we just replaced an
      // older worker, reload open pages so they pick up the new app.
      if (stale.length > 0) {
        const windows = await self.clients.matchAll({ type: "window" });
        await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (isApi(url)) return;

  if (event.request.mode === "navigate" || url.search.includes("_rsc=")) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE));
    return;
  }

  if (isNextStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  if (url.pathname.startsWith("/_next/")) return;

  if (isBrandAsset(url)) {
    event.respondWith(networkFirst(event.request, CACHE_NAME));
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && response.type === "basic") {
        await cache.put(event.request, response.clone());
      }
      return response;
    })
  );
});
