import { eq } from "drizzle-orm";
import { readyDb } from "@/db";
import { items, modelImages, modelReleases, shareLinks } from "@/db/schema";
import { getSessionUser } from "@/server/auth";
import { deleteObject, getObject } from "@/server/storage";
import { HttpError, route } from "@/server/http";
import { NextResponse, type NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

/** Owner, or anyone holding an active share link of that owner, or anyone for verified catalog images. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await readyDb();
  const [img] = await db.select().from(modelImages).where(eq(modelImages.id, id));
  if (!img) return new NextResponse(null, { status: 404 });

  let allowed = false;
  if (img.releaseId) {
    const [r] = await db.select({ s: modelReleases.status }).from(modelReleases).where(eq(modelReleases.id, img.releaseId));
    allowed = r?.s === "verified";
  }
  if (!allowed && img.itemId) {
    const [item] = await db.select({ userId: items.userId }).from(items).where(eq(items.id, img.itemId));
    const token = req.nextUrl.searchParams.get("share");
    if (item && token) {
      const [s] = await db.select().from(shareLinks).where(eq(shareLinks.userId, item.userId));
      allowed = !!s?.enabled && s.token === token;
    }
    if (!allowed && item) allowed = (await getSessionUser(req.headers))?.id === item.userId;
  }
  if (!allowed) return new NextResponse(null, { status: 404 });

  const thumb = req.nextUrl.searchParams.get("size") === "thumb";
  const key = thumb ? img.storageKey.replace(".webp", "-thumb.webp") : img.storageKey;
  const body = await getObject(key);
  if (!body) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(body), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}

export const DELETE = route<{ id: string }>(async ({ userId, params }) => {
  const db = await readyDb();
  const [img] = await db.select().from(modelImages).where(eq(modelImages.id, params.id));
  if (!img || img.userId !== userId || !img.itemId) throw new HttpError(404, "not_found");
  await db.delete(modelImages).where(eq(modelImages.id, params.id));
  await deleteObject(img.storageKey).catch(() => {});
  await deleteObject(img.storageKey.replace(".webp", "-thumb.webp")).catch(() => {});
});

/** Moves the image to the front, which makes it the model's main picture. */
export const PATCH = route<{ id: string }>(async ({ userId, params }) => {
  const db = await readyDb();
  const [img] = await db.select().from(modelImages).where(eq(modelImages.id, params.id));
  if (!img || img.userId !== userId || !img.itemId) throw new HttpError(404, "not_found");
  const all = await db.select({ id: modelImages.id }).from(modelImages).where(eq(modelImages.itemId, img.itemId)).orderBy(modelImages.position);
  const order = [img.id, ...all.map((a) => a.id).filter((x) => x !== img.id)];
  for (let i = 0; i < order.length; i++) await db.update(modelImages).set({ position: i }).where(eq(modelImages.id, order[i]));
});
