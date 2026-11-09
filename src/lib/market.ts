/**
 * Pure helpers for market price lookups: building search phrases for a model and deciding which
 * listings really are that model. Kept free of I/O so they can be tested.
 */

export interface MarketModel {
  modelManufacturerName: string;
  scale: string | null;
  airlineName: string | null;
  aircraftName: string;
  registration: string | null;
}

export interface Offer { title: string; cents: number }

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const squash = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");

/** The part of an aircraft name sellers always write: "Boeing 747-400" → "747", "Airbus A340-300" → "A340". */
export function aircraftCore(name: string): string {
  const n = name.replace(/^(Airbus|Boeing|McDonnell Douglas|Embraer|Bombardier|Lockheed|Douglas|Fokker|Tupolev|Ilyushin|Antonov|Sukhoi|Comac)\s+/i, "");
  const m = n.match(/\b(A\d{3}|7[0-8]7|MD-?\d{2}|DC-?\d{1,2}|E-?\d{3}|E?RJ-?\d{3}|CRJ-?\d{3,4}|ATR[ -]?\d{2}|Q\d{3}|L-?1011|F-?\d{2,3}|Tu-?\d{3}|Il-?\d{2,3}|An-?\d{2,3}|C-?\d{2,3}|SSJ|C919|Concorde)/i);
  return (m ? m[1] : n.split(/[\s-]/)[0]).replace(/-/g, "");
}

/** "Herpa Wings" → "Herpa", "JC Wings" → "JC Wings": the brand word sellers put in titles. */
function brand(maker: string) {
  const first = maker.trim().split(/\s+/)[0];
  return first.length <= 2 ? maker.trim() : first;
}

/** "American Airlines" → "american"; skips filler like "Air" when a better word exists. */
function airlineWord(name: string) {
  const words = norm(name).split(/[^a-z0-9]+/).filter(Boolean);
  return words.find((w) => w.length > 3 && !["airlines", "airways", "air", "aviation", "cargo", "international"].includes(w)) ?? words[0] ?? "";
}

const scaleNum = (scale: string | null) => scale?.match(/1\s*[:/]\s*(\d{2,4})/)?.[1] ?? null;

/** Search phrases from most to least specific. The registration narrows to the exact model. */
export function marketQueries(m: MarketModel): string[] {
  const parts = [brand(m.modelManufacturerName), m.scale ? `1:${scaleNum(m.scale) ?? m.scale}` : "", m.airlineName ?? "", aircraftCore(m.aircraftName)].filter(Boolean);
  const base = parts.join(" ");
  return m.registration ? [`${base} ${m.registration}`, base] : [base];
}

const JUNK = /\b(ersatz|spare|parts?|stand|st[aä]nder|vitrine|display ?case|leerkarton|leer|empty|nur (box|karton|ovp)|only box|konvolut|lot|bundle|sammlung|collection of|defekt|broken|besch[aä]digt|sticker|decals?|aufkleber|poster|patch|pin|keychain|schl[uü]sselanh[aä]nger|puzzle|bausatz|kit)\b/i;

/** Whether a listing title describes this model (brand, scale, airline and type all fit). */
export function matches(title: string, m: MarketModel): boolean {
  const t = norm(title);
  const flat = squash(title);
  if (JUNK.test(t)) return false;
  if (!flat.includes(squash(brand(m.modelManufacturerName)))) return false;
  const want = scaleNum(m.scale);
  const scales = [...t.matchAll(/1\s*[:/]\s*(\d{2,4})\b/g)].map((x) => x[1]);
  if (want && scales.length && !scales.includes(want)) return false;
  if (scales.length > 1 && new Set(scales).size > 1) return false; // several models in one listing
  const air = m.airlineName ? airlineWord(m.airlineName) : "";
  if (air && !flat.includes(air)) return false;
  return flat.includes(squash(aircraftCore(m.aircraftName)));
}

export const hasRegistration = (title: string, reg: string | null) => !!reg && squash(title).includes(squash(reg));

/** Median and quartiles after dropping prices far off the middle. */
export function summarize(prices: number[]): { median: number; low: number; high: number; used: number[] } | null {
  if (!prices.length) return null;
  const q = (s: number[], p: number) => {
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    return Math.round(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo));
  };
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = q(sorted, 0.5);
  const used = sorted.filter((p) => p >= mid / 3 && p <= mid * 3);
  return { median: q(used, 0.5), low: q(used, 0.25), high: q(used, 0.75), used };
}
