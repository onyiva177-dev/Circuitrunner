var CACHE = "circuit-runner-v2";
var ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./engine.js",
  "./levels.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Cache each asset individually so one bad URL can't fail the whole
      // install (cache.addAll rejects everything if any single fetch fails).
      return Promise.all(
        ASSETS.map(function (url) {
          return cache.add(url).catch(function () {});
        })
      );
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var isNavigation = event.request.mode === "navigate";

  if (isNavigation) {
    // Network-first for page loads, falling back to the cached shell, and
    // finally to whatever we have cached at all — never leave respondWith
    // with nothing to return (that's what produces ERR_FAILED).
    event.respondWith(
      fetch(event.request)
        .then(function (resp) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
          return resp;
        })
        .catch(function () {
          return caches.match(event.request).then(function (cached) {
            return cached || caches.match("./index.html") || caches.match("./");
          });
        })
    );
    return;
  }

  // Cache-first for everything else (styles/scripts/icons), refreshing in
  // the background.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var network = fetch(event.request)
        .then(function (resp) {
          if (resp && resp.status === 200) {
            var copy = resp.clone();
            caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
          }
          return resp;
        })
        .catch(function () { return cached; });
      return cached || network;
    })
  );
});
