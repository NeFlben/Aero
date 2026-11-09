import { route, rateLimit } from "@/server/http";
import { createItem, listItems, purgeDeleted } from "@/server/items";
import { itemInput } from "@/lib/types";

export const GET = route(async ({ userId }) => {
  purgeDeleted(userId).catch(console.error);
  return { items: await listItems(userId) };
});

export const POST = route(async ({ req, userId }) => {
  rateLimit(`create:${userId}`, 120, 60_000);
  return { item: await createItem(userId, itemInput.parse(await req.json())) };
});
