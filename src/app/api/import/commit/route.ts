import { z } from "zod";
import { rateLimit, route } from "@/server/http";
import { createItems } from "@/server/items";
import { itemInput } from "@/lib/types";

const body = z.object({ items: z.array(itemInput).min(1).max(20000) });

/** Only ever inserts: an import can not overwrite an existing model. */
export const POST = route(async ({ req, userId }) => {
  rateLimit(`import-commit:${userId}`, 30, 60_000);
  const { items } = body.parse(await req.json());
  let count = 0;
  for (let i = 0; i < items.length; i += 500) count += await createItems(userId, items.slice(i, i + 500));
  return { count };
});
