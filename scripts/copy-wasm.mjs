// Copies the WebAssembly files the browser needs to public/vendor, named after their version, so the
// barcode reader and the box text reader never load from a third-party CDN and a browser cache can
// never serve a stale copy.
import fs from "node:fs";
import path from "node:path";

const nm = path.join(process.cwd(), "node_modules");
const dir = path.join(process.cwd(), "public", "vendor");
const version = (pkg) => JSON.parse(fs.readFileSync(path.join(nm, pkg, "package.json"), "utf8")).version;

try {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith("zxing_reader")) fs.rmSync(path.join(dir, f));
  const v = version("zxing-wasm");
  fs.copyFileSync(path.join(nm, "zxing-wasm", "dist", "reader", "zxing_reader.wasm"), path.join(dir, `zxing_reader-${v}.wasm`));
  console.log(`zxing_reader-${v}.wasm copied`);
} catch (e) {
  console.warn("copy-wasm (barcode) skipped:", e.message);
}

// Box text recognition: worker script, every core build (Tesseract picks one per device) and the
// English model, in one folder per tesseract.js version → /vendor/tesseract-<version>/.
try {
  for (const f of fs.readdirSync(dir)) if (f.startsWith("tesseract-")) fs.rmSync(path.join(dir, f), { recursive: true });
  const out = path.join(dir, `tesseract-${version("tesseract.js")}`);
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(nm, "tesseract.js", "dist", "worker.min.js"), path.join(out, "worker.min.js"));
  const core = path.join(nm, "tesseract.js-core");
  for (const f of fs.readdirSync(core)) if (f.endsWith(".wasm.js")) fs.copyFileSync(path.join(core, f), path.join(out, f));
  fs.copyFileSync(path.join(nm, "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"), path.join(out, "eng.traineddata.gz"));
  console.log(`${path.basename(out)} copied`);
} catch (e) {
  console.warn("copy-wasm (tesseract) skipped:", e.message);
}
