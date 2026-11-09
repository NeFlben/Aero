import { z } from "zod";
import { readyDb } from "@/db";
import { catalogReports, modelReleases } from "@/db/schema";
import { deleteReleases, searchCatalog } from "@/server/catalog";
import { authEnabled } from "@/server/auth";
import { HttpError, rateLimit, route } from "@/server/http";
import { LIVERY_CATEGORIES } from "@/lib/types";

export const GET = route(async ({ req, userId, isAdmin }) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return { releases: await searchCatalog(userId, isAdmin, q), isAdmin, canManage: isAdmin || !authEnabled };
});

const suggest = z.object({
  airlineId: z.string().nullable().optional(),
  airlineName: z.string().trim().max(120).nullable().optional(),
  aircraftTypeId: z.string().nullable().optional(),
  aircraftName: z.string().trim().min(1).max(120),
  modelManufacturerName: z.string().trim().min(1).max(120),
  scale: z.string().trim().max(16).nullable().optional(),
  registration: z.string().trim().max(24).nullable().optional(),
  itemNumber: z.string().trim().max(60).nullable().optional(),
  barcode: z.string().trim().max(32).nullable().optional(),
  liveryCategory: z.enum(LIVERY_CATEGORIES).nullable().optional(),
  liveryName: z.string().trim().max(120).nullable().optional(),
  releaseYear: z.number().int().min(1950).max(2100).nullable().optional(),
  sourceUrl: z.string().url().max(500).nullable().optional().or(z.literal("").transform(() => null)),
});

/** Suggestions always start unverified, whoever submits them; an admin reviews them. */
export const POST = route(async ({ req, userId }) => {
  rateLimit(`suggest:${userId}`, 30, 3600_000);
  const db = await readyDb();
  const [release] = await db.insert(modelReleases).values({ ...suggest.parse(await req.json()), status: "unverified", submittedBy: userId }).returning({ id: modelReleases.id });
  return { id: release.id };
});

export const PUT = route(async ({ req, userId }) => {
  rateLimit(`report:${userId}`, 30, 3600_000);
  const { releaseId, message } = z.object({ releaseId: z.string(), message: z.string().trim().min(3).max(1000) }).parse(await req.json());
  const db = await readyDb();
  await db.insert(catalogReports).values({ releaseId, message, userId }).catch(() => {
    throw new HttpError(404, "not_found");
  });
});

/** Clears the catalog: every entry this person may remove (see deleteReleases). */
export const DELETE = route(async ({ userId, isAdmin }) => ({ count: await deleteReleases(userId, isAdmin, "all") }));
