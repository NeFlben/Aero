"use client";

import { useEffect, useState } from "react";

/**
 * The collection is kept in the Cache API per user, so the app opens instantly and still shows the
 * last state without a connection. Nothing is written offline: edits need the server.
 */
const DATA = "hangar-data";
const key = (userId: string, what: string) => `/__hangar/${encodeURIComponent(userId)}/${what}`;
const hasCaches = () => typeof caches !== "undefined";

export async function readCached<T>(userId: string, what: string): Promise<T | null> {
  if (!hasCaches()) return null;
  try {
    const res = await (await caches.open(DATA)).match(key(userId, what));
    return res ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCached(userId: string, what: string, data: unknown) {
  if (!hasCaches()) return;
  try {
    await (await caches.open(DATA)).put(key(userId, what), new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } }));
  } catch {}
}

/** On sign-out: nothing of this account stays on the device. */
export async function clearOfflineData() {
  if (!hasCaches()) return;
  const keys = await caches.keys().catch(() => [] as string[]);
  await Promise.all(keys.filter((k) => k.startsWith("hangar")).map((k) => caches.delete(k)));
  try {
    localStorage.removeItem(WARM_KEY);
  } catch {}
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

const WARM_PATHS = ["/", "/collection", "/airlines", "/wishlist", "/explore", "/insights", "/map", "/import", "/settings"];
const WARM_KEY = "hangar:sw-warm";

/**
 * Registers /sw.js in production builds only; in development it would cache hot-reload chunks.
 * Once an hour at most, it then has the main sections stored for offline use.
 */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  let last = 0;
  try {
    last = Number(localStorage.getItem(WARM_KEY)) || 0;
  } catch {}
  if (!navigator.onLine || Date.now() - last < 60 * 60_000) return;
  navigator.serviceWorker.ready
    .then((r) => {
      r.active?.postMessage({ type: "warm", paths: WARM_PATHS });
      try {
        localStorage.setItem(WARM_KEY, String(Date.now()));
      } catch {}
    })
    .catch(() => {});
}
