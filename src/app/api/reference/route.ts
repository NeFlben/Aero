import { z } from "zod";
import { readyDb } from "@/db";
import { modelManufacturers } from "@/db/schema";
import { route } from "@/server/http";
import { reference } from "@/server/items";
import { getRates } from "@/server/fx";

export const GET = route(async ({ userId }) => {
  const [ref, rates] = await Promise.all([reference(userId), getRates()]);
  return { ...ref, rates };
});

/** Adds a manufacturer to this user's own list. */
export const POST = route(async ({ req, userId }) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await req.json());
  const db = await readyDb();
  await db.insert(modelManufacturers).values({ name, ownerId: userId }).onConflictDoNothing();
  return reference(userId);
});
