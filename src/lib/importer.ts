import { parseMoney } from "./stats";
import { findDuplicates, fold, formatRegistration, normalizeScale, registrationCountry, searchAircraft, searchAirlines, searchMakers } from "./smart";
import { CURRENCIES, LIVERY_CATEGORIES, aircraftLabel, type Currency, type Item, type ItemInput, type LiveryCategory, type Reference } from "./types";

export const IMPORT_FIELDS = [
  "airlineName", "aircraftName", "modelManufacturerName", "scale", "registration", "itemNumber", "barcode", "liveryCategory", "liveryName",
  "countryCode", "purchasePrice", "purchaseCurrency", "purchaseDate", "value", "valueCurrency", "notes", "condition", "storageLocation",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type Mapping = Partial<Record<ImportField, string>>;

const SYNONYMS: Record<ImportField, string[]> = {
  airlineName: ["airline", "airline name", "carrier", "operator", "fluggesellschaft", "betreiber"],
  aircraftName: ["aircraft", "aircraft type", "aircraft model", "type", "plane", "flugzeug", "flugzeugtyp", "typ", "aircraft name"],
  modelManufacturerName: ["manufacturer", "model manufacturer", "brand", "maker", "modellhersteller", "hersteller", "marke", "model maker"],
  scale: ["scale", "massstab", "maßstab"],
  registration: ["registration", "reg", "reg.", "tail", "tail number", "kennzeichen", "registrierung"],
  itemNumber: ["item number", "item no", "item", "item #", "sku", "article", "artikelnummer", "art.nr", "art nr", "mould", "model number", "catalog number"],
  barcode: ["barcode", "ean", "ean13", "ean-13", "gtin", "upc", "strichcode"],
  liveryCategory: ["livery type", "livery category", "lackierungstyp"],
  liveryName: ["livery", "livery name", "scheme", "lackierung", "sonderlackierung"],
  countryCode: ["country", "land", "country code"],
  purchasePrice: ["price paid", "purchase price", "price", "paid", "cost", "kaufpreis", "preis", "bezahlt"],
  purchaseCurrency: ["currency", "purchase currency", "waehrung", "währung"],
  purchaseDate: ["purchase date", "date", "bought", "bought on", "kaufdatum", "datum", "gekauft"],
  value: ["value", "current value", "market value", "estimated value", "aktueller wert", "wert", "marktwert"],
  valueCurrency: ["value currency", "wertwaehrung"],
  notes: ["notes", "note", "comment", "comments", "notizen", "bemerkung", "kommentar"],
  condition: ["condition", "zustand"],
  storageLocation: ["storage", "storage location", "location", "lagerort", "standort"],
};

const norm = (s: string) => fold(s).replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<string>();
  for (const pass of ["exact", "contains"] as const) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field]) continue;
      const hit = headers.find((h) => {
        if (taken.has(h)) return false;
        const n = norm(h);
        return pass === "exact" ? SYNONYMS[field].includes(n) : SYNONYMS[field].some((s) => s.length >= 4 && n.includes(s));
      });
      if (hit) {
        mapping[field] = hit;
        taken.add(hit);
      }
    }
  }
  return mapping;
}

/** ISO, German DD.MM.YYYY, slashes as DD/MM/YYYY unless impossible, and Excel serials/Date strings. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const [a, b] = [+m[1], +m[2]];
    return b > 12 && a <= 12 ? valid(y, a, b) : valid(y, b, a);
  }
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + +s * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function currencyOf(raw: string | undefined, priceRaw: string | undefined, fallback: Currency): Currency {
  const c = raw?.trim().toUpperCase();
  if (c && (CURRENCIES as readonly string[]).includes(c)) return c as Currency;
  const p = priceRaw ?? "";
  if (p.includes("€")) return "EUR";
  if (p.includes("$")) return "USD";
  if (p.includes("£")) return "GBP";
  if (/chf/i.test(p)) return "CHF";
  return fallback;
}

export type RowIssue = { field: string; code: "missing_type" | "missing_maker" | "bad_price" | "bad_value" | "bad_date" | "unknown_country" | "unknown_airline" | "unknown_aircraft" };

export interface ImportRow {
  index: number;
  input: ItemInput;
  errors: RowIssue[]; // row cannot be imported until fixed
  warnings: RowIssue[]; // row imports; something was left blank or stayed unmatched
  duplicateOf: string | null; // existing item
  duplicateInFile: number | null; // earlier row number
}

export function analyzeRows(rows: Record<string, string>[], mapping: Mapping, ref: Reference, existing: Item[], fallback: Currency, countryCode: (s: string) => string | null): ImportRow[] {
  const out: ImportRow[] = [];
  rows.forEach((row, index) => {
    const get = (f: ImportField) => {
      const h = mapping[f];
      const v = h ? row[h] : undefined;
      return v === undefined || v === null ? undefined : String(v).trim() || undefined;
    };
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];

    // Spelling normalisation only on a confident, exact-class hit; otherwise keep what the user wrote.
    const airlineRaw = get("airlineName");
    const airline = airlineRaw ? searchAirlines(ref.airlines, airlineRaw, 1)[0] : undefined;
    const airlineConfident = !!airline && [airline.name, ...airline.aliases, airline.iata, airline.icao].some((n) => n && fold(n) === fold(airlineRaw!));
    if (airlineRaw && !airlineConfident) warnings.push({ field: "airlineName", code: "unknown_airline" });

    const aircraftRaw = get("aircraftName");
    const aircraftHits = aircraftRaw ? searchAircraft(ref.aircraft, aircraftRaw.replace(/^(airbus|boeing|embraer|bombardier)\s+/i, ""), 3) : [];
    const firstHit = aircraftHits[0];
    const stripped = aircraftRaw ? fold(aircraftRaw).replace(/^(airbus|boeing|embraer|bombardier)\s+/, "").replace(/[^a-z0-9]/g, "") : "";
    const aircraftConfident = !!firstHit && [firstHit.variant, firstHit.icaoCode, ...firstHit.aliases].some((n) => n && fold(n).replace(/[^a-z0-9]/g, "") === stripped);
    if (!aircraftRaw) errors.push({ field: "aircraftName", code: "missing_type" });
    else if (!aircraftConfident) warnings.push({ field: "aircraftName", code: "unknown_aircraft" });

    const makerRaw = get("modelManufacturerName");
    if (!makerRaw) errors.push({ field: "modelManufacturerName", code: "missing_maker" });
    const makerHit = makerRaw ? searchMakers(ref.makers, makerRaw, 1)[0] : undefined;
    const makerConfident = !!makerHit && fold(makerHit.name).replace(/\s/g, "") === fold(makerRaw!).replace(/\s/g, "");

    const priceRaw = get("purchasePrice");
    const price = priceRaw ? parseMoney(priceRaw) : null;
    if (priceRaw && price === null) errors.push({ field: "purchasePrice", code: "bad_price" });
    const valueRaw = get("value");
    const value = valueRaw ? parseMoney(valueRaw) : null;
    if (valueRaw && value === null) errors.push({ field: "value", code: "bad_value" });
    const dateRaw = get("purchaseDate");
    const date = dateRaw ? normalizeDate(dateRaw) : null;
    if (dateRaw && !date) errors.push({ field: "purchaseDate", code: "bad_date" });

    const reg = get("registration");
    const registration = reg ? formatRegistration(reg) : null;
    const countryRaw = get("countryCode");
    let country = countryRaw ? countryCode(countryRaw) : null;
    if (countryRaw && !country) warnings.push({ field: "countryCode", code: "unknown_country" });
    if (!country && airlineConfident) country = airline!.country;

    const cat = get("liveryCategory")?.toLowerCase().replace(/\s*livery$/, "");
    const liveryName = get("liveryName") ?? null;
    const liveryCategory: LiveryCategory | null = cat && (LIVERY_CATEGORIES as readonly string[]).includes(cat) ? (cat as LiveryCategory) : null;

    const input: ItemInput = {
      airlineId: airlineConfident ? airline!.id : null,
      airlineName: airlineConfident ? airline!.name : (airlineRaw ?? null),
      aircraftTypeId: aircraftConfident ? firstHit!.id : null,
      aircraftName: aircraftConfident ? aircraftLabel(firstHit!) : (aircraftRaw ?? ""),
      modelManufacturerName: makerConfident ? makerHit!.name : (makerRaw ?? ""),
      scale: normalizeScale(get("scale")),
      registration,
      registrationCountry: registrationCountry(registration),
      itemNumber: get("itemNumber") ?? null, // stored exactly as written
      barcode: get("barcode")?.replace(/\s+/g, "") || null,
      liveryCategory,
      liveryName,
      countryCode: country,
      purchasePriceCents: price,
      purchaseCurrency: price !== null ? currencyOf(get("purchaseCurrency"), priceRaw, fallback) : null,
      purchaseDate: date,
      valueCents: value,
      valueCurrency: value !== null ? currencyOf(get("valueCurrency") ?? get("purchaseCurrency"), valueRaw, fallback) : null,
      valueDate: value !== null ? new Date().toISOString().slice(0, 10) : null,
      valueSource: value !== null ? "import" : null,
      notes: get("notes") ?? null,
      storageLocation: get("storageLocation") ?? null,
    };

    const candidate = {
      airlineName: input.airlineName ?? null, aircraftName: input.aircraftName, modelManufacturerName: input.modelManufacturerName,
      scale: input.scale ?? null, registration: input.registration ?? null, itemNumber: input.itemNumber ?? null, liveryName: input.liveryName ?? null,
    };
    const dup = errors.length ? [] : findDuplicates(candidate, existing);
    const prior = errors.length ? [] : findDuplicates(candidate, out.filter((r) => !r.errors.length).map((r) => ({
      airlineName: r.input.airlineName ?? null, aircraftName: r.input.aircraftName, modelManufacturerName: r.input.modelManufacturerName,
      scale: r.input.scale ?? null, registration: r.input.registration ?? null, itemNumber: r.input.itemNumber ?? null, liveryName: r.input.liveryName ?? null,
      __row: r.index,
    })));
    out.push({
      index, input, errors, warnings,
      duplicateOf: dup[0]?.id ?? null,
      duplicateInFile: prior.length ? (prior[0] as unknown as { __row: number }).__row : null,
    });
  });
  return out;
}

export const EXPORT_COLUMNS: [string, (i: Item) => string | number | boolean | null][] = [
  ["Status", (i) => i.status],
  ["Airline", (i) => i.airlineName],
  ["Aircraft", (i) => i.aircraftName],
  ["Manufacturer", (i) => i.modelManufacturerName],
  ["Scale", (i) => i.scale],
  ["Registration", (i) => i.registration],
  ["Item Number", (i) => i.itemNumber],
  ["Barcode", (i) => i.barcode],
  ["Livery Type", (i) => i.liveryCategory],
  ["Livery", (i) => i.liveryName],
  ["Country", (i) => i.countryCode],
  ["Purchase Price", (i) => (i.purchasePriceCents === null ? null : i.purchasePriceCents / 100)],
  ["Currency", (i) => i.purchaseCurrency],
  ["Purchase Date", (i) => i.purchaseDate],
  ["Current Value", (i) => (i.valueCents === null ? null : i.valueCents / 100)],
  ["Value Currency", (i) => i.valueCurrency],
  ["Value Date", (i) => i.valueDate],
  ["Value Source", (i) => i.valueSource],
  ["Condition", (i) => i.condition],
  ["Box", (i) => i.boxStatus],
  ["Limited Edition", (i) => i.limitedEdition],
  ["Certificate", (i) => i.certificate],
  ["Storage Location", (i) => i.storageLocation],
  ["Purchase Source", (i) => i.purchaseSource],
  ["Rating", (i) => i.rating],
  ["Notes", (i) => i.notes],
];
