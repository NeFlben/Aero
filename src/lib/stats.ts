import { aircraftFamilyOf, aircraftManufacturerOf, isSpecialLivery } from "./search";
import type { AircraftRef, Currency, Item } from "./types";

export interface Rates {
  base: string; // rates[X] = how many X one base unit buys
  rates: Record<string, number>;
  date: string;
}

/** Null when no rate is known: amounts are never converted with made-up numbers. */
export function convert(cents: number, from: Currency, to: Currency, r: Rates | null): number | null {
  if (from === to) return cents;
  if (!r) return null;
  const f = from === r.base ? 1 : r.rates[from];
  const t = to === r.base ? 1 : r.rates[to];
  if (!f || !t) return null;
  return Math.round((cents / f) * t);
}

export const valueChange = (i: Pick<Item, "purchasePriceCents" | "purchaseCurrency" | "valueCents" | "valueCurrency">, base: Currency, rates: Rates | null) => {
  if (i.purchasePriceCents === null || i.valueCents === null) return null;
  const buy = convert(i.purchasePriceCents, i.purchaseCurrency ?? base, base, rates);
  const now = convert(i.valueCents, i.valueCurrency ?? base, base, rates);
  if (buy === null || now === null) return null;
  return { absolute: now - buy, percent: buy > 0 ? ((now - buy) / buy) * 100 : null, buy, now };
};

export interface Bucket {
  label: string;
  count: number;
}

const countBy = (items: Item[], key: (i: Item) => string | null | undefined): Bucket[] => {
  const m = new Map<string, number>();
  for (const i of items) {
    const k = key(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

export interface Stats {
  total: number;
  value: number;
  valuedCount: number;
  spent: number;
  pricedCount: number;
  change: number | null;
  changePercent: number | null;
  changeBasis: number;
  unconverted: number;
  airlines: Bucket[];
  aircraftMakers: Bucket[];
  scales: Bucket[];
  makers: Bucket[];
  families: Bucket[];
  aircraftTypes: Bucket[];
  countries: Bucket[];
  special: number;
  growth: { month: string; added: number; total: number }[];
  mostValuable: { item: Item; cents: number } | null;
  biggestGain: { item: Item; absolute: number; percent: number | null } | null;
  newest: Item | null;
}

/** Only models actually owned count. Wishlist, ordered and sold models stay out of the totals. */
export function computeStats(all: Item[], base: Currency, rates: Rates | null, types: Map<string, AircraftRef>): Stats {
  const items = all.filter((i) => i.status === "collection");
  let value = 0, valuedCount = 0, spent = 0, pricedCount = 0, unconverted = 0, buyBasis = 0, nowBasis = 0, changeBasis = 0;
  let mostValuable: Stats["mostValuable"] = null;
  let biggestGain: Stats["biggestGain"] = null;

  for (const i of items) {
    if (i.valueCents !== null) {
      const v = convert(i.valueCents, i.valueCurrency ?? base, base, rates);
      if (v === null) unconverted++;
      else {
        value += v;
        valuedCount++;
        if (!mostValuable || v > mostValuable.cents) mostValuable = { item: i, cents: v };
      }
    }
    if (i.purchasePriceCents !== null) {
      const p = convert(i.purchasePriceCents, i.purchaseCurrency ?? base, base, rates);
      if (p === null) unconverted++;
      else {
        spent += p;
        pricedCount++;
      }
    }
    const c = valueChange(i, base, rates);
    if (c) {
      buyBasis += c.buy;
      nowBasis += c.now;
      changeBasis++;
      if (c.absolute > 0 && (!biggestGain || c.absolute > biggestGain.absolute)) biggestGain = { item: i, absolute: c.absolute, percent: c.percent };
    }
  }

  // Growth uses the purchase date when known, otherwise the day it was recorded.
  const months = new Map<string, number>();
  for (const i of items) {
    const m = (i.purchaseDate ?? i.createdAt).slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + 1);
  }
  let running = 0;
  const growth = [...months.keys()].sort().map((month) => {
    const added = months.get(month)!;
    running += added;
    return { month, added, total: running };
  });

  return {
    total: items.length, value, valuedCount, spent, pricedCount,
    change: changeBasis ? nowBasis - buyBasis : null,
    changePercent: changeBasis && buyBasis > 0 ? ((nowBasis - buyBasis) / buyBasis) * 100 : null,
    changeBasis, unconverted,
    airlines: countBy(items, (i) => i.airlineName),
    aircraftMakers: countBy(items, (i) => aircraftManufacturerOf(i, types)),
    scales: countBy(items, (i) => i.scale),
    makers: countBy(items, (i) => i.modelManufacturerName),
    families: countBy(items, (i) => aircraftFamilyOf(i, types)),
    aircraftTypes: countBy(items, (i) => i.aircraftName),
    countries: countBy(items, (i) => i.countryCode),
    special: items.filter(isSpecialLivery).length,
    growth, mostValuable, biggestGain,
    newest: items.reduce<Item | null>((n, i) => (!n || i.createdAt > n.createdAt ? i : n), null),
  };
}

export interface ValuePoint {
  itemId: string;
  cents: number;
  currency: Currency;
  date: string;
}

/** Month-end total: each model counts with its latest recorded value at that time. */
export function valueTimeline(points: ValuePoint[], owned: Set<string>, base: Currency, rates: Rates | null): { month: string; total: number }[] {
  const sorted = points.filter((p) => owned.has(p.itemId)).sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  const latest = new Map<string, number>();
  const out: { month: string; total: number }[] = [];
  let cur = sorted[0].date.slice(0, 7);
  const flush = (m: string) => out.push({ month: m, total: [...latest.values()].reduce((a, b) => a + b, 0) });
  for (const p of sorted) {
    const m = p.date.slice(0, 7);
    if (m !== cur) {
      flush(cur);
      cur = m;
    }
    const v = convert(p.cents, p.currency, base, rates);
    if (v !== null) latest.set(p.itemId, v);
  }
  flush(cur);
  return out;
}

/** Locale-aware money parsing: "42,99", "42.99", "1.299,00", "1,299.00", "€ 49". */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[^\d.,-]/g, "");
  if (!s || s.startsWith("-")) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normal: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    normal = s.replace(dec === "," ? /\./g : /,/g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    normal = after === 3 && s.indexOf(",") !== lastComma ? s.replace(/,/g, "") : after === 3 ? s.replace(",", "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    normal = after === 3 && s.length > 4 ? s.replace(/\./g, "") : s;
  } else normal = s;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
