"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { normBarcode } from "@/lib/smart";
import { validBarcode } from "@/lib/boxScan";
import { createDetector } from "./BarcodeScanner";

let enabledOnce: Promise<boolean> | null = null;

/** Whether the server has a vision key. Asked once per page load. */
export function useBoxScanEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    enabledOnce ??= fetch("/api/box-scan").then((r) => (r.ok ? r.json() : { enabled: false })).then((r) => !!r.enabled).catch(() => false);
    let live = true;
    enabledOnce.then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);
  return on;
}

const EDGE = 1800;

/**
 * Shrinks each photo before upload (a phone photo is often 5–10 MB) and looks for a barcode in the
 * full-resolution pixels: decoded digits with a valid check digit beat anything read by eye.
 */
export async function prepareBoxFiles(files: File[]): Promise<{ upload: File[]; barcode: string | null }> {
  let barcode: string | null = null;
  const detector = await createDetector().catch(() => null);
  const upload: File[] = [];
  for (const file of files) {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      upload.push(file);
      continue;
    }
    if (!barcode && detector) {
      const found = await detector.detect(bitmap).catch(() => []);
      barcode = found.map((f) => normBarcode(f.rawValue)).find((c) => validBarcode(c)) ?? null;
    }
    const scale = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === "image/jpeg" && file.size < 3_000_000) {
      upload.push(file);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      upload.push(blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file);
    }
    bitmap.close();
  }
  return { upload, barcode };
}

/** Shown while the box is being read: the photos with a moving scan line. */
export function BoxScanProgress({ files }: { files: File[] }) {
  const { t } = useI18n();
  // Created inside the effect so a dev double-mount cannot leave revoked URLs behind.
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(f));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  const steps = [t("Reading the box…"), t("Matching airline and aircraft type…"), t("Checking catalog and collection…")];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 4500);
    return () => clearInterval(h);
  }, [steps.length]);

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 px-5 py-8 text-center">
      <div className="flex flex-wrap justify-center gap-2">
        {urls.map((u, i) => (
          <div key={u} className="relative h-36 w-28 overflow-hidden rounded-xl bg-surface-2 shadow-[var(--shadow-sm)] sm:h-44 sm:w-36">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={files[i]?.name ?? ""} className="size-full object-cover" />
            <div aria-hidden className="box-scan-line absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-accent/35 to-transparent" />
          </div>
        ))}
      </div>
      <p className="flex items-center gap-2 font-semibold"><Camera className="size-4 text-accent" />{steps[step]}</p>
      <p className="max-w-sm text-[12.5px] text-ink-3">{t("This takes a few seconds. The photos are sent to Claude (Anthropic) to be read.")}</p>
    </div>
  );
}
