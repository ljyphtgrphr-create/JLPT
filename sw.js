// sw.js — app-shell cache for offline PWA use
const CACHE = "jp-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./storage.js",
  "./dict.js",
  "./bootstrap.js",
  "./words.json",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never intercept proxy/data fetches
  if (
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("github.com") ||
    url.hostname.includes("githubusercontent.com")
  ) {
    return;
  }

  if (e.request.method === "GET" && url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request)
            .then((resp) => {
              if (resp.ok && resp.type === "basic") {
                const copy = resp.clone();
                caches.open(CACHE).then((c) => c.put(e.request, copy));
              }
              return resp;
            })
            .catch(() => cached)
      )
    );
  }
});
