import { z } from "zod";
import { rateLimit, route } from "@/server/http";
import { downloadImage } from "@/server/imageSearch";

/** Downloads a picked search result server-side and hands the bytes back to be added like an upload. */
export const POST = route(async ({ req, userId }) => {
  rateLimit(`image-fetch:${userId}`, 40, 60_000);
  const { url } = z.object({ url: z.string().url().max(2000) }).parse(await req.json());
  const { bytes, type } = await downloadImage(url);
  return new Response(bytes, { headers: { "content-type": type, "cache-control": "no-store" } });
}, { limit: 60 });
