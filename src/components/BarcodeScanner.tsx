"use client";

import { ScanBarcode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { normBarcode } from "@/lib/smart";
import { Button, Dialog, IconClose, Input } from "./ui";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/**
 * The browser's own BarcodeDetector where it exists (Chrome on Android), otherwise the same API
 * backed by ZXing in WebAssembly (iPhone, desktop). The .wasm file is served from /vendor, so no
 * third-party CDN is contacted.
 */
async function createDetector(): Promise<Detector> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Native = (globalThis as any).BarcodeDetector;
  if (Native) {
    try {
      const supported: string[] = await Native.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.length) return new Native({ formats });
    } catch {}
  }
  const mod = await import("barcode-detector/ponyfill");
  mod.setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/vendor/zxing_reader-${mod.ZXING_WASM_VERSION}.wasm` : prefix + path) });
  return new mod.BarcodeDetector({ formats: FORMATS as never });
}

export const cameraAvailable = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

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
  const done = useRef(onCode);
  useEffect(() => {
    done.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let last = "";
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const detector = await createDetector();
        if (stopped) return;
        setState("scanning");
        const tick = async () => {
          if (stopped) return;
          if (v.readyState >= 2) {
            const found = await detector.detect(v).catch(() => []);
            const code = found.map((f) => normBarcode(f.rawValue)).find((c) => c.length >= 6);
            if (code && code === last) {
              stopped = true;
              navigator.vibrate?.(60);
              done.current(code);
              return;
            }
            last = code ?? "";
          }
          timer = window.setTimeout(tick, 120);
        };
        tick();
      } catch {
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
      </div>
      <form className="flex gap-2 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]" onSubmit={(e) => { e.preventDefault(); submitManual(); }}>
        <Input inputMode="numeric" autoComplete="off" aria-label={t("Or type the number")} placeholder={t("Or type the number")} value={manual} onChange={(e) => setManual(e.target.value)} className="code" />
        <Button type="submit" disabled={normBarcode(manual).length < 6}>{t("Check")}</Button>
      </form>
    </div>
  );
}
