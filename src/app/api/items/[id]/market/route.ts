import { HttpError, route } from "@/server/http";
import { marketEnabled, refreshItem, snapshotsFor } from "@/server/market";

type P = { id: string };

export const GET = route<P>(async ({ userId, params }) => ({ enabled: marketEnabled(), snapshots: await snapshotsFor(userId, params.id) }));

/** Looks the model up on the market right now. */
export const POST = route<P>(
  async ({ userId, params }) => {
    if (!marketEnabled()) throw new HttpError(409, "market_disabled");
    const snapshot = await refreshItem(userId, params.id).catch((e) => {
      console.error("[market]", e);
      throw new HttpError(502, "market_unavailable");
    });
    if (!snapshot) throw new HttpError(404, "not_found");
    return { snapshot };
  },
  { limit: 20 },
);
