import { z } from "zod";
import { route } from "@/server/http";
import { setDeleted, updateItems } from "@/server/items";
import { itemPatch } from "@/lib/types";

const body = z.object({
  ids: z.array(z.string()).min(1).max(10000),
  action: z.enum(["update", "delete", "restore"]),
  patch: itemPatch.optional(),
});

export const POST = route(async ({ req, userId }) => {
  const { ids, action, patch } = body.parse(await req.json());
  if (action === "update") return { count: await updateItems(userId, ids, patch ?? {}) };
  return { count: await setDeleted(userId, ids, action === "delete") };
});
