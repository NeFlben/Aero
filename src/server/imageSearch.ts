import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./http";
import { marketEnabled, search as ebaySearch } from "./market";
import { MAX_UPLOAD_BYTES } from "./storage";

/**
 * Web image search through an official search API: Serper (Google Images results) or the Brave
 * Search API, or eBay listing photos, whichever is configured.
 */
export interface ImageHit { image: string; thumb: string; title: string; source: string; page: string; width: number | null; height: number | null }

const serperKey = () => process.env.SERPER_API_KEY?.trim() || "";
const braveKey = () => process.env.BRAVE_SEARCH_API_KEY?.trim() || "";
/**
 * Optional search APIs that return results the app can show as a grid: Serper (Google Images), Brave,
 * or eBay listing photos (same free keys as the market prices). Without any of them the picker embeds
 * Bing Images, so the search runs in the user's own browser.
 */
export type ImageProvider = "google" | "brave" | "ebay";
export const imageSearchProvider = (): ImageProvider | null => (serperKey() ? "google" : braveKey() ? "brave" : marketEnabled() ? "ebay" : null);

const cache = new Map<string, { at: number; hits: ImageHit[] }>();

export async function searchImages(q: string, count = 10): Promise<{ provider: ImageProvider; hits: ImageHit[] }> {
  const provider = imageSearchProvider();
  if (!provider) throw new HttpError(409, "image_search_disabled");
  return { provider, hits: await searchWith(provider, q, count) };
}

async function searchWith(provider: ImageProvider, q: string, count: number): Promise<ImageHit[]> {
  const key = `${provider}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.hits.slice(0, count);

  let hits: ImageHit[];
  if (provider === "google") {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "x-api-key": serperKey(), "content-type": "application/json" },
      body: JSON.stringify({ q, num: 10 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new HttpError(502, "image_search_failed");
    const data = (await res.json()) as { images?: { title?: string; imageUrl?: string; thumbnailUrl?: string; source?: string; domain?: string; link?: string; imageWidth?: number; imageHeight?: number }[] };
    hits = (data.images ?? []).filter((r) => r.imageUrl).map((r) => ({
      image: r.imageUrl!, thumb: r.thumbnailUrl || r.imageUrl!, title: r.title ?? "", source: r.domain || r.source || "", page: r.link ?? "", width: r.imageWidth ?? null, height: r.imageHeight ?? null,
    }));
  } else if (provider === "ebay") {
    let found;
    try {
      found = await ebaySearch(q);
    } catch {
      throw new HttpError(502, "image_search_failed");
    }
    // eBay image links carry the size in the name (s-l225); s-l1600 is the full picture.
    hits = found.filter((s) => s.image?.imageUrl).map((s) => {
      const src = s.image!.imageUrl;
      return { image: src.replace(/s-l\d+(\.\w+)$/, "s-l1600$1"), thumb: src.replace(/s-l\d+(\.\w+)$/, "s-l400$1"), title: s.title, source: "eBay", page: s.itemWebUrl, width: null, height: null };
    });
    // Several listings of one seller often reuse a picture.
    hits = hits.filter((h, i) => hits.findIndex((x) => x.image === h.image) === i);
  } else {
    const res = await fetch(`https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(q)}&count=10&safesearch=strict`, {
      headers: { "x-subscription-token": braveKey(), accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new HttpError(502, "image_search_failed");
    const data = (await res.json()) as { results?: { title?: string; url?: string; source?: string; thumbnail?: { src?: string }; properties?: { url?: string; width?: number; height?: number } }[] };
    hits = (data.results ?? []).filter((r) => r.properties?.url).map((r) => ({
      image: r.properties!.url!, thumb: r.thumbnail?.src || r.properties!.url!, title: r.title ?? "", source: r.source ?? "", page: r.url ?? "", width: r.properties?.width ?? null, height: r.properties?.height ?? null,
    }));
  }
  cache.set(key, { at: Date.now(), hits });
  if (cache.size > 500) cache.clear();
  return hits.slice(0, count);
}

/** Loopback, private, link-local, CGNAT and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

async function assertPublic(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "bad_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new HttpError(400, "bad_url");
}

/** Downloads a picked search result (public hosts only, images only, size-capped, redirects re-checked). */
export async function downloadImage(raw: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "bad_url");
  }
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; Hangar/1.0)", accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok || !res.body) throw new HttpError(502, "download_failed");
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!type.startsWith("image/")) throw new HttpError(415, "not_an_image");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) throw new HttpError(413, "too_large");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "too_large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(new ArrayBuffer(size));
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    return { bytes, type };
  }
  throw new HttpError(502, "download_failed");
}
