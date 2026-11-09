import { HttpError, route } from "@/server/http";
import { getItem, setDeleted, updateItem, valuesFor } from "@/server/items";
import { itemPatch } from "@/lib/types";

type P = { id: string };

export const GET = route<P>(async ({ userId, params }) => {
  const item = await getItem(userId, params.id);
  if (!item) throw new HttpError(404, "not_found");
  return { item, values: await valuesFor(userId, params.id) };
});

export const PATCH = route<P>(async ({ req, userId, params }) => {
  const item = await updateItem(userId, params.id, itemPatch.parse(await req.json()));
  if (!item) throw new HttpError(404, "not_found");
  return { item };
});

export const DELETE = route<P>(async ({ userId, params }) => {
  if (!(await setDeleted(userId, [params.id], true))) throw new HttpError(404, "not_found");
});
