import { boxScanEnabled, prepareBoxPhoto, readBox } from "@/server/boxScan";
import { HttpError, rateLimit, route } from "@/server/http";
import { reference } from "@/server/items";
import { MAX_UPLOAD_BYTES } from "@/server/storage";

// A careful read of several photos can take a while.
export const maxDuration = 60;

const MAX_PHOTOS = 4;

export const GET = route(async () => ({ enabled: boxScanEnabled() }));

/** Photos of one model box in, what is printed on it out. Nothing is stored. */
export const POST = route(async ({ req, userId }) => {
  if (!boxScanEnabled()) throw new HttpError(503, "box_scan_off");
  rateLimit(`box-scan:${userId}`, 8, 60_000);
  rateLimit(`box-scan-day:${userId}`, 150, 86_400_000);

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "no_file");
  if (files.length > MAX_PHOTOS) throw new HttpError(400, "too_many_files");
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) throw new HttpError(413, "too_large");

  let photos: string[];
  try {
    photos = await Promise.all(files.map(async (f) => prepareBoxPhoto(Buffer.from(await f.arrayBuffer()))));
  } catch {
    throw new HttpError(415, "not_an_image");
  }

  const ref = await reference(userId);
  const reading = await readBox(photos, {
    language: form.get("lang") === "de" ? "de" : "en",
    ownMakers: ref.makers.filter((m) => m.own).map((m) => m.name).slice(0, 40),
  });
  return { reading };
}, { limit: 30 });
