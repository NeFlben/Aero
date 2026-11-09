"use client";

import { ImagePlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ImageSearchButton } from "./ImageSearch";
import { Button, cx } from "./ui";

/**
 * Photos collected while a new model is being entered; they are uploaded once it is saved.
 * Accepts the file picker, Ctrl+V of a copied image and drag and drop.
 */
export function PhotoStager({ files, setFiles, query, alt }: { files: File[]; setFiles: (f: File[]) => void; query: string; alt?: string[] }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const add = (list: FileList | File[] | null | undefined) => {
    const imgs = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFiles([...files, ...imgs].slice(0, 12));
    return imgs.length > 0;
  };
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (addRef.current(e.clipboardData?.files)) e.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div
      className={cx("mb-5 rounded-2xl border border-dashed border-line-strong p-3 transition-colors", dragging && "border-accent bg-accent-soft")}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f, i) => (
          <div key={urls[i]} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[i]} alt={f.name} className="h-14 w-20 rounded-lg object-cover" />
            <button type="button" aria-label={t("Remove photo")} onClick={() => setFiles(files.filter((_, n) => n !== i))} className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-surface"><X className="size-3" /></button>
          </div>
        ))}
        <input ref={input} type="file" accept="image/*" multiple hidden aria-label={t("Add photos")} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <Button size="sm" onClick={() => input.current?.click()}><ImagePlus className="size-4" /> {t("Add photos")}</Button>
        <ImageSearchButton query={query} alt={alt} size="sm" onPick={(f) => { add([f]); }} />
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3 max-md:hidden">{t("Copy an image and press Ctrl+V, or drop it here")}</p>
    </div>
  );
}
