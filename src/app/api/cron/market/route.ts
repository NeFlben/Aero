import { timingSafeEqual } from "node:crypto";
import { marketEnabled, runDueRefreshes } from "@/server/market";

/**
 * Market price refresh for serverless hosting, called by a scheduler (Vercel Cron or cron-job.org)
 * with "Authorization: Bearer <CRON_SECRET>". Each call works for at most ~45 seconds.
 */
export const maxDuration = 60;

const authorized = (header: string | null) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function GET(req: Request) {
  if (!authorized(req.headers.get("authorization"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!marketEnabled()) return Response.json({ refreshed: 0, enabled: false });
  const refreshed = await runDueRefreshes(45_000);
  return Response.json({ refreshed, enabled: true });
}
