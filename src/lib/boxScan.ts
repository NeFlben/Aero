import { z } from "zod";
import { compact, formatRegistration, normalizeScale, normBarcode, registrationCountry, searchAircraft, searchAirlines } from "./smart";
import { aircraftLabel, LIVERY_CATEGORIES, type AircraftRef, type AirlineRef, type ItemInput, type MakerRef, type Reference } from "./types";

/* What the vision model returns for one box. Shared by the server (validation) and the client (resolution). */

/** printed = legible on the box; inferred = not printed but clear from what is visible; unclear = partly legible. */
export const CERTAINTIES = ["printed", "inferred", "unclear"] as const;
export type Certainty = (typeof CERTAINTIES)[number];

const field = z.object({ value: z.string().trim().max(200).nullable(), certainty: z.enum(CERTAINTIES) });
export type BoxField = z.infer<typeof field>;

export const boxReading = z.object({
  isModelBox: z.boolean(),
  manufacturer: field,
  itemNumber: field,
  scale: field,
  airline: field,
  aircraftType: field,
  registration: field,
  liveryName: field,
  liveryCategory: z.enum(LIVERY_CATEGORIES).nullable(),
  barcode: field,
  limitedEdition: z.boolean().nullable(),
  extras: z.array(z.string().trim().max(200)).max(12),
  warnings: z.array(z.string().trim().max(300)).max(6),
});
export type BoxReading = z.infer<typeof boxReading>;

/** The same shape as JSON Schema for the API's structured output (every key required, no extra keys). */
const fieldSchema = {
  type: "object",
  properties: { value: { type: ["string", "null"] }, certainty: { type: "string", enum: [...CERTAINTIES] } },
  required: ["value", "certainty"],
  additionalProperties: false,
} as const;

export const BOX_READING_JSON_SCHEMA = {
  type: "object",
  properties: {
    isModelBox: { type: "boolean", description: "false if the photo does not show the packaging of a model aircraft" },
    manufacturer: { ...fieldSchema, description: "Brand of the model (not the aircraft maker), e.g. NG Models, JC Wings, GeminiJets, Herpa" },
    itemNumber: { ...fieldSchema, description: "The manufacturer's catalog / item number exactly as printed, e.g. 58012, XX40123, 534567-001, GJ2134" },
    scale: { ...fieldSchema, description: "Scale such as 1:400" },
    airline: { ...fieldSchema, description: "Operator / airline shown on the model" },
    aircraftType: { ...fieldSchema, description: "Aircraft type including variant, e.g. Airbus A350-900, Boeing 777-300ER" },
    registration: { ...fieldSchema, description: "Aircraft registration, e.g. HB-JNA, D-AIXA, N12345" },
    liveryName: { ...fieldSchema, description: "Name of a special livery or scheme, e.g. Star Alliance, Retro, 100 Years. null for a standard livery" },
    liveryCategory: { type: ["string", "null"], enum: [...LIVERY_CATEGORIES, null] },
    barcode: { ...fieldSchema, description: "EAN/UPC digits under the barcode, digits only" },
    limitedEdition: { type: ["boolean", "null"], description: "true only if the box says limited edition or shows a numbered run" },
    extras: { type: "array", items: { type: "string" }, description: "Other facts printed on the box: edition size, flaps down, gear options, stand, antenna, release year …" },
    warnings: { type: "array", items: { type: "string" }, description: "Short hints for the user about problems with the photo, in the requested language" },
  },
  required: ["isModelBox", "manufacturer", "itemNumber", "scale", "airline", "aircraftType", "registration", "liveryName", "liveryCategory", "barcode", "limitedEdition", "extras", "warnings"],
  additionalProperties: false,
} as const;

/** EAN-13 / EAN-8 / UPC-A check digit. */
export function validBarcode(raw: string | null | undefined): boolean {
  const d = normBarcode(raw);
  if (d.length !== 13 && d.length !== 8) return false;
  const digits = d.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

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
 * otherwise the text as printed. A barcode read locally from the pixels beats the model's reading.
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
