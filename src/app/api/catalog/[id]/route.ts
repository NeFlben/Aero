import { eq } from "drizzle-orm";
import { z } from "zod";
import { readyDb } from "@/db";
import { items, modelReleases } from "@/db/schema";
import { HttpError, route } from "@/server/http";
import { deleteReleases } from "@/server/catalog";

const body = z.object({ action: z.enum(["verify", "reject", "merge"]), into: z.string().optional() });

/** Moderation. Merging repoints personal items to the surviving release. */
export const POST = route<{ id: string }>(async ({ req, isAdmin, params }) => {
  if (!isAdmin) throw new HttpError(403, "forbidden");
  const { action, into } = body.parse(await req.json());
  const db = await readyDb();
  if (action === "merge") {
    if (!into || into === params.id) throw new HttpError(400, "bad_target");
    await db.update(items).set({ releaseId: into }).where(eq(items.releaseId, params.id));
    await db.update(modelReleases).set({ status: "merged", mergedInto: into }).where(eq(modelReleases.id, params.id));
  } else {
    await db.update(modelReleases).set({ status: action === "verify" ? "verified" : "rejected" }).where(eq(modelReleases.id, params.id));
  }
});

export const DELETE = route<{ id: string }>(async ({ userId, isAdmin, params }) => {
  if (!(await deleteReleases(userId, isAdmin, [params.id]))) throw new HttpError(404, "not_found");
});
