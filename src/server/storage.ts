import fs from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import sharp from "sharp";

/**
 * Local folder by default; a private Vercel Blob store once BLOB_READ_WRITE_TOKEN is set. Private
 * blobs are only readable with the token, so photos still go through /api/images and its owner check.
 */
const blob = !!process.env.BLOB_READ_WRITE_TOKEN;

const dir = () => path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? ".data/uploads");
const checked = (key: string) => {
  if (!/^[a-z0-9/-]+\.webp$/i.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key;
};
const local = (key: string) => path.join(/*turbopackIgnore: true*/ dir(), checked(key));

export async function putObject(key: string, body: Buffer) {
  if (blob) {
    await put(checked(key), body, { access: "private", contentType: "image/webp", addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const file = local(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (blob) {
    const r = await get(checked(key), { access: "private" }).catch(() => null);
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  return fs.readFile(/*turbopackIgnore: true*/ local(key)).catch(() => null);
}

export async function deleteObject(key: string) {
  if (blob) await del(checked(key)).catch(() => {});
  else await fs.rm(local(key), { force: true });
}

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Decoding through sharp is the actual upload check: a file that is not a real image fails here,
 * whatever its name or MIME type claims. Re-encoding also strips EXIF data such as GPS coordinates.
 */
export async function processImage(input: Buffer) {
  const img = sharp(input, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();
  const meta = await img.metadata();
  if (!meta.format || !["jpeg", "png", "webp", "avif", "heif", "tiff", "gif"].includes(meta.format)) throw new Error("unsupported");
  const full = await img.clone().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await img.clone().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}
