"use client";

import { Check, ExternalLink, ImageDown, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { api, ApiError } from "./AppProvider";
import { Button, cx, Dialog, Input } from "./ui";

export const webImageSearch = (query: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
const bingImages = (query: string) => `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2`;

interface Hit { image: string; thumb: string; title: string; source: string; page: string; width: number | null; height: number | null }
type Result = { enabled: boolean; provider: "google" | "brave" | null; query: string; results: Hit[] };

/** Button that opens the image search; `onPick` gets the chosen picture as a file. */
/** `alt` are simpler fallback searches (registration, airline + type) tried while nothing is found. */
export function ImageSearchButton({ query, alt = [], onPick, variant = "secondary", size, label }: { query: string; alt?: string[]; onPick: (f: File) => void | Promise<void>; variant?: "primary" | "secondary" | "ghost"; size?: "sm"; label?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} disabled={!query} title={query} onClick={() => setOpen(true)}><Search className="size-4" /> {label ?? t("Search photo on the web")}</Button>
      {open && <ImageSearchDialog initial={query} alt={alt} onClose={() => setOpen(false)} onPick={async (f) => { await onPick(f); setOpen(false); }} />}
    </>
  );
}

/** Downloads a picture by URL through the server (or decodes a data: URL) and returns it as a file. */
async function fileFromUrl(url: string): Promise<File> {
  let blob: Blob;
  if (url.startsWith("data:image/")) {
    blob = await (await fetch(url)).blob();
  } else {
    const res = await fetch("/api/image-search/fetch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error ?? "server_error", res.status);
    blob = await res.blob();
  }
  const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return new File([blob], `web-photo.${ext}`, { type: blob.type });
}

/** Picture URLs carried by something dragged from a web page: the <img> itself first, then the link. */
function urlsFromDrop(dt: DataTransfer): string[] {
  const html = dt.getData("text/html");
  const out: string[] = [];
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) out.push(m[1].replace(/&amp;/g, "&"));
  for (const l of dt.getData("text/uri-list").split(/\r?\n/)) if (l && !l.startsWith("#")) out.push(l.trim());
  const plain = dt.getData("text/plain").trim();
  if (/^(https?:|data:image\/)/.test(plain)) out.push(plain);
  const firsts: string[] = [];
  const lasts: string[] = [];
  for (const u of out) {
    try {
      const url = new URL(u);
      // Bing wraps results in links that carry the original picture as mediaurl=…
      const media = url.searchParams.get("mediaurl");
      if (media) firsts.push(media);
      // Bing thumbnails are sized by w/h; without them Bing returns the larger stored copy.
      if (/(^|\.)bing\.(com|net)$/.test(url.hostname) && url.pathname.startsWith("/th")) {
        for (const k of ["w", "h", "c", "rs", "p", "o", "r", "rm"]) url.searchParams.delete(k);
        lasts.push(url.toString());
      }
    } catch {}
  }
  // Order: original picture, full-size thumbnail, then whatever was dropped.
  return [...new Set([...firsts, ...lasts, ...out])].filter((u) => /^(https?:|data:image\/)/.test(u));
}

function ImageSearchDialog({ initial, alt, onClose, onPick }: { initial: string; alt: string[]; onClose: () => void; onPick: (f: File) => Promise<void> }) {
  const { t } = useI18n();
  const [q, setQ] = useState(initial);
  const [frameQ, setFrameQ] = useState(initial);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const load = useCallback((query: string, fallbacks: string[] = []) =>
    api<Result>(`/api/image-search?q=${encodeURIComponent(query.trim())}${fallbacks.map((a) => `&alt=${encodeURIComponent(a)}`).join("")}`)
      .then(setData)
      .catch(() => setError(t("The image search is not reachable right now.")))
      .finally(() => setLoading(false)), [t]);
  const altKey = alt.join("|");
  useEffect(() => {
    void load(initial, altKey ? altKey.split("|") : []);
  }, [load, initial, altKey]);

  const run = (query: string) => {
    if (!query.trim()) return;
    if (data && !data.enabled) return setFrameQ(query.trim());
    setLoading(true);
    setError(null);
    void load(query);
  };

  /** Tries each candidate URL until one is a readable picture. */
  const takeUrls = useCallback(async (urls: string[], key: string) => {
    setTaking(key);
    setError(null);
    let code = "";
    for (const u of urls) {
      try {
        await onPick(await fileFromUrl(u));
        setTaking(null);
        return;
      } catch (e) {
        code = e instanceof ApiError ? e.code : code;
      }
    }
    setTaking(null);
    setError(code === "too_large" ? t("That image is larger than 12 MB.") : t("This picture could not be loaded. Pick another one."));
  }, [onPick, t]);

  // Ctrl+V of a copied picture (right click → "Copy image" in the search) works while the dialog is open.
  const pasteRef = useRef<(e: ClipboardEvent) => void>(() => {});
  useEffect(() => {
    pasteRef.current = (e) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea")) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setTaking("paste");
        void onPick(file).finally(() => setTaking(null));
        return;
      }
      const text = e.clipboardData?.getData("text/plain").trim() ?? "";
      if (/^https?:\/\/\S+$/.test(text)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void takeUrls([text], "paste");
      }
    };
  });
  useEffect(() => {
    const h = (e: ClipboardEvent) => pasteRef.current(e);
    window.addEventListener("paste", h, true);
    return () => window.removeEventListener("paste", h, true);
  }, []);

  const frame = data !== null && !data.enabled;

  return (
    <Dialog open onClose={onClose} label={t("Search photo on the web")} wide={!frame} xl={frame} align="top">
      <div className="flex flex-col p-5 sm:p-6">
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">{t("Search photo on the web")}</h2>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(q); }}>
          <Input aria-label={t("Search")} value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
          <Button type="submit" variant="primary" disabled={(loading && !frame) || !q.trim()}>{loading && !frame ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} {t("Search")}</Button>
        </form>
        {error && <p role="alert" className="mt-3 rounded-xl bg-neg/10 px-3 py-2 text-[13px] font-semibold text-neg">{error}</p>}

        {frame ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
                if (file) {
                  setTaking("drop");
                  void onPick(file).finally(() => setTaking(null));
                  return;
                }
                const urls = urlsFromDrop(e.dataTransfer);
                if (urls.length) void takeUrls(urls, "drop");
                else setError(t("This picture could not be loaded. Pick another one."));
              }}
              className={cx("mt-3 flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-3 text-center text-[13.5px] font-semibold transition-colors", over ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-ink-2")}
            >
              {taking ? <><Loader2 className="size-5 animate-spin" /> {t("Saving…")}</> : <><ImageDown className="size-5 shrink-0" /> {t("Drag the picture you want from the results below onto this field, or right-click it → Copy image and press Ctrl+V.")}</>}
            </div>
            <iframe key={frameQ} src={bingImages(frameQ)} title={t("Web image search")} referrerPolicy="no-referrer" className="mt-3 h-[54vh] w-full rounded-xl border border-line bg-white" />
            <p className="mt-2 text-[11.5px] text-ink-3">
              {t("Results from Bing Images. Pictures belong to their owners; keep them for your own collection.")}{" "}
              <a href={webImageSearch(frameQ)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-accent hover:underline">{t("Open Google Images")} <ExternalLink className="size-3" /></a>
            </p>
          </>
        ) : (
          <>
            <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
              {loading && !data?.results.length
                ? Array.from({ length: 10 }, (_, i) => <li key={i} className="skeleton aspect-[4/3] rounded-xl" />)
                : data?.results.map((h) => (
                  <li key={h.image}>
                    <button type="button" disabled={!!taking} onClick={() => takeUrls(h.thumb !== h.image ? [h.image, h.thumb] : [h.image], h.image)} title={h.title} className={cx("group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-surface-2 transition hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait", taking === h.image && "ring-2 ring-accent")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.thumb} alt={h.title} referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1 text-left text-[10.5px] text-white">{h.source}{h.width && h.height ? ` · ${h.width}×${h.height}` : ""}</span>
                      <span className={cx("absolute inset-0 grid place-items-center bg-black/35 text-white transition-opacity", taking === h.image ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                        {taking === h.image ? <Loader2 className="size-6 animate-spin" /> : <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[12px] font-bold"><Check className="size-3.5" /> {t("Use")}</span>}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            {data && !loading && !data.results.length && <p className="mt-4 text-[13.5px] text-ink-2">{t("No pictures found. Try fewer words.")}</p>}
            {data && !loading && data.query !== q.trim() && data.results.length > 0 && <p className="mt-3 text-[12.5px] text-ink-2">{t("Nothing for the full text, showing results for “{q}”.", { q: data.query })}</p>}
            <p className="mt-1 text-[11.5px] text-ink-3">{t("Click a picture to save it with the model. Pictures belong to their owners; keep them for your own collection.")}</p>
          </>
        )}
        <div className="mt-4 flex justify-end"><Button onClick={onClose}>{t("Close")}</Button></div>
      </div>
    </Dialog>
  );
}
