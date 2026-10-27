// Kniha4U Sken – offline režim. Vše se zkouší ze sítě (vždy nejnovější verze),
// a když síť není, vezme se poslední uložená kopie. Stačí aplikaci jednou otevřít online.
// Výjimka: modely OCR (/ocr/) a soubory s otiskem v názvu (/_astro/, mj. 15 MB runtime OCR) se berou
// rovnou z uložené kopie – stahují se jen poprvé. Při změně modelů v /ocr/ zvýšit verzi mezipaměti.
const CACHE = "kniha4u-sken-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      .then((klice) => Promise.all(klice.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

function zeSite(pozadavek) {
  return fetch(pozadavek).then((odpoved) => {
    if (odpoved.ok) {
      const kopie = odpoved.clone();
      caches.open(CACHE).then((c) => c.put(pozadavek, kopie));
    }
    return odpoved;
  });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/ocr/") || url.pathname.includes("/_astro/")) {
    e.respondWith(caches.match(e.request).then((r) => r ?? zeSite(e.request)));
    return;
  }
  e.respondWith(zeSite(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? Response.error())));
});
