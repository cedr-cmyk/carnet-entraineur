// Service worker : appli disponible hors connexion, et fichiers servis à l'adresse _blob/<id>
const SHELL = "carnet-shell-v5", FILES = "carnet-fichiers-v1";
const ASSETS = ["./", "./index.html", "./backend.js", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
let auth = null;
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, FILES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("message", (e) => { if (e.data?.type === "auth") auth = e.data; });
async function askAuth() {
  const cs = await self.clients.matchAll(); cs.forEach((c) => c.postMessage({ type: "need-auth" }));
  for (let i = 0; i < 20 && !auth; i++) await new Promise((r) => setTimeout(r, 100));
}
async function blob(req, id) {
  const cache = await caches.open(FILES), hit = await cache.match(id);
  if (hit) return hit;
  if (!auth) await askAuth();
  if (!auth) return new Response("Fichier indisponible hors connexion", { status: 503 });
  const r = await fetch(`${auth.url}/storage/v1/object/authenticated/fichiers/${auth.uid}/${id}`, { headers: { Authorization: "Bearer " + auth.token, apikey: auth.key } });
  if (r.ok) cache.put(id, r.clone());
  return r;
}
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  const m = u.pathname.match(/\/_blob\/([0-9a-f]{32})$/);
  if (m && u.origin === location.origin) { e.respondWith(blob(e.request, m[1])); return; }
  if (e.request.method !== "GET") return;
  if (u.origin === location.origin) {
    // l'appli d'abord depuis le réseau (pour les mises à jour), sinon depuis la copie locale
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))));
  } else if (/cdnjs|jsdelivr|fonts\.(googleapis|gstatic)/.test(u.host)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok || r.type === "opaque") caches.open(SHELL).then((c) => c.put(e.request, r.clone())); return r; })));
  }
});
