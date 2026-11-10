"use client";

import { Camera, ScanBarcode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { normBarcode, validGtin } from "@/lib/smart";
import { Button, Dialog, IconClose, Input } from "./ui";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

interface Detector {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<{ rawValue: string }[]>;
}

/** The browser's own BarcodeDetector (Chrome on Android, Safari on macOS), if it reads product codes. */
async function nativeDetector(): Promise<Detector | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Native = (globalThis as any).BarcodeDetector;
  if (!Native) return null;
  try {
    const supported: string[] = await Native.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new Native({ formats }) : null;
  } catch {
    return null;
  }
}

/** The same API backed by ZXing in WebAssembly. The .wasm file is served from /vendor, so no third-party CDN is contacted. */
async function zxingDetector(): Promise<Detector> {
  const mod = await import("barcode-detector/ponyfill");
  mod.setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/vendor/zxing_reader-${mod.ZXING_WASM_VERSION}.wasm` : prefix + path) });
  return new mod.BarcodeDetector({ formats: FORMATS as never });
}

/** The native detector where it reads product codes, otherwise ZXing. Used for still images (box photos). */
export async function createDetector(): Promise<Detector> {
  return (await nativeDetector()) ?? zxingDetector();
}

/** Phone cameras often stay focused at a distance; a box held close needs continuous autofocus. */
async function focusClose(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const caps = (track?.getCapabilities?.() ?? {}) as any;
  try {
    if (caps.focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
  } catch {}
}

const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 80);

/**
 * Reads a code from a photo. Tries the native reader and ZXing, each on the full picture, on a
 * smaller copy (phone photos are 12+ MP, which hides thin bars) and turned by 90° (box held upright).
 */
async function codeFromPhoto(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const variants: HTMLCanvasElement[] = [];
  for (const max of [1600, 2600]) {
    for (const turn of [false, true]) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
      const c = document.createElement("canvas");
      c.width = turn ? h : w;
      c.height = turn ? w : h;
      const g = c.getContext("2d")!;
      if (turn) {
        g.translate(h, 0);
        g.rotate(Math.PI / 2);
      }
      g.drawImage(bitmap, 0, 0, w, h);
      variants.push(c);
    }
  }
  bitmap.close();
  const detectors = [await nativeDetector(), await zxingDetector()].filter((d): d is Detector => !!d);
  for (const c of variants) {
    for (const d of detectors) {
      const found = await d.detect(c as unknown as HTMLVideoElement).catch(() => []);
      const code = found.map((f) => normBarcode(f.rawValue)).find((x) => x.length >= 6);
      if (code) return code;
    }
  }
  return null;
}

export const cameraAvailable =() => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** Full-screen on phones. Returns the code once it was read twice in a row, which filters out misreads. */
export function BarcodeScanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} label={t("Scan barcode")}>
      <ScannerBody onClose={onClose} onCode={onCode} />
    </Dialog>
  );
}

function ScannerBody({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "failed">("starting");
  const [manual, setManual] = useState("");
  const [photo, setPhoto] = useState<"idle" | "reading" | "none">("idle");
  // Small status line: which reader runs, how many frames it checked, the last error. It shows at
  // a glance whether the scanner is working at all when a code is not picked up.
  const [status, setStatus] = useState("");
  const stats = useRef({ engine: "", frames: 0, error: "" });
  const stopLive = useRef(() => {});
  const done = useRef(onCode);
  useEffect(() => {
    done.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = stats.current;
      setStatus(s.engine ? `${s.engine} · ${s.frames}${s.error ? ` · ${s.error}` : ""}` : "");
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    stopLive.current = () => {
      stopped = true;
      clearTimeout(timer);
    };
    // How often each code was read in the last moments. Frames without a hit are common (blur,
    // glare), so reads need not be consecutive; a valid EAN/UPC check digit is accepted at once.
    const hits = new Map<string, number>();
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (stopped) return;
        await focusClose(stream);
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const native = await nativeDetector();
        // Without a native reader ZXing does all the work; with one, ZXing joins after a moment
        // without a hit and takes every other frame (it reads small or skewed codes the native one misses).
        let zxing: Detector | null = native ? null : await zxingDetector();
        if (stopped) return;
        stats.current.engine = native ? "Android" : "ZXing";
        setState("scanning");
        const started = Date.now();
        let frame = 0;
        let zxingLoading = false;
        const tick = async () => {
          if (stopped) return;
          if (v.readyState >= 2) {
            if (native && !zxing && !zxingLoading && Date.now() - started > 2500) {
              zxingLoading = true;
              zxingDetector().then((d) => { zxing = d; stats.current.engine = "Android + ZXing"; }, (e) => { stats.current.error = `ZXing: ${errText(e)}`; });
            }
            const detector = native && (!zxing || frame++ % 2 === 0) ? native : zxing!;
            stats.current.frames++;
            const found = await detector.detect(v).catch((e) => {
              stats.current.error = errText(e);
              return [];
            });
            for (const code of found.map((f) => normBarcode(f.rawValue)).filter((c) => c.length >= 6)) {
              const n = (hits.get(code) ?? 0) + 1;
              hits.set(code, n);
              if (validGtin(code) || n >= 2) {
                stopped = true;
                navigator.vibrate?.(60);
                done.current(code);
                return;
              }
            }
          }
          timer = window.setTimeout(tick, 100);
        };
        tick();
      } catch (e) {
        stats.current.error = errText(e);
        if (!stopped) setState("failed");
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, []);

  const submitManual = () => {
    const c = normBarcode(manual);
    if (c.length >= 6) onCode(c);
  };

  /** A still photo from the phone's own camera app: full resolution and proper autofocus. */
  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhoto("reading");
    const code = await codeFromPhoto(file).catch((e) => {
      stats.current.error = errText(e);
      return null;
    });
    if (code) {
      stopLive.current();
      navigator.vibrate?.(60);
      onCode(code);
    } else setPhoto("none");
  };

  return (
    <div className="flex flex-col max-md:h-dvh">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 pt-[max(10px,env(safe-area-inset-top))]">
        <h2 className="flex items-center gap-2 font-semibold"><ScanBarcode className="size-4 text-accent" /> {t("Scan barcode")}</h2>
        <IconClose onClick={onClose} label={t("Close")} />
      </div>
      <div className="relative bg-black max-md:flex-1">
        {state === "failed" ? (
          <p className="grid aspect-[4/3] place-items-center px-6 text-center text-white/85 max-md:h-full max-md:aspect-auto">{t("The camera could not be opened.")}</p>
        ) : (
          <>
            <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover max-md:h-full max-md:aspect-auto" />
            {/* Aiming frame: a wide slot fits the barcode on a model box. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative h-[28%] w-[78%] rounded-2xl shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)] ring-2 ring-white/90">
                <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-[var(--flap)]" />
              </div>
            </div>
            <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[13px] font-medium text-white drop-shadow">
              {state === "starting" ? t("Starting camera…") : t("Hold the barcode on the box inside the frame")}
            </p>
          </>
        )}
        {status && <p className="code pointer-events-none absolute top-2 left-3 text-[10px] text-white/60">{status}</p>}
      </div>
      <div className="px-4 pt-3">
        <label className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-white hover:bg-accent-hover">
          <Camera className="size-4" />
          {photo === "reading" ? t("Reading photo…") : t("Take a photo of the barcode")}
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={photo === "reading"} onChange={(e) => { void readPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {photo === "none" && <p role="status" className="mt-2 text-center text-[13px] text-neg">{t("No barcode found in the photo. Hold the phone a little further away and try again.")}</p>}
      </div>
      <form className="flex gap-2 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]" onSubmit={(e) => { e.preventDefault(); submitManual(); }}>
        <Input inputMode="numeric" autoComplete="off" aria-label={t("Or type the number")} placeholder={t("Or type the number")} value={manual} onChange={(e) => setManual(e.target.value)} className="code" />
        <Button type="submit" disabled={normBarcode(manual).length < 6}>{t("Check")}</Button>
      </form>
    </div>
  );
}
