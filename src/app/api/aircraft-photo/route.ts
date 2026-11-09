import { HttpError, route } from "@/server/http";

/**
 * Photo of the real aircraft behind a registration, from the Planespotters.net public API.
 * Planespotters asks for the photographer credit and a link back, so both are returned and shown.
 * Results (including "nothing found") are kept in memory, and lookups run a few at a time.
 */
export interface AircraftPhoto { src: string; large: string; link: string; photographer: string }

const cache = new Map<string, { at: number; photo: AircraftPhoto | null }>();
const DAY = 86_400_000;
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 3) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function lookup(reg: string): Promise<AircraftPhoto | null> {
  const hit = cache.get(reg);
  if (hit && Date.now() - hit.at < (hit.photo ? 7 * DAY : DAY)) return hit.photo;
  // Planespotters requires a contact URL or e-mail in the User-Agent; without one the lookup stays off.
  const contact = process.env.PLANESPOTTERS_CONTACT?.trim();
  if (!contact) return null;
  return slot(async () => {
    const res = await fetch(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`, {
      headers: { "user-agent": `Hangar/1.0 (+${contact})` },
      signal: AbortSignal.timeout(8000),
    });
    // Rate limited or down: answer "none" now, but do not remember it.
    if (!res.ok) return null;
    const data = (await res.json()) as { photos?: { thumbnail?: { src: string }; thumbnail_large?: { src: string }; link?: string; photographer?: string }[] };
    const p = data.photos?.[0];
    const photo = p?.thumbnail_large?.src && p.link ? { src: p.thumbnail_large.src, large: p.thumbnail_large.src, link: p.link, photographer: p.photographer ?? "Planespotters.net" } : null;
    cache.set(reg, { at: Date.now(), photo });
    return photo;
  });
}

export const GET = route(async ({ req }) => {
  const reg = (req.nextUrl.searchParams.get("reg") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,11}$/.test(reg)) throw new HttpError(400, "bad_registration");
  try {
    return { photo: await lookup(reg) };
  } catch {
    return { photo: null };
  }
}, { limit: 600 });
