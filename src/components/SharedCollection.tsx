"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Currency, LiveryCategory } from "@/lib/types";
import { LIVERY_LABEL } from "./ItemForm";
import { ImageOrSilhouette } from "./ModelImage";
import { LocaleSwitch, Wordmark } from "./Shell";
import { Flag, Input, Reg } from "./ui";

export interface SharedItem {
  id: string;
  airlineName: string | null;
  aircraftName: string;
  modelManufacturerName: string;
  scale: string | null;
  registration: string | null;
  itemNumber: string | null;
  liveryCategory: LiveryCategory | null;
  liveryName: string | null;
  countryCode: string | null;
  imageId: string | null;
  shape?: string;
  price: { cents: number; currency: Currency } | null;
  value: { cents: number; currency: Currency } | null;
  date: string | null;
  notes: string | null;
  storage: string | null;
}

export function SharedCollection({ title, items, token }: { title: string; items: SharedItem[]; token: string }) {
  const { t, money, date } = useI18n();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => {
      const hay = [i.airlineName, i.aircraftName, i.modelManufacturerName, i.scale, i.registration, i.liveryName, i.itemNumber].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, q]);
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-7">
      <header className="flex items-center justify-between"><Wordmark /><LocaleSwitch /></header>
      <div className="my-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">{t("{n} models", { n: items.length })}</div>
          <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
        </div>
        <Input aria-label={t("Search")} placeholder={t("Search")} value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-64!" />
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {shown.map((i) => {
          const special = i.liveryCategory && i.liveryCategory !== "standard";
          return (
            <li key={i.id} className="card">
              <div className="relative">
                <ImageOrSilhouette imageId={i.imageId} shape={i.shape} share={token} alt={i.aircraftName} className="aspect-[16/9] w-full rounded-t-lg" />
                {special && <span className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-[3px] bg-board/90 px-1.5 py-0.5 text-[11px] font-medium text-flap">{i.liveryName ?? t(LIVERY_LABEL[i.liveryCategory!])}</span>}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 text-[12px] text-ink-2"><Flag code={i.countryCode} className="shrink-0" /><span className="truncate">{i.airlineName ?? t("Unknown airline")}</span></div>
                <div className="truncate text-[15px] font-semibold tracking-tight">{i.aircraftName}</div>
                <div className="mt-1.5"><Reg>{i.registration}</Reg></div>
                <div className="mt-1.5 truncate text-[12px] text-ink-2">{[i.modelManufacturerName, i.scale].filter(Boolean).join(" · ")}</div>
                {(i.price || i.value || i.date || i.storage || i.notes) && (
                  <dl className="mt-2 space-y-0.5 border-t border-line pt-2 text-[12px]">
                    {i.price && <div className="flex justify-between gap-2"><dt className="text-ink-3">{t("Purchase")}</dt><dd className="num">{money(i.price.cents, i.price.currency)}</dd></div>}
                    {i.value && <div className="flex justify-between gap-2"><dt className="text-ink-3">{t("Value")}</dt><dd className="num">{money(i.value.cents, i.value.currency)}</dd></div>}
                    {i.date && <div className="flex justify-between gap-2"><dt className="text-ink-3">{t("Purchase Date")}</dt><dd className="num">{date(i.date)}</dd></div>}
                    {i.storage && <div className="flex justify-between gap-2"><dt className="text-ink-3">{t("Storage Location")}</dt><dd className="truncate">{i.storage}</dd></div>}
                    {i.notes && <p className="text-ink-2">{i.notes}</p>}
                  </dl>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
