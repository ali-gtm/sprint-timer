var CACHE_VERSION = "sprint-v1";
var RUNTIME_CACHE = "sprint-runtime-v1";

var APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_VERSION && key !== RUNTIME_CACHE; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  var isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        var networkFetch = fetch(request).then(function (response) {
          if (response && response.ok) {
            caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, response.clone()); });
          }
          return response;
        }).catch(function () { return cached; });
        return cached || networkFetch;
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).then(function (response) {
      if (response && response.ok) {
        caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(request, response.clone()); });
      }
      return response;
    }).catch(function () {
      return caches.match(request);
    })
  );
});
