// Karbé 2 — service worker : app hors-ligne, médias et tuiles en cache.
const V = "karbe-2.1.0";
const MEDIA = "karbe-media", TILES = "karbe-tiles", STATIC = "karbe-static";
const SHELL = ["./", "index.html", "styles.css", "app.js", "data.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "apple-touch-icon.png"];
const MAX_TILES = 3000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  const keep = [V, MEDIA, TILES, STATIC];
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !keep.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function cacheFirst(name, req, trim) {
  const c = await caches.open(name);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === "opaque") { c.put(req, r.clone()); if (trim) trimCache(c, trim); }
    return r;
  } catch { return new Response("", { status: 504 }); }
}
async function trimCache(c, max) {
  const keys = await c.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => c.delete(k)));
}
async function swr(name, req, event) {
  const c = await caches.open(name);
  const hit = await c.match(req, { ignoreSearch: name === V });
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
  if (hit) { event.waitUntil(net); return hit; }
  const r = await net;
  if (r) return r;
  if (req.mode === "navigate") return (await c.match("index.html")) || new Response("Hors-ligne", { status: 503 });
  return new Response("", { status: 504 });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const h = url.hostname;

  if (/open-meteo\.com|thespacedevs\.com/.test(h)) return; // l'app gère son propre cache de données
  if (url.pathname.startsWith("/_vercel/image") || url.pathname.startsWith("/img/")) { e.respondWith(cacheFirst(MEDIA, req)); return; }
  if (h === "tiles.openfreemap.org") { e.respondWith(url.pathname.startsWith("/styles") ? swr(MEDIA, req, e) : cacheFirst(TILES, req, MAX_TILES)); return; }
  if (h === "unpkg.com") { e.respondWith(cacheFirst(MEDIA, req)); return; }
  if (h === "fonts.googleapis.com" || h === "fonts.gstatic.com") { e.respondWith(cacheFirst(STATIC, req)); return; }
  if (url.origin === location.origin) { e.respondWith(swr(V, req, e)); return; }
});
