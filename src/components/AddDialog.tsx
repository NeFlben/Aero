"use client";

import { ArrowLeft, BadgeCheck, Camera, CircleHelp, Copy, ScanBarcode, Search, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readBoxText, resolveBoxReading } from "@/lib/boxScan";
import { useI18n } from "@/lib/i18n";
import { compact, findDuplicates, normBarcode, parseSmartQuery } from "@/lib/smart";
import { aircraftLabel, type Item, type ItemInput, type ReleaseRef } from "@/lib/types";
import { api, ApiError, useApp } from "./AppProvider";
import { blankForm, formFromItem, formToInput, ItemForm, LIVERY_LABEL, type FormState } from "./ItemForm";
import { BarcodeScanner, cameraAvailable } from "./BarcodeScanner";
import { BoxScanProgress, readBoxPhotos, type BoxStep } from "./BoxScan";

/** All six sides of a box. */
const MAX_BOX_PHOTOS = 6;
import { ImageOrSilhouette } from "./ModelImage";
import { PhotoStager } from "./PhotoStager";
import { Button, btnClass, cx, Dialog, Flag, IconClose, Reg } from "./ui";

const DRAFT_KEY = "hangar:add-draft";
const LAST_KEY = "hangar:add-last";
const store = {
  get<T>(k: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(k) ?? "null");
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

interface Suggestion {
  key: string;
  kind: "release" | "own" | "recognised";
  title: string;
  sub: string;
  meta: string[];
  reg?: string | null;
  livery?: string | null;
  imageId?: string | null;
  shape?: string;
  flag?: string | null;
  verified?: boolean;
  apply: () => void;
}

export function AddDialog() {
  const { addOpen, closeAdd, addSeed } = useApp();
  return (
    <Dialog open={addOpen} onClose={closeAdd} label="Add Aircraft" wide align="top">
      <AddFlow key={addOpen ? "open" : "closed"} seed={addSeed} />
    </Dialog>
  );
}

function AddFlow({ seed }: { seed: ReturnType<typeof useApp>["addSeed"] }) {
  const { t, locale } = useI18n();
  const { user, ref, items, closeAdd, create, toast, types, applyLocal } = useApp();
  const [step, setStep] = useState<"search" | "form">(seed ? "form" : "search");
  const [q, setQ] = useState("");
  const [releases, setReleases] = useState<ReleaseRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [form, setForm] = useState<FormState>(() => (seed ? formFromItem({ purchaseDate: seed.status === "wishlist" ? undefined : new Date().toLocaleDateString("sv"), ...seed }, user.baseCurrency, locale) : blankForm(user.baseCurrency)));
  const [unsure, setUnsure] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupes, setDupes] = useState<Item[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [draftFound, setDraftFound] = useState<FormState | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [unsureFrom, setUnsureFrom] = useState<"search" | "photo">("search");
  const [boxBusy, setBoxBusy] = useState<File[] | null>(null);
  // Shown in the dialog: a toast would sit behind the modal.
  const [boxError, setBoxError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<{ filled: number; warnings: string[]; release: ReleaseRef | null } | null>(null);
  const [boxStep, setBoxStep] = useState<{ step: BoxStep; photo: number }>({ step: "loading", photo: 0 });
  const boxInput = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "search") inputRef.current?.focus();
  }, [step]);

  // An unsaved draft from earlier is offered, not silently applied.
  useEffect(() => {
    if (seed) return;
    const d = store.get<FormState>(DRAFT_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d?.aircraftName || d?.airlineName) setDraftFound(d);
  }, [seed]);

  useEffect(() => {
    if (step === "form" && (form.aircraftName || form.airlineName)) store.set(DRAFT_KEY, form);
  }, [form, step]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReleases([]);
      return;
    }
    const ctl = new AbortController();
    const h = setTimeout(() => {
      setSearching(true);
      fetch(`/api/catalog?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { releases: [] }))
        .then((r) => setReleases(r.releases ?? []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 180);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [q]);

  const open = useCallback((partial: Partial<ItemInput>, uncertain: string[] = [], from: "search" | "photo" = "search") => {
    const last = store.get<{ maker?: string; scale?: string }>(LAST_KEY);
    const f = formFromItem({ purchaseDate: new Date().toLocaleDateString("sv"), ...partial }, user.baseCurrency, locale);
    f.modelManufacturerName ||= last?.maker ?? "";
    // A box that shows no scale must not silently inherit the last one.
    if (from === "search") f.scale ||= last?.scale ?? "";
    setForm(f);
    setUnsure(new Set(uncertain));
    setUnsureFrom(from);
    if (from === "search") setScanInfo(null);
    setErrors({});
    setStep("form");
  }, [user.baseCurrency, locale]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const term = q.trim();
    if (term.length < 2 || !ref) return [];
    const out: Suggestion[] = [];
    const airlineCountry = (id: string | null) => ref.airlines.find((a) => a.id === id)?.country ?? null;

    for (const r of releases) {
      out.push({
        key: `r:${r.id}`, kind: "release", title: [r.airlineName, r.aircraftName].filter(Boolean).join(" · "), sub: "",
        meta: [r.modelManufacturerName, r.scale, r.itemNumber].filter(Boolean) as string[], reg: r.registration,
        livery: r.liveryName ?? (r.liveryCategory && r.liveryCategory !== "standard" ? t(LIVERY_LABEL[r.liveryCategory]) : null),
        imageId: r.imageId, shape: r.aircraftTypeId ? types.get(r.aircraftTypeId)?.shape : undefined, flag: airlineCountry(r.airlineId), verified: r.status === "verified",
        apply: () => open({ releaseId: r.id, airlineId: r.airlineId, airlineName: r.airlineName, aircraftTypeId: r.aircraftTypeId, aircraftName: r.aircraftName, modelManufacturerName: r.modelManufacturerName, scale: r.scale, registration: r.registration, itemNumber: r.itemNumber, barcode: r.barcode, liveryCategory: r.liveryCategory, liveryName: r.liveryName, countryCode: airlineCountry(r.airlineId) }),
      });
    }

    const p = parseSmartQuery(term, ref);
    const recognisedAny = p.airline || p.aircraft.length || p.maker || p.registration;
    if (recognisedAny) {
      const base: Partial<ItemInput> = {
        airlineId: p.airline?.id ?? null, airlineName: p.airline?.name ?? null, countryCode: p.airline?.country ?? null, modelManufacturerName: p.maker?.name ?? "",
        scale: p.scale, registration: p.registration, itemNumber: p.itemNumber, liveryName: p.rest.length ? p.rest.join(" ") : null,
      };
      const marks = [p.registration && "registration", p.itemNumber && "itemNumber", p.rest.length && "liveryName"].filter(Boolean) as string[];
      const variants = p.aircraft.length ? p.aircraft.slice(0, 6) : [null];
      for (const a of variants) {
        out.push({
          key: `p:${a?.id ?? "none"}`, kind: "recognised",
          title: [p.airline?.name, a ? aircraftLabel(a) : null].filter(Boolean).join(" · ") || p.maker?.name || p.registration || term,
          sub: "", meta: [p.maker?.name, p.scale, p.itemNumber].filter(Boolean) as string[], reg: p.registration, livery: p.rest.join(" ") || null,
          shape: a?.shape, flag: p.airline?.country,
          apply: () => open({ ...base, aircraftTypeId: a?.id ?? null, aircraftName: a ? aircraftLabel(a) : "" }, marks),
        });
      }
    }

    // A model already owned is a useful template for a second copy or a sibling.
    const needle = term.toLowerCase();
    const own = (items ?? []).filter((i) => [i.airlineName, i.aircraftName, i.registration, i.itemNumber, i.barcode].some((v) => v?.toLowerCase().includes(needle))).slice(0, 3);
    for (const i of own) {
      out.push({
        key: `o:${i.id}`, kind: "own", title: [i.airlineName, i.aircraftName].filter(Boolean).join(" · "), sub: "",
        meta: [i.modelManufacturerName, i.scale, i.itemNumber].filter(Boolean) as string[], reg: i.registration, livery: i.liveryName, imageId: i.imageId,
        shape: i.aircraftTypeId ? types.get(i.aircraftTypeId)?.shape : undefined, flag: i.countryCode,
        apply: () => open({ releaseId: i.releaseId, airlineId: i.airlineId, airlineName: i.airlineName, aircraftTypeId: i.aircraftTypeId, aircraftName: i.aircraftName, modelManufacturerName: i.modelManufacturerName, scale: i.scale, registration: i.registration, itemNumber: i.itemNumber, liveryCategory: i.liveryCategory, liveryName: i.liveryName, countryCode: i.countryCode }),
      });
    }
    return out;
  }, [q, ref, releases, items, types, open, t]);

  const finish = async (forceDuplicate = false) => {
    const parsed = formToInput(form, t);
    if ("errors" in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    if (!forceDuplicate) {
      const found = findDuplicates(
        { airlineName: parsed.input.airlineName ?? null, aircraftName: parsed.input.aircraftName, modelManufacturerName: parsed.input.modelManufacturerName, scale: parsed.input.scale ?? null, registration: parsed.input.registration ?? null, itemNumber: parsed.input.itemNumber ?? null, liveryName: parsed.input.liveryName ?? null, barcode: parsed.input.barcode ?? null },
        items ?? [],
      );
      if (found.length) {
        setDupes(found);
        return;
      }
    }
    setSaving(true);
    try {
      const made = await create(parsed.input);
      // Photos go up after the model exists; a failed upload must not lose the saved model.
      let firstImage: string | null = null;
      for (const file of photos) {
        const fd = new FormData();
        fd.set("file", file);
        const r = await api<{ image: { id: string } }>(`/api/items/${made.id}/images`, { method: "POST", body: fd }).catch(() => null);
        firstImage ??= r?.image.id ?? null;
      }
      if (firstImage) applyLocal({ ...made, imageId: firstImage });
      if (photos.length && !firstImage) toast(t("Could not upload. Please try again."), { tone: "error" });
      store.set(DRAFT_KEY, null);
      store.set(LAST_KEY, { maker: parsed.input.modelManufacturerName, scale: parsed.input.scale });
      toast(parsed.input.status === "collection" ? t("Added to your collection") : t("Added to your wishlist"));
      closeAdd();
    } catch (e) {
      toast(e instanceof ApiError && e.code === "rate_limited" ? t("Too many requests. Please wait a moment.") : t("Could not save. Please try again."), { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const [hasCamera, setHasCamera] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHasCamera(cameraAvailable()), []);

  /** A scanned box: already owned → duplicate screen; in the catalog → prefilled; otherwise a form with the code. */
  const scanned = async (raw: string) => {
    setScanOpen(false);
    const code = normBarcode(raw);
    const mine = (items ?? []).filter((i) => i.barcode && normBarcode(i.barcode) === code);
    const template = (i: Item | ReleaseRef) => ({ airlineId: i.airlineId, airlineName: i.airlineName, aircraftTypeId: i.aircraftTypeId, aircraftName: i.aircraftName, modelManufacturerName: i.modelManufacturerName, scale: i.scale, registration: i.registration, itemNumber: i.itemNumber, liveryCategory: i.liveryCategory, liveryName: i.liveryName, barcode: code });
    if (mine.length) {
      open({ ...template(mine[0]), releaseId: mine[0].releaseId, countryCode: mine[0].countryCode });
      setDupes(mine);
      return;
    }
    const hit = await fetch(`/api/catalog?q=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : { releases: [] }))
      .then((r: { releases?: ReleaseRef[] }) => (r.releases ?? []).find((x) => x.barcode && normBarcode(x.barcode) === code))
      .catch(() => undefined);
    if (hit) {
      open({ ...template(hit), releaseId: hit.id, countryCode: ref?.airlines.find((a) => a.id === hit.airlineId)?.country ?? null });
      toast(t("Found in the catalog"));
      return;
    }
    open({ barcode: code });
    toast(t("Not in your collection yet. Fill in the rest."));
  };

  /**
   * Photos of a box → what is printed on it → reference names and ids → catalog release if one
   * matches → duplicate check → a prefilled form with every uncertain field marked.
   */
  const scanBox = async (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || f.type === "").slice(0, MAX_BOX_PHOTOS);
    if (!files.length || !ref || boxBusy) return;
    setBoxBusy(files);
    setBoxError(null);
    try {
      const { pages, barcode } = await readBoxPhotos(files, (s, photo) => setBoxStep({ step: s, photo }));
      const reading = readBoxText(pages, ref);
      if (!reading.isModelBox && !barcode) {
        setBoxError(t("Nothing readable was found. Try sharper photos with the labels in view."));
        return;
      }
      const r = resolveBoxReading(reading, ref, barcode);
      let input = r.input;
      let unsureKeys = r.unsure;

      // A catalog release with the same barcode, or the same brand and item number, is better data than a reading.
      let release: ReleaseRef | null = null;
      for (const key of [input.barcode, input.itemNumber].filter(Boolean) as string[]) {
        const found: ReleaseRef[] = await fetch(`/api/catalog?q=${encodeURIComponent(key)}`)
          .then((x) => (x.ok ? x.json() : { releases: [] }))
          .then((x: { releases?: ReleaseRef[] }) => x.releases ?? [])
          .catch(() => []);
        release = found.find((x) =>
          (input.barcode && x.barcode && normBarcode(x.barcode) === input.barcode) ||
          (input.itemNumber && x.itemNumber && compact(x.itemNumber) === compact(input.itemNumber) && compact(x.modelManufacturerName) === compact(input.modelManufacturerName ?? "")),
        ) ?? null;
        if (release) break;
      }
      if (release) {
        const rel = release;
        const fromRelease: Partial<ItemInput> = {
          releaseId: rel.id, airlineId: rel.airlineId, airlineName: rel.airlineName, aircraftTypeId: rel.aircraftTypeId, aircraftName: rel.aircraftName, modelManufacturerName: rel.modelManufacturerName,
          scale: rel.scale, registration: rel.registration, itemNumber: rel.itemNumber, barcode: rel.barcode, liveryCategory: rel.liveryCategory, liveryName: rel.liveryName,
          countryCode: ref.airlines.find((a) => a.id === rel.airlineId)?.country ?? input.countryCode ?? null,
        };
        const kept = Object.fromEntries(Object.entries(fromRelease).filter(([, v]) => v !== null && v !== undefined && v !== ""));
        input = { ...input, ...kept };
        // A verified release settles the fields it carries.
        if (rel.status === "verified") unsureKeys = unsureKeys.filter((k) => !(k in kept));
      }

      setPhotos(files);
      setScanInfo({ filled: r.filled, warnings: r.warnings.map((w) => (w === "barcode_checksum" ? t("The barcode digits could not be confirmed and were left out.") : w)), release });
      open(input, unsureKeys, "photo");

      const mine = findDuplicates(
        { airlineName: input.airlineName ?? null, aircraftName: input.aircraftName ?? "", modelManufacturerName: input.modelManufacturerName ?? "", scale: input.scale ?? null, registration: input.registration ?? null, itemNumber: input.itemNumber ?? null, liveryName: input.liveryName ?? null, barcode: input.barcode ?? null },
        items ?? [],
      );
      if (mine.length) setDupes(mine);
    } catch {
      setBoxError(t("The photos could not be read. Please try again."));
    } finally {
      setBoxBusy(null);
    }
  };

  // Ctrl+V of a box photo on the search screen starts the reading.
  const scanRef = useRef(scanBox);
  useEffect(() => {
    scanRef.current = scanBox;
  });
  useEffect(() => {
    if (step !== "search") return;
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (imgs.length) {
        e.preventDefault();
        void scanRef.current(imgs);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step]);

  if (dupes) {
    const d = dupes[0];
    return (
      <div className="p-6">
        <div className="eyebrow mb-2">{t("Duplicate check")}</div>
        <h2 className="text-lg font-semibold tracking-tight">{t("This model is already in your collection.")}</h2>
        <div className="mt-4 flex items-center gap-3 rounded-md border border-line p-3">
          <ImageOrSilhouette imageId={d.imageId} shape={d.aircraftTypeId ? types.get(d.aircraftTypeId)?.shape : undefined} className="h-14 w-24 shrink-0 rounded-[3px]" />
          <div className="min-w-0">
            <div className="truncate font-medium">{[d.airlineName, d.aircraftName].filter(Boolean).join(" · ")}</div>
            <div className="truncate text-[13px] text-ink-2">{[d.modelManufacturerName, d.scale, d.itemNumber].filter(Boolean).join(" · ")}</div>
            {d.registration && <Reg className="mt-1 inline-block">{d.registration}</Reg>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/collection/${d.id}`} onClick={closeAdd} className={btnClass("secondary")}>{t("Open existing model")}</Link>
          <Button variant="primary" disabled={saving} onClick={() => { setDupes(null); finish(true); }}>{t("Add another copy")}</Button>
          <Button variant="ghost" onClick={() => setDupes(null)}>{t("Correct my entry")}</Button>
        </div>
      </div>
    );
  }

  if (step === "form") {
    const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
    const isCollection = form.status === "collection";
    return (
      <form onSubmit={(e) => { e.preventDefault(); finish(); }} className="flex max-h-[86dvh] flex-col max-md:h-dvh max-md:max-h-dvh">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <button type="button" onClick={() => setStep("search")} className="flex h-8 items-center gap-1 text-[13px] text-ink-2 hover:text-ink max-md:h-11"><ArrowLeft className="size-3.5" /> {t("Back to search")}</button>
          <IconClose onClick={closeAdd} label={t("Close")} />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-4 sm:p-5">
          {scanInfo && (
            <div className="fade-in mb-4 rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-[13px]">
              <p className="flex items-center gap-2 font-semibold">
                <Camera className="size-4 shrink-0 text-accent" />
                {scanInfo.release
                  ? (scanInfo.release.status === "verified" ? t("Read from the box and found in the catalog (verified).") : t("Read from the box and found in the catalog (unverified)."))
                  : t("{n} fields read from the box.", { n: scanInfo.filled })}
              </p>
              {unsure.size > 0 && <p className="mt-1 text-ink-2">{t("Marked fields were hard to read or deduced. Please check them.")}</p>}
              {scanInfo.warnings.map((w) => (
                <p key={w} className="mt-1 flex items-start gap-1.5 text-signal"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{w}</p>
              ))}
            </div>
          )}
          <PhotoStager files={photos} setFiles={setPhotos} query={[form.modelManufacturerName, form.itemNumber, form.scale, form.airlineName, form.aircraftName, form.registration].map((x) => x.trim()).filter(Boolean).join(" ")} alt={[form.registration.trim(), [form.airlineName, form.aircraftName].map((x) => x.trim()).filter(Boolean).join(" ")].filter(Boolean)} />
          <ItemForm form={form} set={set} errors={errors} unsure={unsure} unsureFrom={unsureFrom} compact />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:[&>[type=submit]]:col-span-2">
          <Button variant="ghost" onClick={() => { store.set(DRAFT_KEY, null); closeAdd(); }}>{t("Discard")}</Button>
          {isCollection && <Button disabled={saving} onClick={() => { set({ status: "wishlist", purchaseDate: "" }); }}>{t("Put on wishlist instead")}</Button>}
          <Button type="submit" variant="primary" disabled={saving}>{isCollection ? t("Add to Collection") : t("Add to Wishlist")}</Button>
        </div>
      </form>
    );
  }

  if (boxBusy) {
    return (
      <div className="flex max-h-[80dvh] flex-col max-md:h-dvh max-md:max-h-dvh">
        <div className="flex items-start justify-between gap-2 px-5 pt-5">
          <h2 className="text-xl font-semibold tracking-tight">{t("Reading your box")}</h2>
          <IconClose onClick={closeAdd} label={t("Close")} />
        </div>
        <div className="flex flex-1 items-center justify-center"><BoxScanProgress files={boxBusy} step={boxStep.step} photo={boxStep.photo} /></div>
      </div>
    );
  }

  const groupLabel: Record<Suggestion["kind"], string> = { release: t("Catalog"), recognised: t("Recognised from your search"), own: t("From your collection") };
  const groups = (["release", "recognised", "own"] as const).map((k) => ({ k, list: suggestions.filter((s) => s.kind === k) })).filter((g) => g.list.length);
  let rowIndex = -1;

  return (
    <div className="flex max-h-[80dvh] flex-col max-md:h-dvh max-md:max-h-dvh">
      <div className="flex items-start justify-between gap-2 px-5 pt-5">
        <h2 className="text-xl font-semibold tracking-tight">{t("Which aircraft would you like to add?")}</h2>
        <IconClose onClick={closeAdd} label={t("Close")} />
      </div>
      <div className="px-5 pt-3 pb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input
              ref={inputRef}
              value={q}
              aria-label={t("Search aircraft, airline, registration or item number...")}
              placeholder={t("Search aircraft, airline, registration or item number...")}
              enterKeyHint="search"
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                else if (e.key === "Enter") {
                  e.preventDefault();
                  const ordered = groups.flatMap((g) => g.list);
                  if (ordered[active]) ordered[active].apply();
                  else if (q.trim()) open({});
                }
              }}
              className="h-12 w-full rounded-md border border-line-strong bg-surface pr-3 pl-9 text-[15px] placeholder:text-ink-3 focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none max-md:text-base"
            />
          </div>
          <Button className="h-12 w-12 shrink-0 px-0" aria-label={t("Photo of the box")} title={t("Photo of the box")} onClick={() => boxInput.current?.click()}><Camera className="size-5" /></Button>
          {hasCamera && <Button className="h-12 w-12 shrink-0 px-0" aria-label={t("Scan barcode")} title={t("Scan barcode")} onClick={() => setScanOpen(true)}><ScanBarcode className="size-5" /></Button>}
        </div>
        <input ref={boxInput} type="file" accept="image/*" multiple hidden aria-label={t("Photo of the box")} onChange={(e) => { void scanBox(e.target.files); e.target.value = ""; }} />
        {boxError && (
          <p role="alert" className="fade-in mt-3 flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-neg">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />{boxError}
          </p>
        )}
        {!q.trim() && !draftFound && (
          <button type="button" onClick={() => boxInput.current?.click()} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft">
            <span className="grad grid size-10 shrink-0 place-items-center rounded-full text-white"><Camera className="size-5" /></span>
            <span className="min-w-0">
              <span className="block font-semibold">{t("Take a photo of the box")}</span>
              <span className="block text-[12.5px] text-ink-2">{t("Photograph every side. Brand, item number, scale, airline, type, registration and barcode are read on this device and filled in. Up to 6 photos.")}</span>
            </span>
          </button>
        )}
        {draftFound && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-[13px]">
            <span>{t("Continue your unsaved entry: {name}", { name: [draftFound.airlineName, draftFound.aircraftName].filter(Boolean).join(" · ") })}</span>
            <span className="flex gap-1">
              <Button size="sm" onClick={() => { setForm(draftFound); setStep("form"); }}>{t("Continue")}</Button>
              <Button size="sm" variant="ghost" onClick={() => { store.set(DRAFT_KEY, null); setDraftFound(null); }}>{t("Discard")}</Button>
            </span>
          </div>
        )}
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onCode={(code) => void scanned(code)} />

      <div className="scroll-thin flex-1 overflow-y-auto border-t border-line empty:hidden">
        {groups.map((g) => (
          <section key={g.k}>
            <div className="eyebrow sticky top-0 z-10 flex items-center gap-1.5 bg-surface px-5 pt-3 pb-1.5">
              {g.k === "recognised" && <Sparkles className="size-3" />}
              {g.k === "own" && <Copy className="size-3" />}
              {groupLabel[g.k]}
            </div>
            <ul>
              {g.list.map((s) => {
                rowIndex++;
                const idx = rowIndex;
                return (
                  <li key={s.key}>
                    <button type="button" onClick={s.apply} onMouseEnter={() => setActive(idx)} className={cx("flex w-full items-center gap-3 px-5 py-2 text-left", active === idx && "bg-accent-soft")}>
                      <ImageOrSilhouette imageId={s.imageId ?? null} shape={s.shape} className="h-11 w-[72px] shrink-0 rounded-[3px]" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-medium"><Flag code={s.flag} /><span className="truncate">{s.title}</span></span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-2">
                          {s.reg && <Reg>{s.reg}</Reg>}
                          {s.meta.length > 0 && <span className="truncate">{s.meta.join(" · ")}</span>}
                          {s.livery && <span className="text-accent">{s.livery}</span>}
                        </span>
                      </span>
                      {s.kind === "release" && (s.verified
                        ? <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-pos"><BadgeCheck className="size-3.5" />{t("Verified")}</span>
                        : <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-signal"><CircleHelp className="size-3.5" />{t("Unverified")}</span>)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {q.trim().length >= 2 && !searching && groups.length === 0 && <p className="px-5 pt-5 text-ink-2">{t("No matches for this search.")}</p>}
        <div className="px-5 py-4">
          <button type="button" onClick={() => open({})} className="text-[13.5px] font-medium text-accent hover:underline">{t("Can't find your aircraft? Add it manually.")}</button>
          {groups.some((g) => g.k === "recognised") && <p className="mt-1 text-[12px] text-ink-3">{t("Recognised entries are built from your text and our reference lists. They are not a confirmed model release.")}</p>}
        </div>
      </div>
    </div>
  );
}
