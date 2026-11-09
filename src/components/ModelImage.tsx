"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Silhouette } from "./Silhouette";
import { cx } from "./ui";
import type { Item } from "@/lib/types";

export function shapeOf(item: Pick<Item, "aircraftTypeId">, types: Map<string, { shape: string }>) {
  return item.aircraftTypeId ? types.get(item.aircraftTypeId)?.shape : undefined;
}

interface AircraftPhoto { src: string; large: string; link: string; photographer: string }
const photoCache = new Map<string, Promise<AircraftPhoto | null>>();

/** Photo of the real aircraft with this registration (Planespotters.net), looked up once per session. */
export function useAircraftPhoto(registration: string | null | undefined, enabled = true) {
  const reg = enabled ? registration?.trim().toUpperCase() || null : null;
  const [state, setState] = useState<{ reg: string | null; photo: AircraftPhoto | null }>({ reg: null, photo: null });
  useEffect(() => {
    if (!reg) return;
    let live = true;
    if (!photoCache.has(reg)) {
      photoCache.set(reg, fetch(`/api/aircraft-photo?reg=${encodeURIComponent(reg)}`).then((r) => (r.ok ? r.json() : { photo: null })).then((d) => d.photo ?? null).catch(() => null));
    }
    photoCache.get(reg)!.then((photo) => live && setState({ reg, photo }));
    return () => {
      live = false;
    };
  }, [reg]);
  return state.reg === reg ? state.photo : null;
}

type ImgItem = Pick<Item, "imageId" | "aircraftTypeId"> & { aircraftName: string; registration?: string | null };

/** Uploaded photo, else a photo of the real aircraft found by registration, else the neutral silhouette. */
export function ModelImage({ item, size = "thumb", className, alt, share, linkCredit }: { item: ImgItem; size?: "thumb" | "full"; className?: string; alt?: string; share?: string; linkCredit?: boolean }) {
  const { types } = useApp();
  return <ImageOrSilhouette imageId={item.imageId} shape={shapeOf(item, types)} size={size} className={className} alt={alt ?? item.aircraftName} share={share} registration={item.registration} linkCredit={linkCredit} />;
}

export function ImageOrSilhouette({ imageId, shape, size = "thumb", className, alt, share, registration, linkCredit }: { imageId: string | null; shape?: string; size?: "thumb" | "full"; className?: string; alt?: string; share?: string; registration?: string | null; linkCredit?: boolean }) {
  // Shared (public) pages never call out to the photo service.
  const photo = useAircraftPhoto(registration, !imageId && !share);
  if (imageId) {
    const q = new URLSearchParams();
    if (size === "thumb") q.set("size", "thumb");
    if (share) q.set("share", share);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/images/${imageId}?${q}`} alt={alt ?? ""} loading="lazy" decoding="async" draggable={false} className={cx("object-contain", className)} style={{ background: "var(--sil-bg)" }} />
    );
  }
  if (photo) {
    const credit = (
      <>
        <Camera className="size-3 shrink-0" /> <span className="truncate">{photo.photographer}</span>
      </>
    );
    const creditCls = "absolute right-2 bottom-2 flex max-w-[70%] items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur";
    return (
      <div className={cx("relative overflow-hidden", className)} style={{ background: "var(--sil-bg)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} alt={alt ?? ""} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
        {linkCredit ? (
          <a href={photo.link} target="_blank" rel="noreferrer noopener" title="Planespotters.net" className={cx(creditCls, "hover:bg-black/75")}>{credit}</a>
        ) : (
          <span title={`${photo.photographer} · Planespotters.net`} className={creditCls}>{credit}</span>
        )}
      </div>
    );
  }
  return (
    <div className={cx("grid place-items-center overflow-hidden", className)} style={{ background: "var(--sil-bg)", color: "var(--sil)" }}>
      <Silhouette shape={shape} className="w-[72%] max-w-[420px]" />
    </div>
  );
}
