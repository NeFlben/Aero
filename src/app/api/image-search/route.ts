import { HttpError, rateLimit, route } from "@/server/http";
import { imageSearchProvider, searchImages } from "@/server/imageSearch";

/** The first web image results for a query (official search API; the picker embeds Bing Images when none is set). */
export const GET = route(async ({ req, userId }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!imageSearchProvider()) return { enabled: false, provider: null, query: q, results: [] };
  if (!q) throw new HttpError(400, "no_query");
  rateLimit(`image-search:${userId}`, 30, 60_000);
  // Fallback queries (for example just the registration) are tried in turn while nothing is found.
  const tries = [q, ...req.nextUrl.searchParams.getAll("alt").map((a) => a.trim().slice(0, 200)).filter(Boolean)].slice(0, 4);
  for (const [n, query] of tries.entries()) {
    const { provider, hits } = await searchImages(query, 10);
    if (hits.length || n === tries.length - 1) return { enabled: true, provider, query, results: hits };
  }

}, { limit: 60 });
