/**
 * Renders the app icons (home screen, splash, favicon) from one SVG source, the Hangar wordmark tile.
 * Run after changing the artwork: npx tsx scripts/build-icons.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const plane = "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5Z";

/** `inset` is the share of the tile the plane occupies; maskable icons need a wide safe zone. */
const tile = (opts: { rounded: boolean; inset: number }) => {
  const s = 512;
  const p = (s * opts.inset) / 24;
  const off = (s - p * 24) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs>
  <rect width="${s}" height="${s}" rx="${opts.rounded ? 112 : 0}" fill="url(#g)"/>
  <g transform="translate(${off} ${off}) scale(${p})"><path d="${plane}" fill="#fff"/></g>
</svg>`;
};

const out = (f: string) => path.join(process.cwd(), f);
fs.mkdirSync(out("public/icons"), { recursive: true });

async function main() {
  const any = Buffer.from(tile({ rounded: true, inset: 0.66 }));
  const full = Buffer.from(tile({ rounded: false, inset: 0.66 }));
  const maskable = Buffer.from(tile({ rounded: false, inset: 0.52 }));

  await sharp(any).resize(192).png().toFile(out("public/icons/icon-192.png"));
  await sharp(any).resize(512).png().toFile(out("public/icons/icon-512.png"));
  await sharp(maskable).resize(512).png().toFile(out("public/icons/maskable-512.png"));
  // iOS rounds the corners itself and shows transparency as black, so the touch icon is square and opaque.
  await sharp(full).resize(180).png().toFile(out("src/app/apple-icon.png"));
  fs.writeFileSync(out("src/app/icon.svg"), tile({ rounded: true, inset: 0.66 }));
  console.log("icons written");
}

void main();
