/*
 * Hangar service worker. Keeps the app usable without a connection:
 * - pages: network first, the last copy of each page when offline
 * - /_next/static (hashed, immutable): cache first
 * - model photos: served from cache, refreshed in the background
 * Collection data itself is cached by the page (AppProvider), per user. Writes always go to the network.
 */
const VERSION = "v3";
const PAGES = `hangar-pages-${VERSION}`;
const STATIC = `hangar-static-${VERSION}`;
const IMAGES = `hangar-images-${VERSION}`;
const KEEP = [PAGES, STATIC, IMAGES, "hangar-data"];
const MAX_IMAGES = 1500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(["/"]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hangar-") && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Stores a page and the script/style chunks it references, which a never-visited page needs offline. */
async function warmPage(path) {
  const res = await fetch(path, { credentials: "same-origin", headers: { accept: "text/html" } });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  await (await caches.open(PAGES)).put(path, res);
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) ?? [])];
  const stat = await caches.open(STATIC);
  await Promise.all(
    assets.map(async (a) => {
      if (await stat.match(a)) return;
      const r = await fetch(a).catch(() => null);
      if (r?.ok) await stat.put(a, r);
    }),
  );
}

// The page asks for its main sections to be stored, so they open offline even if never visited.
self.addEventListener("message", (e) => {
  if (e.data?.type !== "warm" || !Array.isArray(e.data.paths)) return;
  const paths = e.data.paths.filter((p) => typeof p === "string" && p.startsWith("/"));
  e.waitUntil(Promise.all(paths.map((p) => warmPage(p).catch(() => {}))));
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // RSC payloads of client-side navigations are not cached: offline they fail, and Next.js then
  // falls back to a full page load, which the navigation branch below answers from the cache.
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/flags/") || url.pathname.startsWith("/vendor/")) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/api/images/")) {
    e.respondWith(
      caches.open(IMAGES).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone()).then(() => trim(IMAGES, MAX_IMAGES));
            return res;
          })
          .catch(() => hit ?? Response.error());
        return hit ?? net;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    // Auth pages and share links are never served from a cache.
    if (/^\/(login|register|forgot|reset|s\/)/.test(url.pathname)) return;
    e.respondWith(
      fetch(req)
        .then((res) => {
          // A redirect (e.g. to /login) is not a page worth keeping.
          if (res.ok && !res.redirected) {
            // Clone now: once the response is handed to the page its body is consumed.
            const copy = res.clone();
            e.waitUntil(caches.open(PAGES).then((c) => c.put(url.pathname, copy)));
          }
          return res;
        })
        .catch(async () => {
          const c = await caches.open(PAGES);
          return (await c.match(url.pathname)) ?? (await c.match("/")) ?? Response.error();
        }),
    );
  }
});
