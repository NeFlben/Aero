import fs from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import sharp from "sharp";

/** Local folder by default; any S3-compatible bucket once S3_BUCKET is configured. */
const s3 = process.env.S3_BUCKET && process.env.S3_ENDPOINT
  ? {
      client: new AwsClient({
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
        region: process.env.S3_REGION ?? "auto",
        service: "s3",
      }),
      url: (key: string) => `${process.env.S3_ENDPOINT!.replace(/\/$/, "")}/${process.env.S3_BUCKET}/${key}`,
    }
  : null;

const dir = () => path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? ".data/uploads");
const safe = (key: string) => {
  if (!/^[a-z0-9/-]+\.webp$/i.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return path.join(/*turbopackIgnore: true*/ dir(), key);
};

export async function putObject(key: string, body: Buffer) {
  if (s3) {
    const r = await s3.client.fetch(s3.url(key), { method: "PUT", body: new Uint8Array(body), headers: { "content-type": "image/webp" } });
    if (!r.ok) throw new Error(`Storage upload failed (${r.status})`);
    return;
  }
  const file = safe(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (s3) {
    const r = await s3.client.fetch(s3.url(key));
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }
  return fs.readFile(/*turbopackIgnore: true*/ safe(key)).catch(() => null);
}

export async function deleteObject(key: string) {
  if (s3) await s3.client.fetch(s3.url(key), { method: "DELETE" });
  else await fs.rm(safe(key), { force: true });
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
