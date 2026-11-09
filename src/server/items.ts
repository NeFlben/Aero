import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { readyDb, type Db } from "@/db";
import { airlines, aircraftTypes, items, modelImages, modelManufacturers, valueHistory } from "@/db/schema";
import { registrationCountry } from "@/lib/smart";
import { deleteObject } from "./storage";
import type { Item, ItemInput, Reference } from "@/lib/types";

/**
 * All item access goes through this module and takes the user id as its first argument. There is
 * deliberately no "get item by id" without an owner, which is what keeps collections separated.
 */

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

type Row = typeof items.$inferSelect;
const toItem = (r: Row, imageId: string | null): Item => {
  const { userId: _u, deletedAt: _d, createdAt, updatedAt, ...rest } = r;
  void _u;
  void _d;
  return { ...rest, createdAt: iso(createdAt), updatedAt: iso(updatedAt), imageId } as Item;
};

/** First image per item, without N+1 queries. */
async function firstImages(db: Db, itemIds?: string[]) {
  const rows = await db
    .selectDistinctOn([modelImages.itemId], { itemId: modelImages.itemId, id: modelImages.id })
    .from(modelImages)
    .where(itemIds ? inArray(modelImages.itemId, itemIds) : sql`${modelImages.itemId} is not null`)
    .orderBy(modelImages.itemId, asc(modelImages.position), asc(modelImages.createdAt));
  return new Map(rows.map((r) => [r.itemId as string, r.id]));
}

export async function listItems(userId: string): Promise<Item[]> {
  const db = await readyDb();
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.userId, userId), isNull(items.deletedAt)))
    .orderBy(desc(items.createdAt), desc(items.id));
  const imgs = await db
    .selectDistinctOn([modelImages.itemId], { itemId: modelImages.itemId, id: modelImages.id })
    .from(modelImages)
    .innerJoin(items, eq(items.id, modelImages.itemId))
    .where(eq(items.userId, userId))
    .orderBy(modelImages.itemId, asc(modelImages.position), asc(modelImages.createdAt));
  const map = new Map(imgs.map((r) => [r.itemId as string, r.id]));
  return rows.map((r) => toItem(r, map.get(r.id) ?? null));
}

export async function getItem(userId: string, id: string): Promise<Item | null> {
  const db = await readyDb();
  const [r] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, userId), isNull(items.deletedAt)));
  if (!r) return null;
  const imgs = await firstImages(db, [id]);
  return toItem(r, imgs.get(id) ?? null);
}

/** Registration country is derived whenever the registration changes; the user can still override it. */
const withDerived = (input: Partial<ItemInput>): Partial<ItemInput> => {
  if (input.registration !== undefined && input.registrationCountry === undefined) {
    return { ...input, registrationCountry: registrationCountry(input.registration) };
  }
  return input;
};

/** A release id or foreign key from the client is only kept if it really exists. */
async function sanitizeRefs(db: Db, input: Partial<ItemInput>) {
  const out = { ...input };
  if (out.airlineId) {
    const [a] = await db.select({ id: airlines.id }).from(airlines).where(eq(airlines.id, out.airlineId));
    if (!a) out.airlineId = null;
  }
  if (out.aircraftTypeId) {
    const [a] = await db.select({ id: aircraftTypes.id }).from(aircraftTypes).where(eq(aircraftTypes.id, out.aircraftTypeId));
    if (!a) out.aircraftTypeId = null;
  }
  return out;
}

export async function createItem(userId: string, input: ItemInput): Promise<Item> {
  const db = await readyDb();
  const clean = withDerived(await sanitizeRefs(db, input)) as ItemInput;
  const [r] = await db.insert(items).values({ ...clean, userId }).returning();
  if (r.valueCents !== null) await recordValue(db, r);
  return toItem(r, null);
}

export async function createItems(userId: string, inputs: ItemInput[]): Promise<number> {
  if (!inputs.length) return 0;
  const db = await readyDb();
  const rows = await db
    .insert(items)
    .values(inputs.map((i) => ({ ...withDerived(i), userId }) as typeof items.$inferInsert))
    .returning();
  const valued = rows.filter((r) => r.valueCents !== null);
  if (valued.length) {
    await db.insert(valueHistory).values(
      valued.map((r) => ({
        itemId: r.id, userId, cents: r.valueCents!, currency: r.valueCurrency ?? "EUR",
        date: r.valueDate ?? new Date().toISOString().slice(0, 10), source: r.valueSource,
      })),
    );
  }
  return rows.length;
}

async function recordValue(db: Db, r: Row) {
  await db.insert(valueHistory).values({
    itemId: r.id, userId: r.userId, cents: r.valueCents!, currency: r.valueCurrency ?? "EUR",
    date: r.valueDate ?? new Date().toISOString().slice(0, 10), source: r.valueSource,
  });
}

export async function updateItem(userId: string, id: string, patch: Partial<ItemInput>): Promise<Item | null> {
  const db = await readyDb();
  const [before] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, userId), isNull(items.deletedAt)));
  if (!before) return null;
  const clean = withDerived(await sanitizeRefs(db, patch));
  if (Object.keys(clean).length === 0) return getItem(userId, id);
  const [r] = await db.update(items).set(clean as Partial<Row>).where(and(eq(items.id, id), eq(items.userId, userId))).returning();
  if (r.valueCents !== null && (r.valueCents !== before.valueCents || r.valueCurrency !== before.valueCurrency)) await recordValue(db, r);
  const imgs = await firstImages(db, [id]);
  return toItem(r, imgs.get(id) ?? null);
}

export async function updateItems(userId: string, ids: string[], patch: Partial<ItemInput>): Promise<number> {
  if (!ids.length) return 0;
  const db = await readyDb();
  const clean = withDerived(await sanitizeRefs(db, patch));
  if (!Object.keys(clean).length) return 0;
  const rows = await db
    .update(items)
    .set(clean as Partial<Row>)
    .where(and(eq(items.userId, userId), inArray(items.id, ids), isNull(items.deletedAt)))
    .returning();
  if (patch.valueCents !== undefined) for (const r of rows) if (r.valueCents !== null) await recordValue(db, r);
  return rows.length;
}

/** Removes models deleted more than 30 days ago, including their stored image files. */
export async function purgeDeleted(userId: string) {
  const db = await readyDb();
  const old = and(eq(items.userId, userId), sql`${items.deletedAt} < now() - interval '30 days'`);
  const files = await db.select({ key: modelImages.storageKey }).from(modelImages).innerJoin(items, eq(items.id, modelImages.itemId)).where(old);
  await db.delete(items).where(old);
  for (const f of files) {
    await deleteObject(f.key).catch(() => {});
    await deleteObject(f.key.replace(".webp", "-thumb.webp")).catch(() => {});
  }
}

/** Soft delete so that Undo works; purgeDeleted removes the rows for good after 30 days. */
export async function setDeleted(userId: string, ids: string[], deleted: boolean): Promise<number> {
  if (!ids.length) return 0;
  const db = await readyDb();
  const rows = await db
    .update(items)
    .set({ deletedAt: deleted ? new Date() : null })
    .where(and(eq(items.userId, userId), inArray(items.id, ids)))
    .returning({ id: items.id });
  return rows.length;
}

export async function valuesFor(userId: string, itemId?: string) {
  const db = await readyDb();
  const rows = await db
    .select({ itemId: valueHistory.itemId, cents: valueHistory.cents, currency: valueHistory.currency, date: valueHistory.date, source: valueHistory.source })
    .from(valueHistory)
    .where(itemId ? and(eq(valueHistory.userId, userId), eq(valueHistory.itemId, itemId)) : eq(valueHistory.userId, userId))
    .orderBy(asc(valueHistory.date), asc(valueHistory.createdAt));
  return rows;
}

export async function reference(userId: string): Promise<Reference> {
  const db = await readyDb();
  const [al, ac, mk] = await Promise.all([
    db.select({ id: airlines.id, name: airlines.name, iata: airlines.iata, icao: airlines.icao, country: airlines.country, aliases: airlines.aliases, defunct: airlines.defunct }).from(airlines).orderBy(asc(airlines.name)),
    db.select({ id: aircraftTypes.id, manufacturer: aircraftTypes.manufacturer, family: aircraftTypes.family, variant: aircraftTypes.variant, icaoCode: aircraftTypes.icaoCode, shape: aircraftTypes.shape, aliases: aircraftTypes.aliases }).from(aircraftTypes),
    db.select().from(modelManufacturers).where(or(isNull(modelManufacturers.ownerId), eq(modelManufacturers.ownerId, userId))).orderBy(asc(modelManufacturers.name)),
  ]);
  const order = (a: { manufacturer: string; family: string; variant: string }) => `${a.manufacturer}|${a.family}`;
  // Natural variant order: A350-900 before A350-1000.
  ac.sort((a, b) => order(a).localeCompare(order(b)) || a.variant.localeCompare(b.variant, undefined, { numeric: true }));
  return { airlines: al, aircraft: ac, makers: mk.map((m) => ({ id: m.id, name: m.name, own: m.ownerId !== null })) };
}
