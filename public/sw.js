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
        // Not a page where a driver is mid-check (photos, signing, sending).
        const windows = await self.clients.matchAll({ type: "window" });
        const safe = windows.filter(
          (client) => !/^\/(checkout|check-in)\/[^/]+\/?$/.test(new URL(client.url).pathname)
        );
        await Promise.all(safe.map((client) => client.navigate(client.url).catch(() => undefined)));
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Same tag the page registers. Chrome fires this when the phone has a signal,
// including after the checkout page has been closed.
const CHECKOUT_SYNC_TAG = "inspekt-checkout-outbox";
const FLUSH_OUTBOX_MESSAGE = "flush-checkout-outbox";
const FLUSH_OUTBOX_DONE = "flush-checkout-done";
const OUTBOX_DB = "fleetcheck-db";
const BACKOFF_MS = [5000, 10000, 20000, 30000, 60000];

function waitForFlushDone(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      self.removeEventListener("message", onMessage);
      resolve(null);
    }, ms);
    function onMessage(event) {
      const data = event.data;
      if (!data || data.type !== FLUSH_OUTBOX_DONE || typeof data.pending !== "number") return;
      clearTimeout(timer);
      self.removeEventListener("message", onMessage);
      resolve(data.pending);
    }
    self.addEventListener("message", onMessage);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("aborted"));
  });
}

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function photoToken(dataUrl) {
  const value = String(dataUrl || "");
  return value.length + ":" + value.slice(-24);
}

function isDue(item, now) {
  if (!item || item.permanent) return false;
  const at = Date.parse(item.nextAttemptAt);
  return !Number.isFinite(at) || at <= now;
}

function isPermanent(status, message) {
  if (status === 401 || status === 408 || status === 429) return false;
  if (/sign in first/i.test(message)) return false;
  if (status === 409 && /needs its photos/i.test(message)) return false;
  if (status && status >= 400 && status < 500) return true;
  return /idempotency key is invalid|missing required|signature image is invalid|unknown photo angle/i.test(
    message
  );
}

function scheduleFailure(item, err) {
  const message = err && err.message ? err.message : "Upload failed";
  const status = err && typeof err.status === "number" ? err.status : undefined;
  const permanent = isPermanent(status, message);
  const delay = permanent
    ? 24 * 60 * 60 * 1000
    : BACKOFF_MS[Math.min(Math.max(item.attempts || 0, 0), BACKOFF_MS.length - 1)];
  return {
    ...item,
    attempts: (item.attempts || 0) + 1,
    permanent,
    lastError: message,
    lastStatus: status,
    nextAttemptAt: new Date(Date.now() + delay).toISOString(),
  };
}

function photoBatches(photos) {
  const maxChars = 3000000;
  const maxCount = 4;
  const batches = [];
  let current = [];
  let size = 0;
  for (const photo of photos) {
    const chars = String(photo.dataUrl || "").length;
    if (current.length > 0 && (current.length >= maxCount || size + chars > maxChars)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(photo);
    size += chars;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data && data.error ? String(data.error) : "HTTP " + response.status);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function putOutboxItem(db, item) {
  const tx = db.transaction("checkoutOutbox", "readwrite");
  tx.objectStore("checkoutOutbox").put(item);
  await txDone(tx);
}

async function deleteOutboxItem(db, item) {
  const stores = ["checkoutOutbox"];
  if (item.draftId && db.objectStoreNames.contains("checkoutDrafts")) stores.push("checkoutDrafts");
  const tx = db.transaction(stores, "readwrite");
  tx.objectStore("checkoutOutbox").delete(item.id);
  if (stores.length > 1) tx.objectStore("checkoutDrafts").delete(item.draftId);
  await txDone(tx);
}

async function deliverOutboxInWorker(db, item) {
  let current = item;
  if (!current.serverReportId) {
    const created = await postJson("/api/checkout-reports", {
      companyId: current.companyId,
      vehicleId: current.vehicleId,
      unitNumber: current.unitNumber,
      plate: current.plate,
      year: current.year,
      make: current.make,
      model: current.model,
      odometer: current.odometer,
      driverName: current.driverName,
      dispatcherName: current.dispatcherName,
      type: current.type,
      inspectionForm: current.inspectionForm,
      signatureDataUrl: current.signatureDataUrl,
      signedAt: current.signedAt,
      idempotencyKey: current.id,
      originalDriverUserId: current.driverUserId,
      originalDriverName: current.driverName,
      capturedAt: current.capturedAt || current.signedAt || current.createdAt,
    });
    const reportId = created && created.report && created.report.id;
    if (!reportId) throw new Error("Upload failed");
    current = { ...current, serverReportId: reportId, lastError: undefined };
    await putOutboxItem(db, current);
  }
  const tokens = { ...(current.uploadedTokens || {}) };
  const pending = (current.photos || []).filter(
    (photo) => tokens[photo.angle] !== photoToken(photo.dataUrl)
  );
  for (const slice of photoBatches(pending)) {
    await postJson(
      "/api/checkout-reports/" + encodeURIComponent(current.serverReportId) + "/photos",
      { photos: slice }
    );
    for (const photo of slice) tokens[photo.angle] = photoToken(photo.dataUrl);
    current = { ...current, uploadedTokens: tokens, lastError: undefined };
    await putOutboxItem(db, current);
  }
  // Idempotent: a check already marked sent returns the same row and does not post twice.
  await postJson(
    "/api/checkout-reports/" + encodeURIComponent(current.serverReportId) + "/sent",
    {}
  );
  await deleteOutboxItem(db, current);
}

async function replayOutbox() {
  if (typeof indexedDB.databases === "function") {
    const existing = await indexedDB.databases();
    if (!existing.some((entry) => entry && entry.name === OUTBOX_DB)) return;
  }
  const db = await openOutboxDb();
  try {
    if (!db.objectStoreNames.contains("checkoutOutbox")) return;
    const tx = db.transaction("checkoutOutbox", "readonly");
    const items = await idbRequest(tx.objectStore("checkoutOutbox").getAll());
    const now = Date.now();
    let retry = false;
    for (const item of items) {
      if (!isDue(item, now)) continue;
      try {
        await deliverOutboxInWorker(db, item);
      } catch (err) {
        const message = err && err.message ? err.message : "";
        let failed = scheduleFailure(item, err);
        if (err && err.status === 409 && /needs its photos/i.test(message)) {
          failed = { ...failed, uploadedTokens: {} };
        }
        await putOutboxItem(db, failed);
        if (!failed.permanent) retry = true;
      }
    }
    if (retry) throw new Error("checkout outbox retry");
  } finally {
    db.close();
  }
}

async function flushFromSync() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (windows.length > 0) {
    const done = waitForFlushDone(20000);
    await Promise.all(
      windows.map((client) => client.postMessage({ type: FLUSH_OUTBOX_MESSAGE }))
    );
    const pending = await done;
    if (pending === 0) return;
  }
  await replayOutbox();
}

self.addEventListener("sync", (event) => {
  if (!event.tag || event.tag !== CHECKOUT_SYNC_TAG) return;
  event.waitUntil(flushFromSync());
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
