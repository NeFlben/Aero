import { editDistance, fold } from "./smart";
import type { AircraftRef, AirlineRef, Item, LiveryCategory, Reference } from "./types";

/**
 * In-memory collection search: every item gets a haystack of tokens, including everything the
 * reference data knows (ICAO type, family, IATA, aliases). So "SWISS B77W", "777-300ER Swiss" and
 * "Swis 777" all land on the same model without storing derived data.
 */

export interface Indexed {
  item: Item;
  tokens: string[];
  joined: string;
}

const tok = (s: string | null | undefined) =>
  s ? fold(s).split(/[\s/,()]+/).filter(Boolean) : [];

export function buildIndex(items: Item[], ref: Reference | null, countryName?: (c: string) => string): Indexed[] {
  const air = new Map<string, AirlineRef>(ref?.airlines.map((a) => [a.id, a]));
  const typ = new Map<string, AircraftRef>(ref?.aircraft.map((a) => [a.id, a]));
  return items.map((item) => {
    const a = item.airlineId ? air.get(item.airlineId) : undefined;
    const t = item.aircraftTypeId ? typ.get(item.aircraftTypeId) : undefined;
    const parts = [
      item.airlineName, item.aircraftName, item.modelManufacturerName, item.scale, item.registration, item.itemNumber, item.barcode,
      item.liveryName, item.liveryCategory, item.notes, item.countryCode,
      item.countryCode && countryName ? countryName(item.countryCode) : null,
      a?.iata, a?.icao, a?.name, ...(a?.aliases ?? []),
      t?.manufacturer, t?.family, t?.variant, t?.icaoCode, ...(t?.aliases ?? []),
    ];
    const tokens = [...new Set(parts.flatMap(tok))];
    // Registrations and item numbers also match with punctuation removed: "HBJNA" finds "HB-JNA".
    if (item.registration) tokens.push(fold(item.registration).replace(/[^a-z0-9]/g, ""));
    // 777-300ER is also findable as its parts "777" and "300er".
    for (const part of tokens.slice()) if (part.includes("-")) tokens.push(...part.split("-").filter((p) => p.length > 1));
    return { item, tokens, joined: tokens.join(" ") };
  });
}

function scoreToken(q: string, tokens: string[]): number {
  let best = 0;
  for (const t of tokens) {
    if (t === q) return 10;
    if (t.startsWith(q)) best = Math.max(best, 7);
    else if (q.length >= 3 && t.includes(q)) best = Math.max(best, 4);
    else if (q.length >= 4 && t.length >= 4) {
      const limit = q.length >= 7 ? 2 : 1;
      if (editDistance(q, t.slice(0, q.length + limit), limit) <= limit || editDistance(q, t, limit) <= limit) best = Math.max(best, 3);
    }
  }
  return best;
}

/** Every query word must match something; results are ordered by match quality. */
export function searchItems(index: Indexed[], query: string): Item[] {
  const qs = tok(query);
  if (!qs.length) return index.map((i) => i.item);
  const hits: [number, Item][] = [];
  for (const entry of index) {
    let total = 0;
    let ok = true;
    for (const q of qs) {
      const s = scoreToken(q, entry.tokens);
      if (!s) {
        ok = false;
        break;
      }
      total += s;
    }
    if (ok) hits.push([total, entry.item]);
  }
  return hits.sort((a, b) => b[0] - a[0]).map((h) => h[1]);
}

/* ───────── filters ───────── */

export interface Filters {
  airline: string[];
  aircraft: string[];
  aircraftMaker: string[];
  maker: string[];
  scale: string[];
  country: string[];
  livery: LiveryCategory[];
  specialOnly: boolean;
  condition: string[];
  hasBox: boolean | null;
  limited: boolean | null;
  priceMin: number | null; // major units, in the purchase currency
  priceMax: number | null;
  valueMin: number | null;
  valueMax: number | null;
  dateFrom: string | null;
  dateTo: string | null;
}

export const emptyFilters = (): Filters => ({
  airline: [], aircraft: [], aircraftMaker: [], maker: [], scale: [], country: [], livery: [], specialOnly: false,
  condition: [], hasBox: null, limited: null, priceMin: null, priceMax: null, valueMin: null, valueMax: null,
  dateFrom: null, dateTo: null,
});

export const activeFilterCount = (f: Filters) =>
  f.airline.length + f.aircraft.length + f.aircraftMaker.length + f.maker.length + f.scale.length + f.country.length +
  f.livery.length + f.condition.length + (f.specialOnly ? 1 : 0) + (f.hasBox !== null ? 1 : 0) + (f.limited !== null ? 1 : 0) +
  (f.priceMin !== null || f.priceMax !== null ? 1 : 0) + (f.valueMin !== null || f.valueMax !== null ? 1 : 0) +
  (f.dateFrom || f.dateTo ? 1 : 0);

export const isSpecialLivery = (i: Pick<Item, "liveryCategory">) => !!i.liveryCategory && i.liveryCategory !== "standard";

export function aircraftManufacturerOf(item: Item, types: Map<string, AircraftRef>): string {
  const t = item.aircraftTypeId ? types.get(item.aircraftTypeId) : undefined;
  if (t) return t.manufacturer;
  const first = item.aircraftName.split(/\s+/)[0];
  return first || "Unknown";
}

export function aircraftFamilyOf(item: Item, types: Map<string, AircraftRef>): string {
  const t = item.aircraftTypeId ? types.get(item.aircraftTypeId) : undefined;
  return t ? `${t.manufacturer} ${t.family}` : item.aircraftName;
}

export function applyFilters(items: Item[], f: Filters, types: Map<string, AircraftRef>): Item[] {
  const within = (v: number | null, min: number | null, max: number | null) =>
    (min === null && max === null) || (v !== null && (min === null || v >= min * 100) && (max === null || v <= max * 100));
  return items.filter(
    (i) =>
      (!f.airline.length || (i.airlineName && f.airline.includes(i.airlineName))) &&
      (!f.aircraft.length || f.aircraft.includes(i.aircraftName)) &&
      (!f.aircraftMaker.length || f.aircraftMaker.includes(aircraftManufacturerOf(i, types))) &&
      (!f.maker.length || f.maker.includes(i.modelManufacturerName)) &&
      (!f.scale.length || (i.scale && f.scale.includes(i.scale))) &&
      (!f.country.length || (i.countryCode && f.country.includes(i.countryCode))) &&
      (!f.livery.length || (i.liveryCategory && f.livery.includes(i.liveryCategory))) &&
      (!f.specialOnly || isSpecialLivery(i)) &&
      (!f.condition.length || (i.condition && f.condition.includes(i.condition))) &&
      (f.hasBox === null || (i.boxStatus ? i.boxStatus !== "no_box" : false) === f.hasBox) &&
      (f.limited === null || !!i.limitedEdition === f.limited) &&
      within(i.purchasePriceCents, f.priceMin, f.priceMax) &&
      within(i.valueCents, f.valueMin, f.valueMax) &&
      (!f.dateFrom || (i.purchaseDate && i.purchaseDate >= f.dateFrom)) &&
      (!f.dateTo || (i.purchaseDate && i.purchaseDate <= f.dateTo)),
  );
}

export type SortKey = "added" | "airline" | "aircraft" | "type" | "registration" | "maker" | "scale" | "livery" | "itemNumber" | "price" | "value" | "date";

const SEP = "\u0001";
const keyOf: Record<SortKey, (i: Item, types?: Map<string, AircraftRef>) => string | number | null> = {
  added: (i) => i.createdAt,
  // Manufacturer, then family, then the variant, then airline: A319, A320, A330 … Boeing 707, 737, 747.
  type: (i, types) => {
    const t = i.aircraftTypeId ? types?.get(i.aircraftTypeId) : undefined;
    return [t?.manufacturer ?? i.aircraftName.split(/\s+/)[0], t?.family ?? "", i.aircraftName, i.airlineName ?? ""].join(SEP);
  },
  airline: (i, types) => i.airlineName && [i.airlineName, keyOf.type(i, types)].join(SEP),
  aircraft: (i) => i.aircraftName,
  registration: (i) => i.registration,
  maker: (i) => i.modelManufacturerName,
  scale: (i) => i.scale,
  livery: (i) => i.liveryName ?? i.liveryCategory,
  itemNumber: (i) => i.itemNumber,
  price: (i) => i.purchasePriceCents,
  value: (i) => i.valueCents,
  date: (i) => i.purchaseDate,
};

/** Empty values always sort last, in either direction. */
export function sortItems(items: Item[], key: SortKey, dir: "asc" | "desc", types?: Map<string, AircraftRef>): Item[] {
  const get = (i: Item) => keyOf[key](i, types);
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x === null || x === "") return y === null || y === "" ? 0 : 1;
    if (y === null || y === "") return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" }) * sign;
  });
}
