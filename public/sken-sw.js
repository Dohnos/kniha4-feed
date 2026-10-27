// Kniha4U Sken – offline režim. Vše se zkouší ze sítě (vždy nejnovější verze),
// a když síť není, vezme se poslední uložená kopie. Stačí aplikaci jednou otevřít online.
const CACHE = "kniha4u-sken-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((odpoved) => {
        if (odpoved.ok) {
          const kopie = odpoved.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie));
        }
        return odpoved;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? Response.error()))
  );
});
