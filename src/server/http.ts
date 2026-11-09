import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

/* Per-process sliding window. For multi-instance deployments swap in a shared store. */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) throw new HttpError(429, "rate_limited");
  list.push(now);
  hits.set(key, list);
  if (hits.size > 20000) hits.clear();
}

/** Mutations from another origin are refused, on top of the SameSite session cookie. */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) throw new HttpError(403, "bad_origin");
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (a: { req: NextRequest; userId: string; params: P; isAdmin: boolean }) => Promise<unknown>;

/** Wraps a route: requires a session, applies a general rate limit and turns errors into JSON. */
export function route<P = object>(fn: Handler<P>, opts: { limit?: number } = {}) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const u = await getSessionUser(req.headers);
      if (!u) throw new HttpError(401, "unauthorized");
      rateLimit(`${u.id}:${req.nextUrl.pathname.split("/").slice(0, 3).join("/")}:${req.method}`, opts.limit ?? 300, 60_000);
      const out = await fn({ req, userId: u.id, isAdmin: u.isAdmin, params: await ctx.params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.code }, { status: e.status });
      if (e instanceof z.ZodError) return NextResponse.json({ error: "validation", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
      console.error(e);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  };
}
