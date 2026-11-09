import { eq } from "drizzle-orm";
import { z } from "zod";
import { readyDb } from "@/db";
import { shareLinks, user, userSettings } from "@/db/schema";
import { route } from "@/server/http";
import { CURRENCIES } from "@/lib/types";

const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");

async function share(userId: string) {
  const db = await readyDb();
  const [s] = await db.select().from(shareLinks).where(eq(shareLinks.userId, userId));
  if (s) return s;
  const [created] = await db.insert(shareLinks).values({ userId, token: newToken() }).returning();
  return created;
}

export const GET = route(async ({ userId }) => {
  const db = await readyDb();
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return { baseCurrency: settings?.baseCurrency ?? "EUR", isAdmin: settings?.isAdmin ?? false, share: await share(userId) };
});

const body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  baseCurrency: z.enum(CURRENCIES).optional(),
  share: z.object({
    enabled: z.boolean(), title: z.string().trim().max(80).nullable().optional(),
    showPrices: z.boolean(), showValues: z.boolean(), showDates: z.boolean(), showNotes: z.boolean(), showStorage: z.boolean(),
    rotate: z.boolean().optional(),
  }).optional(),
});

export const PATCH = route(async ({ req, userId }) => {
  const b = body.parse(await req.json());
  const db = await readyDb();
  if (b.name) await db.update(user).set({ name: b.name }).where(eq(user.id, userId));
  if (b.baseCurrency) await db.update(userSettings).set({ baseCurrency: b.baseCurrency }).where(eq(userSettings.userId, userId));
  if (b.share) {
    await share(userId);
    const { rotate, ...rest } = b.share;
    await db.update(shareLinks).set({ ...rest, ...(rotate ? { token: newToken() } : {}) }).where(eq(shareLinks.userId, userId));
  }
  return { share: await share(userId) };
});
