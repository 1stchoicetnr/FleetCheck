const CACHE_NAME = "inspekt-v3";

/** Never cache Next.js bundles — they change every build. */
function isDynamicAsset(url: URL): boolean {
  return (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/") ||
    url.search.includes("_rsc=")
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "/manifest.json?v=3",
        "/favicon.ico?v=3",
        "/apple-touch-icon.png?v=3",
        "/icons/icon-192.png?v=3",
        "/icons/icon-512.png?v=3",
        "/icons/icon-maskable-192.png?v=3",
        "/icons/icon-maskable-512.png?v=3",
      ])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Always network-first for JS/CSS chunks and pages.
  if (isDynamicAsset(url) || event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first only for static icons/manifest.
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
    )
  );
});
