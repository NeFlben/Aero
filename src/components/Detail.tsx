"use client";

import { ArrowLeft, BookPlus, Copy, ImagePlus, Pencil, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { isSpecialLivery } from "@/lib/search";
import { valueChange } from "@/lib/stats";
import type { Currency, Item } from "@/lib/types";
import { api, ApiError, useApp } from "./AppProvider";
import { AreaChart } from "./Charts";
import { BOX_LABEL, CONDITION_LABEL, formFromItem, formToInput, ItemForm, LIVERY_LABEL, STATUS_LABEL, type FormState } from "./ItemForm";
import { ChangeStat } from "./Pages";
import { ImageOrSilhouette, shapeOf } from "./ModelImage";
import { ImageSearchButton } from "./ImageSearch";
import { Button, cx, Dialog, EmptyState, Flag, Panel, Reg } from "./ui";

interface Img { id: string; width: number | null; height: number | null; altText: string | null }
interface Val { cents: number; currency: Currency; date: string; source: string | null }

const Row = ({ k, children, mono }: { k: string; children: ReactNode; mono?: boolean }) =>
  children ? (
    <div className="grid grid-cols-[112px_1fr] gap-3 border-b border-line py-1.5 last:border-b-0 sm:grid-cols-[132px_1fr]">
      <dt className="text-[12.5px] text-ink-3">{k}</dt>
      <dd className={cx("min-w-0 text-[13.5px] break-words", mono && "code")}>{children}</dd>
    </div>
  ) : null;

const SOURCE_LABEL: Record<string, string> = { user_estimate: "Your estimate", import: "Imported", ebay_market: "eBay market price" };

export function Detail({ id }: { id: string }) {
  const { t, money, date, country, locale } = useI18n();
  const { byId, items, ref, types, user, patch, remove, rates, create, toast, openAdd, applyLocal } = useApp();
  const item = byId.get(id);
  const router = useRouter();
  const [images, setImages] = useState<Img[] | null>(null);
  const [values, setValues] = useState<Val[]>([]);
  const [current, setCurrent] = useState(0);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef(item);
  useEffect(() => {
    itemRef.current = item;
  });
  const [dragging, setDragging] = useState(false);

  const upload = useCallback(async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      try {
        await api(`/api/items/${id}/images`, { method: "POST", body: fd });
      } catch (e) {
        const code = e instanceof ApiError ? e.code : "";
        toast(code === "too_large" ? t("That image is larger than 12 MB.") : code === "not_an_image" ? t("That file is not a readable image.") : code === "too_many_images" ? t("A model can have up to 12 images.") : t("Could not upload. Please try again."), { tone: "error" });
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    const r = await api<{ images: Img[] }>(`/api/items/${id}/images`);
    setImages(r.images);
    const cur = itemRef.current;
    if (cur) applyLocal({ ...cur, imageId: r.images[0]?.id ?? null });
  }, [id, t, toast, applyLocal]);


  // An image copied in the browser (for example from the web search) can be pasted straight in.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true], dialog[open]")) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void upload(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  const refresh = useCallback(() => {
    api<{ images: Img[] }>(`/api/items/${id}/images`).then((r) => setImages(r.images)).catch(() => setImages([]));
    api<{ values: Val[] }>(`/api/items/${id}`).then((r) => setValues(r.values)).catch(() => {});
  }, [id]);
  useEffect(refresh, [refresh]);

  if (items === null) return <div className="skeleton h-96 rounded-lg" />;
  if (!item) {
    return <EmptyState title={t("Model not found")} body={t("It may have been deleted.")} action={<Link href="/collection"><Button>{t("Back to collection")}</Button></Link>} />;
  }

  const airline = item.airlineId ? ref?.airlines.find((a) => a.id === item.airlineId) : undefined;
  const type = item.aircraftTypeId ? types.get(item.aircraftTypeId) : undefined;
  const change = valueChange(item, user.baseCurrency, rates);
  const m = (c: number) => money(c, user.baseCurrency);
  const owned = item.status === "collection" || item.status === "sold";

  const startEdit = () => {
    setForm(formFromItem(item, user.baseCurrency, locale));
    setErrors({});
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!form) return;
    const parsed = formToInput(form, t);
    if ("errors" in parsed) return setErrors(parsed.errors);
    setSaving(true);
    try {
      // A value is only re-dated when it actually changed.
      const input = { ...parsed.input };
      if (input.valueCents === item.valueCents && input.valueCurrency === item.valueCurrency) {
        input.valueDate = item.valueDate;
        input.valueSource = item.valueSource;
      }
      await patch(item.id, input);
      setEditing(false);
      toast(t("Saved"));
      refresh();
    } catch {
      toast(t("Could not save. Please try again."), { tone: "error" });
    } finally {
      setSaving(false);
    }
  };


  // The most specific facts first: the item number alone usually finds the exact model.
  const webQuery = [item.modelManufacturerName, item.itemNumber, item.scale, item.airlineName, item.aircraftName, item.registration].filter(Boolean).join(" ");
  const webAlt = [item.registration ?? "", [item.airlineName, item.aircraftName].filter(Boolean).join(" ")].filter(Boolean);

  const dropImage = async (img: Img) => {
    await api(`/api/images/${img.id}`, { method: "DELETE" }).catch(() => toast(t("Could not delete. Please try again."), { tone: "error" }));
    const rest = (images ?? []).filter((x) => x.id !== img.id);
    setImages(rest);
    setCurrent(0);
    applyLocal({ ...item, imageId: rest[0]?.id ?? null });
  };
  const makeMain = async (img: Img) => {
    await api(`/api/images/${img.id}`, { method: "PATCH", json: {} });
    setImages([img, ...(images ?? []).filter((x) => x.id !== img.id)]);
    setCurrent(0);
    applyLocal({ ...item, imageId: img.id });
  };

  const duplicate = async () => {
    const { id: _i, createdAt: _c, updatedAt: _u, imageId: _im, ...rest } = item;
    void _i; void _c; void _u; void _im;
    try {
      const copy = await create(rest);
      toast(t("Copy created"));
      router.push(`/collection/${copy.id}`);
    } catch {
      toast(t("Could not save. Please try again."), { tone: "error" });
    }
  };

  const suggest = async () => {
    try {
      await api("/api/catalog", { json: { airlineId: item.airlineId, airlineName: item.airlineName, aircraftTypeId: item.aircraftTypeId, aircraftName: item.aircraftName, modelManufacturerName: item.modelManufacturerName, scale: item.scale, registration: item.registration, itemNumber: item.itemNumber, liveryCategory: item.liveryCategory, liveryName: item.liveryName } });
      toast(t("Suggested for the catalog. It stays unverified until reviewed."));
    } catch {
      toast(t("Could not save. Please try again."), { tone: "error" });
    }
  };

  const special = isSpecialLivery(item);
  const main = images?.[current];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => router.back()} className="flex h-8 items-center gap-1 text-[13px] text-ink-2 hover:text-ink"><ArrowLeft className="size-3.5" /> {t("Back")}</button>
        <div className="flex flex-wrap gap-1.5">
          {item.status !== "collection" && <Button size="sm" variant="primary" onClick={() => patch(item.id, { status: "collection" })}>{t("Move to Collection")}</Button>}
          <Button size="sm" onClick={startEdit}><Pencil className="size-3.5" /> {t("Edit")}</Button>
          <Button size="sm" onClick={duplicate}><Copy className="size-3.5" /> {t("Duplicate")}</Button>
          {!item.releaseId && <Button size="sm" onClick={suggest}><BookPlus className="size-3.5" /> {t("Suggest for catalog")}</Button>}
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}><Trash2 className="size-3.5" /> {t("Delete")}</Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] lg:gap-5">
        <div className="min-w-0 max-lg:contents lg:space-y-4">
          <div
            className={cx("overflow-hidden card transition-shadow", dragging && "ring-2 ring-accent")}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) void upload(files);
            }}
          >
            <div className="relative">
              <ImageOrSilhouette imageId={main?.id ?? null} registration={item.registration} linkCredit shape={shapeOf(item, types)} size="full" alt={`${item.airlineName ?? ""} ${item.aircraftName}`} className="aspect-[16/9] w-full" />
              {main && (
                <div className="absolute top-2 right-2 flex gap-1">
                  {current > 0 && <button type="button" aria-label={t("Make main image")} onClick={() => makeMain(main)} className="grid size-8 place-items-center rounded-md bg-board/80 text-board-ink"><Star className="size-4" /></button>}
                  <button type="button" aria-label={t("Delete image")} onClick={() => dropImage(main)} className="grid size-8 place-items-center rounded-md bg-board/80 text-board-ink"><X className="size-4" /></button>
                </div>
              )}
              {images !== null && images.length === 0 && (
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/45 to-transparent px-4 pt-10 pb-4 text-center">
                  <p className="text-[13px] font-semibold text-white drop-shadow">{t("No photo of your model yet")}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <ImageSearchButton query={webQuery} alt={webAlt} variant="primary" onPick={(f) => upload([f])} />
                    <Button onClick={() => fileRef.current?.click()} disabled={uploading}><ImagePlus className="size-4" /> {t("Add photos")}</Button>
                  </div>
                  <p className="text-[11.5px] text-white/85 drop-shadow max-md:hidden">{t("Copy an image and press Ctrl+V here, or drop it on the picture")}</p>
                </div>
              )}
            </div>
            <div className="scroll-thin flex items-center gap-2 overflow-x-auto p-2">
              {images?.map((img, i) => (
                <button key={img.id} type="button" aria-label={t("Image {n}", { n: i + 1 })} aria-current={i === current} onClick={() => setCurrent(i)} className={cx("shrink-0 overflow-hidden rounded-[3px] ring-offset-1 ring-offset-surface", i === current && "ring-2 ring-accent")}>
                  <ImageOrSilhouette imageId={img.id} className="h-11 w-16" />
                </button>
              ))}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label={t("Add photos")} onChange={(e) => upload(e.target.files)} />
              <Button size="sm" variant="ghost" disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> {uploading ? t("Uploading") : t("Add photos")}</Button>
              <ImageSearchButton query={webQuery} alt={webAlt} variant="ghost" size="sm" onPick={(f) => upload([f])} />
              <span className="ml-auto hidden shrink-0 pr-2 text-[11.5px] text-ink-3 md:block">{t("Copy an image and press Ctrl+V here, or drop it on the picture")}</span>
            </div>
          </div>

          <div className="min-w-0 space-y-4 max-lg:order-last">
          {owned && (
            <Panel title={t("Value Development")}>
              {values.length > 0 ? (
                <>
                  <AreaChart ariaLabel={t("Value Development")} format={(y) => money(y, values[0].currency)} points={values.map((v) => ({ x: v.date, y: v.cents, label: date(v.date) }))} />
                  <table className="w-full border-t border-line text-[13px]">
                    <thead className="sr-only"><tr><th>{t("Date")}</th><th>{t("Value")}</th><th>{t("Source")}</th></tr></thead>
                    <tbody>
                      {[...values].reverse().slice(0, 8).map((v, i) => (
                        <tr key={i} className="border-b border-line last:border-b-0">
                          <td className="num px-4 py-1.5 text-ink-2">{date(v.date)}</td>
                          <td className="num px-2 py-1.5 font-medium">{money(v.cents, v.currency)}</td>
                          <td className="px-4 py-1.5 text-right text-[12px] text-ink-3">{v.source ? (SOURCE_LABEL[v.source] ? t(SOURCE_LABEL[v.source]) : v.source) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <div className="px-4 py-5">
                  <p className="font-medium">{t("Market value not available")}</p>
                  <p className="mt-0.5 text-[13px] text-ink-2">{t("Hangar does not guess a value. Edit the model to enter your own estimate.")}</p>
                </div>
              )}
            </Panel>
          )}
          </div>
        </div>

        <div className="min-w-0 max-lg:contents lg:space-y-4">
          <div>
            <div className="flex items-center gap-1.5 text-[13px] text-ink-2"><Flag code={item.countryCode} /> {item.airlineName ?? t("Unknown airline")}</div>
            <h1 className="text-2xl font-semibold tracking-tight">{item.aircraftName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {item.registration && <Reg className="text-[14px]">{item.registration}</Reg>}
              {item.scale && <span className="code rounded-[3px] border border-line-strong px-1.5 py-px text-[12px]">{item.scale}</span>}
              {item.status !== "collection" && <span className="rounded-[3px] bg-surface-2 px-1.5 py-px text-[12px]">{t(STATUS_LABEL[item.status])}</span>}
              {special && <span className="rounded-[3px] bg-board px-1.5 py-px text-[12px] font-medium text-flap">{item.liveryName ?? t(LIVERY_LABEL[item.liveryCategory!])}</span>}
            </div>
          </div>

          <div className="grid grid-cols-3 card">
            <div className="min-w-0 border-r border-line p-3"><div className="text-[11.5px] text-ink-2">{t("Purchase Price")}</div><div className="num mt-0.5 truncate text-[15px] font-semibold">{item.purchasePriceCents !== null ? money(item.purchasePriceCents, item.purchaseCurrency ?? "EUR") : "—"}</div></div>
            <div className="min-w-0 border-r border-line p-3"><div className="text-[11.5px] text-ink-2">{t("Current Value")}</div><div className="num mt-0.5 truncate text-[15px] font-semibold">{item.valueCents !== null ? money(item.valueCents, item.valueCurrency ?? "EUR") : <span className="text-[12px] font-normal text-ink-3">{t("Not available")}</span>}</div></div>
            <div className="min-w-0 p-3"><div className="text-[11.5px] text-ink-2">{t("Change")}</div><div className="num mt-0.5 text-[13.5px] font-semibold break-words">{change ? <ChangeStat change={change.absolute} percent={change.percent} money={m} /> : "—"}</div></div>
          </div>

          <Panel title={t("Model")}>
            <dl className="px-4 py-1.5">
              <Row k={t("Manufacturer")}>{item.modelManufacturerName}</Row>
              <Row k={t("Item Number")} mono>{item.itemNumber}</Row>
              <Row k={t("Barcode (EAN)")} mono>{item.barcode}</Row>
              <Row k={t("Livery Type")}>{item.liveryCategory && t(LIVERY_LABEL[item.liveryCategory])}</Row>
              <Row k={t("Livery")}>{item.liveryName}</Row>
              <Row k={t("Condition")}>{item.condition && t(CONDITION_LABEL[item.condition])}</Row>
              <Row k={t("Packaging")}>{item.boxStatus && t(BOX_LABEL[item.boxStatus])}</Row>
              <Row k={t("Limited Edition")}>{item.limitedEdition && t("Yes")}</Row>
              <Row k={t("Certificate")}>{item.certificate && t("Yes")}</Row>
              <Row k={t("Personal Rating")}>{item.rating && "★".repeat(item.rating)}</Row>
            </dl>
          </Panel>
          <Panel title={t("Airline and aircraft")}>
            <dl className="px-4 py-1.5">
              <Row k={t("Airline")}>{item.airlineName}</Row>
              <Row k="IATA / ICAO" mono>{airline && [airline.iata, airline.icao].filter(Boolean).join(" / ")}</Row>
              <Row k={t("Airline Country")}>{item.countryCode && country(item.countryCode)}</Row>
              <Row k={t("Registered in")}>{item.registrationCountry && country(item.registrationCountry)}</Row>
              <Row k={t("Aircraft Manufacturer")}>{type?.manufacturer}</Row>
              <Row k={t("Family")}>{type?.family}</Row>
              <Row k={t("Variant")}>{type?.variant}</Row>
              <Row k={t("ICAO type")} mono>{type?.icaoCode}</Row>
            </dl>
          </Panel>
          <Panel title={t("Purchase and storage")}>
            <dl className="px-4 py-1.5">
              <Row k={t("Purchase Date")}>{item.purchaseDate && date(item.purchaseDate)}</Row>
              <Row k={t("Purchase Source")}>{item.purchaseSource}</Row>
              <Row k={t("Storage Location")}>{item.storageLocation}</Row>
              <Row k={t("Dealer")}>{item.dealer}</Row>
              <Row k={t("Desired Price")}>{item.desiredPriceCents !== null && money(item.desiredPriceCents, item.desiredCurrency ?? "EUR")}</Row>
              <Row k={t("Expected Release")}>{item.expectedRelease && date(item.expectedRelease)}</Row>
              <Row k={t("Added")}>{date(item.createdAt)}</Row>
            </dl>
          </Panel>
          {item.notes && <Panel title={t("Notes")}><p className="px-4 py-3 text-[13.5px] whitespace-pre-wrap">{item.notes}</p></Panel>}
          <Button variant="ghost" size="sm" onClick={() => openAdd({ airlineId: item.airlineId, airlineName: item.airlineName, aircraftTypeId: item.aircraftTypeId, aircraftName: item.aircraftName, modelManufacturerName: item.modelManufacturerName, scale: item.scale, countryCode: item.countryCode })}>{t("Add a similar model")}</Button>
        </div>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} label={t("Edit model")} wide>
        {form && (
          <form onSubmit={(e) => { e.preventDefault(); saveEdit(); }} className="flex max-h-[86dvh] flex-col max-md:h-dvh max-md:max-h-dvh">
            <div className="border-b border-line px-5 py-3 font-semibold">{t("Edit model")}</div>
            <div className="scroll-thin flex-1 overflow-y-auto p-5"><ItemForm form={form} set={(p) => setForm((f) => (f ? { ...f, ...p } : f))} errors={errors} /></div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <Button variant="ghost" onClick={() => setEditing(false)}>{t("Cancel")}</Button>
              <Button type="submit" variant="primary" disabled={saving}>{t("Save")}</Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={confirm} onClose={() => setConfirm(false)} label={t("Delete")}>
        <div className="p-5">
          <h2 className="text-lg font-semibold">{t("Delete this model?")}</h2>
          <p className="mt-1 text-ink-2">{t("You can undo this right afterwards.")}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>{t("Cancel")}</Button>
            <Button variant="danger" onClick={async () => { await remove([item.id]); router.push("/collection"); }}>{t("Delete")}</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export type { Item };
