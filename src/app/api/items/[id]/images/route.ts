import { and, asc, eq } from "drizzle-orm";
import { readyDb } from "@/db";
import { items, modelImages } from "@/db/schema";
import { HttpError, rateLimit, route } from "@/server/http";
import { MAX_UPLOAD_BYTES, processImage, putObject } from "@/server/storage";

type P = { id: string };

async function own(userId: string, id: string) {
  const db = await readyDb();
  const [i] = await db.select({ id: items.id }).from(items).where(and(eq(items.id, id), eq(items.userId, userId)));
  if (!i) throw new HttpError(404, "not_found");
  return db;
}

export const GET = route<P>(async ({ userId, params }) => {
  const db = await own(userId, params.id);
  const images = await db
    .select({ id: modelImages.id, width: modelImages.width, height: modelImages.height, altText: modelImages.altText })
    .from(modelImages).where(eq(modelImages.itemId, params.id)).orderBy(asc(modelImages.position), asc(modelImages.createdAt));
  return { images };
});

export const POST = route<P>(async ({ req, userId, params }) => {
  rateLimit(`upload:${userId}`, 40, 60_000);
  const db = await own(userId, params.id);
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new HttpError(400, "no_file");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "too_large");
  let out;
  try {
    out = await processImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    throw new HttpError(415, "not_an_image");
  }
  const count = await db.$count(modelImages, eq(modelImages.itemId, params.id));
  if (count >= 12) throw new HttpError(409, "too_many_images");
  const imageId = crypto.randomUUID();
  const key = `${userId}/${imageId}.webp`;
  await putObject(key, out.full);
  await putObject(`${userId}/${imageId}-thumb.webp`, out.thumb);
  const [image] = await db.insert(modelImages).values({
    id: imageId, itemId: params.id, userId, storageKey: key, width: out.width, height: out.height, source: "user_upload", usagePermission: "owner", position: count,
  }).returning({ id: modelImages.id, width: modelImages.width, height: modelImages.height, altText: modelImages.altText });
  return { image };
}, { limit: 60 });
