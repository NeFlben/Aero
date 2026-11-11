import { SCALES } from "@/data/reference";
import { compact, fold, formatRegistration, looksLikeRegistration, normalizeScale, normBarcode, registrationCountry, searchAircraft, searchAirlines } from "./smart";
import { aircraftLabel, type AircraftRef, type AirlineRef, type ItemInput, type LiveryCategory, type MakerRef, type Reference } from "./types";

/*
 * Box photo recognition, entirely on the device: text recognition (Tesseract) gives raw words, this
 * file finds the facts in them and maps them onto the reference lists. Nothing is sent anywhere.
 */

/** printed = clearly read; inferred = deduced, not read; unclear = read, but the user should check. */
export type Certainty = "printed" | "inferred" | "unclear";
export interface BoxField {
  value: string | null;
  certainty: Certainty;
}

export interface BoxReading {
  isModelBox: boolean;
  manufacturer: BoxField;
  itemNumber: BoxField;
  scale: BoxField;
  airline: BoxField;
  aircraftType: BoxField;
  registration: BoxField;
  liveryName: BoxField;
  liveryCategory: LiveryCategory | null;
  barcode: BoxField;
  limitedEdition: boolean | null;
  extras: string[];
  warnings: string[];
}

/** One photo's text recognition result: the full text plus each word with its confidence (0–100). */
export interface OcrPage {
  text: string;
  words: { text: string; confidence: number }[];
}

/** EAN-13 / EAN-8 / UPC-A check digit. */
export function validBarcode(raw: string | null | undefined): boolean {
  const d = normBarcode(raw);
  if (d.length !== 13 && d.length !== 8) return false;
  const digits = d.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/* ───────── reading facts out of recognised text ───────── */

/** Lower case, words separated by single spaces, padded so " phrase " matches whole words only. */
const words = (s: string) => ` ${fold(s).replace(/[^a-z0-9]+/g, " ").trim()} `;
const count = (hay: string, needle: string) => {
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) n++;
  return n;
};
const none = (): BoxField => ({ value: null, certainty: "printed" });
/** Words below this confidence are read, but the user should check them. */
const SURE = 80;

/** Whole-word phrase search: the candidate seen most often wins, then the longest (most specific). */
function bestPhrase<T>(hay: string, cands: { phrase: string; v: T }[], minLen: number): { v: T; phrase: string } | null {
  const hits: { v: T; phrase: string; n: number }[] = [];
  for (const c of cands) {
    const p = words(c.phrase);
    if (p.replace(/ /g, "").length < minLen) continue;
    const n = count(hay, p);
    if (n) hits.push({ v: c.v, phrase: p, n });
  }
  // "Lufthansa" inside a found "Lufthansa Cargo" is the same mention, not a second one.
  const kept = hits.filter((h) => !hits.some((o) => o.phrase.length > h.phrase.length && o.phrase.includes(h.phrase)));
  kept.sort((a, b) => b.n - a.n || b.phrase.length - a.phrase.length);
  return kept[0] ?? null;
}

const SCALE_SET = new Set(SCALES.map((s) => s.slice(2)));

/** Item number formats of brands whose numbers have no label on the box. */
const ITEM_PATTERNS: [RegExp, RegExp][] = [
  [/herpa/i, /\b5\d{5}(?:-\d{3})?\b/],
  [/gemini/i, /\bG[A-Z]{1,5}\d{3,5}[A-Z]?\b/],
  [/jc ?wings/i, /\b(?:XX|LH|EW|SA|BH|JC)\d{4,6}[A-Z]?\b/],
  [/ng model/i, /\b\d{5}\b/],
  [/phoenix/i, /\b(?:PH\d?)?\d{5}\b/],
  [/panda/i, /\b(?:PD|PM)?\d{5,6}\b/],
  [/aviation ?(?:400|200)/i, /\bAV\d{4}[A-Z]{0,6}\d{0,3}\b/],
];
const ITEM_LABEL = /(?:item|art(?:ikel)?|cat(?:alog(?:ue)?)?|model|ref(?:erence)?)\.?\s*(?:no|nr|number|nummer|#)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,14})/i;

const LIVERY_HINTS: [RegExp, LiveryCategory, string | null][] = [
  [/\bstar alliance\b/i, "alliance", "Star Alliance"],
  [/\boneworld\b/i, "alliance", "oneworld"],
  [/\bsky ?team\b/i, "alliance", "SkyTeam"],
  [/\bretro\b/i, "retro", null],
  // "100 years of …", "75th anniversary" — not the age warning "under 14 years".
  [/\b(?:\d{2,3} years of|anniversary|jubil\w*)\b/i, "anniversary", null],
];
const EXTRAS: [RegExp, string][] = [
  [/flaps? down/i, "Flaps down"],
  [/(?:landing )?gear up|in[- ]flight/i, "Gear up"],
  [/with stand|stand included|incl\.? stand/i, "With stand"],
  [/antenna/i, "Antenna"],
];

/**
 * Finds brand, item number, scale, airline, type, registration, barcode and livery hints in the text
 * of one or more photos of the same box. Conservative: what is not clearly there stays empty, and
 * anything read with low confidence or found by pattern alone is marked for checking.
 */
export function readBoxText(pages: OcrPage[], ref: Reference): BoxReading {
  const text = pages.map((p) => p.text).join("\n");
  const hay = words(text);
  const conf = new Map<string, number>();
  for (const w of pages.flatMap((p) => p.words)) {
    const k = compact(w.text);
    if (k) conf.set(k, Math.max(conf.get(k) ?? 0, w.confidence));
  }
  const sure = (s: string) => (conf.get(compact(s)) ?? 0) >= SURE;
  const r: BoxReading = {
    isModelBox: false, manufacturer: none(), itemNumber: none(), scale: none(), airline: none(), aircraftType: none(), registration: none(),
    liveryName: none(), liveryCategory: null, barcode: none(), limitedEdition: null, extras: [], warnings: [],
  };

  // Scale: "1:400", "1/400", "1 : 4OO" (letter O read for a zero).
  const scales = [...text.matchAll(/\b1\s*[:/]\s*([0-9Oo]{2,3})\b/g)].map((m) => m[1].replace(/[Oo]/g, "0")).filter((s) => SCALE_SET.has(s));
  if (scales.length) r.scale = { value: `1:${mode(scales)}`, certainty: "printed" };

  const maker = bestPhrase(hay, ref.makers.flatMap((m) => [
    { phrase: m.name, v: m },
    { phrase: m.name.replace(/\s+/g, ""), v: m },
    { phrase: m.name.replace(/([a-z])(\d)/gi, "$1 $2"), v: m },
    { phrase: m.name.replace(/\s+(models?|wings|jets)$/i, ""), v: m },
  ]), 4);
  if (maker) r.manufacturer = { value: maker.v.name, certainty: "printed" };

  const airline = bestPhrase(hay, ref.airlines.flatMap((a) => [a.name, ...a.aliases].map((phrase) => ({ phrase, v: a }))), 4);
  // A brand name that is also an airline word ("Gemini") must not count as the airline.
  if (airline && !(maker && words(maker.v.name).includes(airline.phrase))) r.airline = { value: airline.v.name, certainty: "printed" };

  const type = bestPhrase(hay, ref.aircraft.flatMap((a) => [aircraftLabel(a), a.variant, ...a.aliases].map((phrase) => ({ phrase, v: a }))), 4);
  if (type) r.aircraftType = { value: aircraftLabel(type.v), certainty: words(aircraftLabel(type.v)) === type.phrase ? "printed" : "unclear" };

  // Registration: a known national prefix, not a type name ("MD-11") and not a scale ("1-400").
  const typeCodes = new Set(ref.aircraft.flatMap((a) => [a.variant, a.icaoCode ?? "", ...a.aliases].map(compact)));
  const regs = pages.flatMap((p) => p.words).map((w) => w.text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter((t) => t.length >= 4 && looksLikeRegistration(t) && /[A-Za-z]/.test(t) && !typeCodes.has(compact(t)) && !/^1-\d+$/.test(t))
    .map(formatRegistration)
    .filter((t) => registrationCountry(t));
  if (regs.length) {
    const reg = mode(regs);
    r.registration = { value: reg, certainty: sure(reg) ? "printed" : "unclear" };
  }

  // Item number: a labelled one ("Item No. 534567") beats a brand's number format.
  const labelled = text.match(ITEM_LABEL)?.[1];
  if (labelled && /\d/.test(labelled)) r.itemNumber = { value: labelled.toUpperCase(), certainty: sure(labelled) ? "printed" : "unclear" };
  else if (maker) {
    const pattern = ITEM_PATTERNS.find(([brand]) => brand.test(maker.v.name))?.[1];
    // Scales and barcode digits are not item numbers.
    const found = pattern && [...text.matchAll(new RegExp(pattern, "g"))].map((m) => m[0]).find((n) => !SCALE_SET.has(n) && !/^(19|20)\d{2}$/.test(n));
    if (found) r.itemNumber = { value: found, certainty: "unclear" };
  }

  // Barcode digits printed under the bars; the caller prefers a barcode decoded from the pixels.
  const barcode = [...text.matchAll(/\b\d[\d ]{6,16}\d\b/g)].map((m) => m[0].replace(/\s/g, "")).find((d) => validBarcode(d));
  if (barcode) r.barcode = { value: barcode, certainty: "printed" };

  for (const [re, category, name] of LIVERY_HINTS) {
    if (!re.test(text)) continue;
    r.liveryCategory = category;
    if (name) r.liveryName = { value: name, certainty: "printed" };
    break;
  }
  if (/limited (?:edition|to)|\b\d{2,4} ?(?:pcs|pieces|stück)\b/i.test(text)) r.limitedEdition = true;
  r.extras = EXTRAS.filter(([re]) => re.test(text)).map(([, label]) => label);

  r.isModelBox = !!(r.scale.value || r.manufacturer.value || r.barcode.value || r.airline.value || r.aircraftType.value || r.registration.value);
  return r;
}

const mode = (list: string[]) => {
  const n = new Map<string, number>();
  for (const x of list) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

/* ───────── resolving a reading against the reference lists ───────── */

const same = (a: string, b: string) => compact(a) === compact(b);

function findMaker(makers: MakerRef[], v: string): MakerRef | null {
  const c = compact(v);
  return (
    makers.find((m) => compact(m.name) === c) ??
    // "NG Model" / "JCWings" / "Gemini Jets 1:400" → the listed spelling.
    makers.find((m) => {
      const n = compact(m.name);
      return n.length >= 4 && (c.startsWith(n) || n.startsWith(c)) && Math.abs(n.length - c.length) <= 6;
    }) ??
    null
  );
}

function findAirline(airlines: AirlineRef[], v: string): AirlineRef | null {
  const c = compact(v);
  if (!c) return null;
  const names = (a: AirlineRef) => [a.name, ...a.aliases];
  const exact = airlines.filter((a) => names(a).some((n) => same(n, v)) || a.icao?.toLowerCase() === c);
  if (exact.length) return exact.find((a) => !a.defunct) ?? exact[0];
  // "Lufthansa German Airlines" contains "Lufthansa"; a short name must not match by accident.
  const contained = airlines.filter((a) => names(a).some((n) => compact(n).length >= 5 && c.includes(compact(n))));
  if (contained.length === 1) return contained[0];
  const top = searchAirlines(airlines, v, 2);
  return top.length === 1 ? top[0] : null;
}

function findAircraft(aircraft: AircraftRef[], v: string): { hit: AircraftRef | null; exact: boolean } {
  const c = compact(v);
  const exact = aircraft.filter((a) => compact(aircraftLabel(a)) === c || compact(a.variant) === c || compact(a.icaoCode ?? "") === c || a.aliases.some((x) => compact(x) === c));
  if (exact.length === 1) return { hit: exact[0], exact: true };
  if (exact.length > 1) return { hit: exact[0], exact: false };
  // Drop a leading manufacturer word the list spells differently ("Airbus Industrie A321").
  const hits = searchAircraft(aircraft, v.replace(/^(airbus( industrie)?|boeing|embraer|bombardier|mcdonnell douglas|de havilland( canada)?|atr)\s+/i, ""), 4);
  return { hit: hits[0] ?? null, exact: false };
}

export interface ResolvedBox {
  input: Partial<ItemInput>;
  /** Form fields the user should look at before saving. */
  unsure: string[];
  /** Fields that came from the photo at all, for the summary line. */
  filled: number;
  warnings: string[];
}

/**
 * Turns the raw reading into form values: canonical names and ids where a reference entry matches,
 * otherwise the text as read. A barcode decoded from the pixels beats digits read as text.
 * Item numbers, registrations and barcodes are never taken from an inference.
 */
export function resolveBoxReading(r: BoxReading, ref: Reference, detectedBarcode?: string | null): ResolvedBox {
  const unsure = new Set<string>();
  const warnings = [...r.warnings];
  const val = (f: BoxField, opts: { factOnly?: boolean } = {}) => {
    if (!f.value) return null;
    if (opts.factOnly && f.certainty === "inferred") return null;
    return f.value.trim() || null;
  };
  const flag = (key: string, f: BoxField) => f.value && f.certainty !== "printed" && unsure.add(key);

  const input: Partial<ItemInput> = {};

  const makerRaw = val(r.manufacturer);
  if (makerRaw) {
    input.modelManufacturerName = findMaker(ref.makers, makerRaw)?.name ?? makerRaw;
    flag("modelManufacturerName", r.manufacturer);
  }

  const airlineRaw = val(r.airline);
  if (airlineRaw) {
    const a = findAirline(ref.airlines, airlineRaw);
    input.airlineId = a?.id ?? null;
    input.airlineName = a?.name ?? airlineRaw;
    input.countryCode = a?.country ?? null;
    flag("airlineName", r.airline);
  }

  const typeRaw = val(r.aircraftType);
  if (typeRaw) {
    const { hit, exact } = findAircraft(ref.aircraft, typeRaw);
    input.aircraftTypeId = hit?.id ?? null;
    input.aircraftName = hit ? aircraftLabel(hit) : typeRaw;
    if (!exact || r.aircraftType.certainty !== "printed") unsure.add("aircraftName");
  }

  const scale = normalizeScale(val(r.scale));
  if (scale) {
    input.scale = scale;
    flag("scale", r.scale);
  }

  const reg = val(r.registration, { factOnly: true });
  if (reg) {
    input.registration = formatRegistration(reg);
    input.registrationCountry = registrationCountry(input.registration);
    flag("registration", r.registration);
  }

  const itemNumber = val(r.itemNumber, { factOnly: true });
  if (itemNumber) {
    input.itemNumber = itemNumber.replace(/\s+/g, " ");
    flag("itemNumber", r.itemNumber);
  }

  const modelCode = val(r.barcode, { factOnly: true });
  if (detectedBarcode && validBarcode(detectedBarcode)) input.barcode = normBarcode(detectedBarcode);
  else if (modelCode && validBarcode(modelCode)) {
    input.barcode = normBarcode(modelCode);
    flag("barcode", r.barcode);
  } else if (modelCode) warnings.push("barcode_checksum");

  const livery = val(r.liveryName);
  if (livery) {
    input.liveryName = livery;
    flag("liveryName", r.liveryName);
  }
  if (r.liveryCategory) input.liveryCategory = r.liveryCategory;
  else if (livery) input.liveryCategory = "special";
  if (r.limitedEdition) input.limitedEdition = true;
  if (r.extras.length) input.notes = r.extras.join(" · ");

  const filled = [input.modelManufacturerName, input.itemNumber, input.scale, input.airlineName, input.aircraftName, input.registration, input.liveryName, input.barcode].filter(Boolean).length;
  return { input, unsure: [...unsure], filled, warnings };
}
