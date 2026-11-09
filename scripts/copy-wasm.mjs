// Copies the barcode reader's WebAssembly file to public/vendor, named after its version, so the
// scanner never loads it from a third-party CDN and a browser cache can never serve a stale copy.
import fs from "node:fs";
import path from "node:path";

try {
  const root = path.join(process.cwd(), "node_modules", "zxing-wasm");
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const src = path.join(root, "dist", "reader", "zxing_reader.wasm");
  const dir = path.join(process.cwd(), "public", "vendor");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith("zxing_reader")) fs.rmSync(path.join(dir, f));
  fs.copyFileSync(src, path.join(dir, `zxing_reader-${version}.wasm`));
  console.log(`zxing_reader-${version}.wasm copied`);
} catch (e) {
  console.warn("copy-wasm skipped:", e.message);
}
