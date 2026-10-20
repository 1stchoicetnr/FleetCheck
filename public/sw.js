const CACHE_NAME = "inspekt-v6";
const SHELL_CACHE = "inspekt-shell-v6";
const STATIC_CACHE = "inspekt-static-v6";
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
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
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
