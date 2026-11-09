"use client";

import { BadgeCheck, ExternalLink, RefreshCw, Store } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Item } from "@/lib/types";
import { api, ApiError, useApp } from "./AppProvider";
import { AreaChart } from "./Charts";
import { Button, Panel } from "./ui";

interface Listing { title: string; cents: number; currency: "EUR"; url: string; image: string | null; condition: string | null }
interface Snapshot { id: string; date: string; query: string; exact: boolean; count: number; medianCents: number | null; lowCents: number | null; highCents: number | null; listings: Listing[] }

/** Current eBay offers for this model and the price history built from earlier lookups. */
export function MarketPanel({ item, onValue }: { item: Item; onValue: () => void }) {
  const { t, money, date } = useI18n();
  const { patch, toast } = useApp();
  const [data, setData] = useState<{ enabled: boolean; snapshots: Snapshot[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean; snapshots: Snapshot[] }>(`/api/items/${item.id}/market`).then(setData).catch(() => setData({ enabled: false, snapshots: [] }));
  }, [item.id]);

  const check = useCallback(async () => {
    setBusy(true);
    try {
      const { snapshot } = await api<{ snapshot: Snapshot }>(`/api/items/${item.id}/market`, { method: "POST" });
      setData((d) => d && { ...d, snapshots: [...d.snapshots.filter((s) => s.date !== snapshot.date), snapshot] });
    } catch (e) {
      toast(e instanceof ApiError && e.code === "rate_limited" ? t("Too many lookups. Try again in a minute.") : t("eBay could not be reached. Please try again later."), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }, [item.id, t, toast]);

  if (!data) return <div className="skeleton h-40 rounded-3xl" />;

  const last = data.snapshots.at(-1);
  const priced = data.snapshots.filter((s) => s.medianCents !== null);
  const take = async () => {
    if (!last?.medianCents) return;
    await patch(item.id, { valueCents: last.medianCents, valueCurrency: "EUR", valueDate: last.date, valueSource: "ebay_market" });
    toast(t("Saved"));
    onValue();
  };

  return (
    <Panel
      title={t("Market price")}
      icon={<Store />}
      aside={data.enabled && <Button size="sm" variant="ghost" disabled={busy} onClick={check}><RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} /> {busy ? t("Checking…") : t("Check now")}</Button>}
    >
      {!data.enabled ? (
        <div className="px-5 py-5 text-[13px] text-ink-2">
          <p className="font-semibold text-ink">{t("Market prices are off")}</p>
          <p className="mt-1">{t("Add a free eBay developer keyset (EBAY_CLIENT_ID and EBAY_CLIENT_SECRET) to .env.local and restart. Hangar then checks current offers for every model each week and keeps the history.")}</p>
        </div>
      ) : !last ? (
        <p className="px-5 py-5 text-[13px] text-ink-2">{t("Not checked yet. Hangar looks every model up in the background, or check it now.")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-2 pb-4">
            {last.medianCents !== null ? (
              <div>
                <div className="text-[12px] font-semibold text-ink-3">{t("Typical asking price")}</div>
                <div className="num grad-text text-[34px] leading-tight font-extrabold tracking-[-0.03em]">{money(last.medianCents, "EUR")}</div>
                <div className="text-[12.5px] text-ink-2">
                  {last.lowCents !== null && last.highCents !== null && last.lowCents !== last.highCents && <>{money(last.lowCents, "EUR")} – {money(last.highCents, "EUR")} · </>}
                  {last.count === 1 ? t("1 offer") : t("{n} offers", { n: last.count })} · {date(last.date)}
                </div>
                {last.exact && <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-accent"><BadgeCheck className="size-3.5" /> {t("Same registration")}</div>}
              </div>
            ) : (
              <div>
                <div className="font-semibold">{t("No matching offers right now")}</div>
                <div className="text-[12.5px] text-ink-3">{date(last.date)} · „{last.query}“</div>
              </div>
            )}
            {last.medianCents !== null && (item.valueCents !== last.medianCents || item.valueSource !== "ebay_market") && (
              <Button size="sm" variant="primary" onClick={take}>{t("Use as value")}</Button>
            )}
          </div>

          {priced.length >= 2 && (
            <div className="border-t border-line pt-2">
              <AreaChart ariaLabel={t("Market price history")} format={(y) => money(y, "EUR")} points={priced.map((s) => ({ x: s.date, y: s.medianCents!, label: date(s.date) }))} />
            </div>
          )}

          {last.listings.length > 0 && (
            <ul className="border-t border-line">
              {last.listings.map((l) => (
                <li key={l.url} className="border-b border-line last:border-b-0">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {l.image ? <img src={l.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-lg object-cover" /> : <div className="size-11 shrink-0 rounded-lg bg-surface-2" />}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-[13px]">{l.title}</span>
                      {l.condition && <span className="text-[11.5px] text-ink-3">{l.condition}</span>}
                    </span>
                    <span className="num shrink-0 text-[13.5px] font-semibold">{money(l.cents, "EUR")}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-ink-3" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-5 py-2.5 text-[11.5px] text-ink-3">{t("Current eBay asking prices, not sold prices. A guide, not a valuation.")}</p>
        </>
      )}
    </Panel>
  );
}
