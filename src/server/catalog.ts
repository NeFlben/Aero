import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { readyDb } from "@/db";
import { modelImages, modelReleases } from "@/db/schema";
import { editDistance, fold } from "@/lib/smart";
import type { ReleaseRef } from "@/lib/types";
import { authEnabled } from "./auth";
import { deleteObject } from "./storage";

const toRef = (r: typeof modelReleases.$inferSelect, imageId: string | null): ReleaseRef => ({
  id: r.id, airlineId: r.airlineId, airlineName: r.airlineName, aircraftTypeId: r.aircraftTypeId, aircraftName: r.aircraftName,
  modelManufacturerName: r.modelManufacturerName, scale: r.scale, registration: r.registration, itemNumber: r.itemNumber, barcode: r.barcode,
  liveryCategory: r.liveryCategory, liveryName: r.liveryName, releaseYear: r.releaseYear, status: r.status, sourceUrl: r.sourceUrl, imageId,
});

const words = (s: string) => fold(s).split(/[\s/,()]+/).filter(Boolean);

/**
 * Releases are visible to everyone once verified. Unverified suggestions are only returned to the
 * person who submitted them (and admins), always carrying their status so the UI can flag them.
 */
export async function searchCatalog(userId: string, isAdmin: boolean, q: string, limit = 24): Promise<ReleaseRef[]> {
  const db = await readyDb();
  const visible = isAdmin
    ? and(ne(modelReleases.status, "rejected"), ne(modelReleases.status, "merged"))
    : or(eq(modelReleases.status, "verified"), and(eq(modelReleases.status, "unverified"), eq(modelReleases.submittedBy, userId)));
  const rows = await db.select().from(modelReleases).where(visible).limit(20000);
  const qs = words(q);
  const scored: [number, typeof rows[number]][] = [];
  for (const r of rows) {
    if (!qs.length) {
      scored.push([0, r]);
      continue;
    }
    const hay = words([r.airlineName, r.aircraftName, r.modelManufacturerName, r.scale, r.registration, r.itemNumber, r.barcode, r.liveryName].filter(Boolean).join(" "));
    // Compound words are matched too, so "ngmodels" and "hbjna" work.
    let total = 0;
    let ok = true;
    for (const w of qs) {
      let best = 0;
      for (const h of hay) {
        if (h === w) best = Math.max(best, 10);
        else if (h.startsWith(w)) best = Math.max(best, 6);
        else if (w.length >= 3 && h.includes(w)) best = Math.max(best, 4);
        else if (w.length >= 4 && editDistance(w, h, 1) <= 1) best = Math.max(best, 3);
      }
      if (!best) {
        ok = false;
        break;
      }
      total += best;
    }
    if (ok) scored.push([total + (r.status === "verified" ? 1 : 0), r]);
  }
  const top = scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((s) => s[1]);
  const imgs = top.length
    ? await db.select({ releaseId: modelImages.releaseId, id: modelImages.id }).from(modelImages).where(inArray(modelImages.releaseId, top.map((t) => t.id))).orderBy(asc(modelImages.position))
    : [];
  const first = new Map<string, string>();
  for (const i of imgs) if (i.releaseId && !first.has(i.releaseId)) first.set(i.releaseId, i.id);
  return top.map((r) => toRef(r, first.get(r.id) ?? null));
}

/**
 * Removes catalog entries. People may remove their own suggestions; admins, and the single local
 * user when login is off, may remove any entry. Personal models keep their data (release link is cleared).
 */
export async function deleteReleases(userId: string, isAdmin: boolean, ids: string[] | "all"): Promise<number> {
  const db = await readyDb();
  const mayAll = isAdmin || !authEnabled;
  const scope = and(
    mayAll ? undefined : eq(modelReleases.submittedBy, userId),
    ids === "all" ? undefined : inArray(modelReleases.id, ids),
  );
  const doomed = await db.select({ id: modelReleases.id }).from(modelReleases).where(scope);
  if (!doomed.length) return 0;
  const doomedIds = doomed.map((r) => r.id);
  const files = await db.select({ key: modelImages.storageKey }).from(modelImages).where(inArray(modelImages.releaseId, doomedIds));
  await db.delete(modelReleases).where(inArray(modelReleases.id, doomedIds));
  for (const f of files) {
    await deleteObject(f.key).catch(() => {});
    await deleteObject(f.key.replace(".webp", "-thumb.webp")).catch(() => {});
  }
  return doomedIds.length;
}
