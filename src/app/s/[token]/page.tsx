import { and, desc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedCollection, type SharedItem } from "@/components/SharedCollection";
import { readyDb } from "@/db";
import { aircraftTypes, items, modelImages, shareLinks, user } from "@/db/schema";

// A private link: never indexed and not passed along to other sites.
export const metadata: Metadata = { title: "Shared collection", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await readyDb();
  const [link] = await db.select().from(shareLinks).where(and(eq(shareLinks.token, token), eq(shareLinks.enabled, true)));
  if (!link) notFound();
  const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, link.userId));
  const rows = await db
    .select({ item: items, shape: aircraftTypes.shape })
    .from(items)
    .leftJoin(aircraftTypes, eq(aircraftTypes.id, items.aircraftTypeId))
    .where(and(eq(items.userId, link.userId), eq(items.status, "collection"), isNull(items.deletedAt)))
    .orderBy(desc(items.createdAt));
  const imgs = await db
    .selectDistinctOn([modelImages.itemId], { itemId: modelImages.itemId, id: modelImages.id })
    .from(modelImages)
    .innerJoin(items, eq(items.id, modelImages.itemId))
    .where(eq(items.userId, link.userId))
    .orderBy(modelImages.itemId, modelImages.position);
  const imgMap = new Map(imgs.map((i) => [i.itemId, i.id]));

  // Built field by field on the server: what the owner did not release never reaches the browser.
  const shared: SharedItem[] = rows.map(({ item: i, shape }) => ({
    id: i.id, airlineName: i.airlineName, aircraftName: i.aircraftName, modelManufacturerName: i.modelManufacturerName, scale: i.scale, registration: i.registration, itemNumber: i.itemNumber,
    liveryCategory: i.liveryCategory, liveryName: i.liveryName, countryCode: i.countryCode, imageId: imgMap.get(i.id) ?? null, shape: shape ?? undefined,
    price: link.showPrices && i.purchasePriceCents !== null ? { cents: i.purchasePriceCents, currency: i.purchaseCurrency ?? "EUR" } : null,
    value: link.showValues && i.valueCents !== null ? { cents: i.valueCents, currency: i.valueCurrency ?? "EUR" } : null,
    date: link.showDates ? i.purchaseDate : null,
    notes: link.showNotes ? i.notes : null,
    storage: link.showStorage ? i.storageLocation : null,
  }));
  return <SharedCollection title={link.title || owner?.name || "Collection"} items={shared} token={token} />;
}
