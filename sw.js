/* Dykkekart service worker: keeps the app on the phone and caches map tiles you have viewed. */
const V = "dk-app-v5";
const TILES = "dk-tiles-1", TILE_MAX = 2500;
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./favicon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  // Live data is handled by the app itself (database, weather, tide)
  if (u.hostname.endsWith("supabase.co") && !u.pathname.includes("/storage/")) return;
  if (u.hostname === "api.met.no" || u.hostname === "vannstand.kartverket.no") return;
  // Sea chart tiles: keep the ones you have looked at
  if (u.hostname === "cache.kartverket.no") { e.respondWith(tile(r)); return; }
  // The app itself: always try the newest version first
  if (u.origin === location.origin) {
    if (r.mode === "navigate" || /\/(index\.html|config\.js)?$/.test(u.pathname)) { e.respondWith(networkFirst(r)); return; }
    e.respondWith(staleWhileRevalidate(r)); return;
  }
  // Libraries, fonts and uploaded images
  if (/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname) || u.pathname.includes("/storage/")) {
    e.respondWith(staleWhileRevalidate(r));
  }
});

async function networkFirst(r) {
  const c = await caches.open(V);
  try {
    const res = await fetch(r);
    if (res.ok) c.put(r, res.clone());
    return res;
  } catch (err) {
    return (await c.match(r)) || (await c.match("./index.html")) || Response.error();
  }
}
async function staleWhileRevalidate(r) {
  const c = await caches.open(V);
  const hit = await c.match(r);
  const net = fetch(r).then(res => { if (res.ok || res.type === "opaque") c.put(r, res.clone()); return res; }).catch(() => null);
  if (hit) return hit;
  return (await net) || Response.error();
}
async function tile(r) {
  const c = await caches.open(TILES);
  const hit = await c.match(r);
  if (hit) return hit;
  try {
    const res = await fetch(r);
    if (res.ok || res.type === "opaque") { await c.put(r, res.clone()); trim(c); }
    return res;
  } catch (err) { return Response.error(); }
}
let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  try { const ks = await c.keys(); if (ks.length > TILE_MAX) for (const k of ks.slice(0, ks.length - TILE_MAX)) await c.delete(k); }
  finally { trimming = false; }
}
