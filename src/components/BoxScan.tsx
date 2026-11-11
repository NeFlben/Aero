"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import type { Worker } from "tesseract.js";
import { useI18n } from "@/lib/i18n";
import { normBarcode } from "@/lib/smart";
import { validBarcode, type OcrPage } from "@/lib/boxScan";
import { createDetector } from "./BarcodeScanner";

/**
 * Text recognition files, served from this site by scripts/copy-wasm.mjs. The folder carries the
 * tesseract.js version so a cached copy can never be stale; tests/boxScan.test.ts keeps it in step.
 */
export const TESSERACT_DIR = "/vendor/tesseract-7.0.0";

let workerOnce: Promise<Worker> | null = null;

/** One text reader per page load: the model (~3 MB) loads on first use, then the browser caches it. */
function ocrWorker(): Promise<Worker> {
  workerOnce ??= import("tesseract.js")
    .then(({ createWorker }) => createWorker("eng", 1, { workerPath: `${TESSERACT_DIR}/worker.min.js`, corePath: TESSERACT_DIR, langPath: TESSERACT_DIR, workerBlobURL: false }))
    .catch((e) => {
      workerOnce = null;
      throw e;
    });
  return workerOnce;
}

/** Long edge for recognition: enough for small print on a label, small enough to stay quick on a phone. */
const EDGE = 2000;
/** Below this many confidently read words a photo is tried turned by 90° and 270° (box sides). */
const ENOUGH_WORDS = 8;

const draw = (bitmap: ImageBitmap, turn: 0 | 90 | 270) => {
  const scale = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = turn ? [h, w] : [w, h];
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return canvas;
};

async function recognise(worker: Worker, bitmap: ImageBitmap): Promise<OcrPage> {
  let best: OcrPage | null = null;
  let bestScore = -1;
  for (const turn of [0, 90, 270] as const) {
    const { data } = await worker.recognize(draw(bitmap, turn), { rotateAuto: true }, { text: true, blocks: true });
    const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, confidence: w.confidence })))));
    const score = words.filter((w) => w.confidence >= 70 && w.text.length >= 2).length;
    if (score > bestScore) {
      best = { text: data.text, words };
      bestScore = score;
    }
    if (score >= ENOUGH_WORDS) break;
  }
  return best ?? { text: "", words: [] };
}

export type BoxStep = "loading" | "reading" | "matching";

/**
 * Reads every photo on the device: the barcode from the full-resolution pixels, the printed text
 * with Tesseract. Nothing leaves the browser.
 */
export async function readBoxPhotos(files: File[], onStep: (step: BoxStep, photo: number) => void): Promise<{ pages: OcrPage[]; barcode: string | null }> {
  onStep("loading", 0);
  const [worker, detector] = await Promise.all([ocrWorker(), createDetector().catch(() => null)]);
  let barcode: string | null = null;
  const pages: OcrPage[] = [];
  for (const [i, file] of files.entries()) {
    onStep("reading", i);
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      continue;
    }
    try {
      if (!barcode && detector) {
        const found = await detector.detect(bitmap).catch(() => []);
        barcode = found.map((f) => normBarcode(f.rawValue)).find((c) => validBarcode(c)) ?? null;
      }
      pages.push(await recognise(worker, bitmap));
    } finally {
      bitmap.close();
    }
  }
  onStep("matching", files.length - 1);
  return { pages, barcode };
}

/** Shown while the box is being read: the photos with a moving scan line and the current step. */
export function BoxScanProgress({ files, step, photo }: { files: File[]; step: BoxStep; photo: number }) {
  const { t } = useI18n();
  // Created inside the effect so a dev double-mount cannot leave revoked URLs behind.
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(f));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  const label =
    step === "loading" ? t("Preparing text recognition…")
      : step === "reading" ? (files.length > 1 ? t("Reading photo {n} of {total}…", { n: photo + 1, total: files.length }) : t("Reading the box…"))
        : t("Matching airline and aircraft type…");

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 px-5 py-8 text-center">
      <div className="flex flex-wrap justify-center gap-2">
        {urls.map((u, i) => (
          <div key={u} className={`relative h-36 w-28 overflow-hidden rounded-xl bg-surface-2 shadow-[var(--shadow-sm)] transition-opacity sm:h-44 sm:w-36 ${step === "reading" && i !== photo ? "opacity-50" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={files[i]?.name ?? ""} className="size-full object-cover" />
            {(step !== "reading" || i === photo) && <div aria-hidden className="box-scan-line absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-accent/35 to-transparent" />}
          </div>
        ))}
      </div>
      <p className="flex items-center gap-2 font-semibold"><Camera className="size-4 text-accent" />{label}</p>
      <p className="max-w-sm text-[12.5px] text-ink-3">{t("Read on this device, nothing is uploaded. The first time takes a little longer.")}</p>
    </div>
  );
}
