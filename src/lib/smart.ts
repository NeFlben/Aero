import { REG_PREFIXES, SCALES } from "@/data/reference";
import { aircraftLabel, type AircraftRef, type AirlineRef, type Item, type MakerRef, type Reference } from "./types";

/* ───────── text helpers ───────── */

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const compact = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");

/** Damerau-Levenshtein, bounded: returns max+1 as soon as the distance cannot be ≤ max. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/* ───────── scale ───────── */

/** "1/400", "1-400", "400", "1:400" → "1:400". Unknown shapes are returned unchanged. */
export function normalizeScale(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/^1\s*[:/\-_ ]\s*(\d{2,4})$/) ?? s.match(/^(\d{3})$/);
  return m ? `1:${m[1]}` : s;
}

/* ───────── registration ───────── */

const NO_DASH = ["N", "JA", "HL", "UK"];

export function registrationCountry(reg: string | null | undefined): string | null {
  if (!reg) return null;
  const r = reg.toUpperCase();
  const prefixes = Object.keys(REG_PREFIXES).sort((a, b) => b.length - a.length);
  for (const p of prefixes) {
    if (NO_DASH.includes(p)) continue;
    if (r.startsWith(p)) return REG_PREFIXES[p];
  }
  if (/^N[0-9]/.test(r)) return "US";
  if (/^JA[0-9]/.test(r)) return "JP";
  if (/^HL[0-9]/.test(r)) return "KR";
  if (/^UK[0-9]/.test(r)) return "UZ";
  return null;
}

/**
 * Uppercases and inserts the missing dash only when the prefix is known without doubt
 * (HBJNA → HB-JNA). Anything unrecognised stays as typed apart from case.
 */
export function formatRegistration(input: string): string {
  const r = input.trim().toUpperCase();
  if (!r || r.includes("-") || r.includes(" ")) return r;
  if (/^(N|JA|HL|UK)[0-9]/.test(r)) return r;
  const prefixes = Object.keys(REG_PREFIXES)
    .filter((p) => p.endsWith("-"))
    .sort((a, b) => b.length - a.length);
  for (const p of prefixes) {
    const bare = p.slice(0, -1);
    // Single-letter prefixes are ambiguous without a dash unless the rest has the standard length.
    if (r.startsWith(bare) && r.length - bare.length === (bare.length === 1 ? 4 : 3)) return `${bare}-${r.slice(bare.length)}`;
  }
  return r;
}

export const looksLikeRegistration = (tok: string) => {
  const t = tok.toUpperCase();
  if (/^[A-Z0-9]{1,3}-[A-Z0-9]{2,5}$/.test(t)) return true;
  return /^N[0-9]{1,5}[A-Z]{0,2}$/.test(t) && t.length >= 4 && /[A-Z]$|^N\d{3,5}$/.test(t);
};

/* ───────── reference lookups ───────── */

export function searchAirlines(airlines: AirlineRef[], q: string, limit = 8): AirlineRef[] {
  const n = compact(q);
  if (!n) return [];
  const scored: [number, AirlineRef][] = [];
  for (const a of airlines) {
    let s = 0;
    const iata = a.iata?.toLowerCase();
    const icao = a.icao?.toLowerCase();
    if (iata === n || icao === n) s = 90;
    for (const nm of [a.name, ...a.aliases]) {
      const c = compact(nm);
      if (c === n) s = Math.max(s, 100);
      else if (c.startsWith(n)) s = Math.max(s, 80);
      else if (fold(nm).split(/\s+/).some((w) => w.startsWith(n))) s = Math.max(s, 60);
      else if (n.length >= 3 && c.includes(n)) s = Math.max(s, 40);
      else if (n.length >= 4 && editDistance(c.slice(0, n.length + 1), n, 1) <= 1) s = Math.max(s, 30);
    }
    if (s > 0) scored.push([a.defunct ? s - 5 : s, a]);
  }
  return scored.sort((x, y) => y[0] - x[0]).slice(0, limit).map((x) => x[1]);
}

/** "A35", "B77W", "777-300ER", "747-8", "Dreamliner" … all resolve here. */
export function searchAircraft(aircraft: AircraftRef[], q: string, limit = 10): AircraftRef[] {
  const raw = compact(q);
  if (!raw) return [];
  // B77 → 77 so "B77" also prefix-matches Boeing's 777 variants.
  const boeing = raw.match(/^b(7\d*)$/)?.[1];
  const scored: [number, AircraftRef][] = [];
  aircraft.forEach((a, order) => {
    let s = 0;
    const v = compact(a.variant);
    const label = compact(aircraftLabel(a));
    const icao = a.icaoCode?.toLowerCase();
    if (icao === raw) s = 100;
    if (v === raw || label === raw) s = Math.max(s, 100);
    if (a.aliases.some((x) => compact(x) === raw)) s = Math.max(s, 95);
    if (v.startsWith(raw) || label.startsWith(raw)) s = Math.max(s, 80);
    if (boeing && a.manufacturer === "Boeing" && v.startsWith(boeing)) s = Math.max(s, 78);
    if (icao?.startsWith(raw)) s = Math.max(s, 70);
    if (raw.length >= 2 && compact(a.family).startsWith(raw)) s = Math.max(s, 60);
    if (a.aliases.some((x) => compact(x).startsWith(raw))) s = Math.max(s, 55);
    if (raw.length >= 3 && compact(a.manufacturer).startsWith(raw)) s = Math.max(s, 40);
    if (s > 0) scored.push([s - order / 1000, a]);
  });
  return scored.sort((x, y) => y[0] - x[0]).slice(0, limit).map((x) => x[1]);
}

export function searchMakers(makers: MakerRef[], q: string, limit = 8): MakerRef[] {
  const n = compact(q);
  if (!n) return makers.slice(0, limit);
  return makers
    .map((m): [number, MakerRef] => {
      const c = compact(m.name);
      return [c === n ? 100 : c.startsWith(n) ? 80 : c.includes(n) ? 50 : n.length >= 4 && editDistance(c.slice(0, n.length), n, 1) <= 1 ? 30 : 0, m];
    })
    .filter((x) => x[0] > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map((x) => x[1]);
}

/* ───────── Smart Add query parsing ───────── */

export interface ParsedQuery {
  airline: AirlineRef | null;
  aircraft: AircraftRef[]; // ambiguous "A350" keeps every matching variant
  maker: MakerRef | null;
  scale: string | null;
  registration: string | null;
  itemNumber: string | null;
  rest: string[]; // tokens nobody recognised, e.g. a livery name. Never promoted to a fact.
}

/**
 * Reads free text like "NG Models 58012" or "JC Wings A330 1:400". It only recognises things that
 * exist in reference data or have an unambiguous format; the rest stays in `rest`.
 */
export function parseSmartQuery(q: string, ref: Reference): ParsedQuery {
  const result: ParsedQuery = { airline: null, aircraft: [], maker: null, scale: null, registration: null, itemNumber: null, rest: [] };
  let text = ` ${q.trim()} `;

  const scale = text.match(/\s(1\s*[:/]\s*\d{2,4})\s/);
  if (scale) {
    result.scale = normalizeScale(scale[1]);
    text = text.replace(scale[1], " ");
  }

  // Multi-word names first: longest phrase wins.
  const consume = <T,>(cands: { name: string; v: T }[]): T | null => {
    const lower = fold(text);
    const sorted = [...cands].sort((a, b) => b.name.length - a.name.length);
    for (const c of sorted) {
      const needle = fold(c.name);
      if (needle.length < 2) continue;
      const i = lower.indexOf(` ${needle} `);
      if (i >= 0) {
        text = text.slice(0, i) + " " + text.slice(i + needle.length + 1);
        return c.v;
      }
    }
    return null;
  };

  const makerCands = ref.makers.flatMap((m) => [
    { name: m.name, v: m },
    { name: m.name.replace(/\s+/g, ""), v: m },
    { name: m.name.replace(/\s+(models|wings)$/i, ""), v: m },
  ]);
  result.maker = consume(makerCands.filter((c) => c.name.length >= 3));

  result.airline = consume(
    ref.airlines
      .filter((a) => !a.defunct)
      .concat(ref.airlines.filter((a) => a.defunct))
      .flatMap((a) => [{ name: a.name, v: a }, ...a.aliases.map((x) => ({ name: x, v: a }))]),
  );

  const leftovers: string[] = [];
  for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
    // A known type name ("MD-11F", "777-300ER", "DC-10") also fits the registration pattern; the type wins.
    if (result.aircraft.length === 0) {
      const c = compact(tok);
      const exactType = ref.aircraft.filter((a) => compact(a.variant) === c || a.aliases.some((x) => compact(x) === c));
      if (exactType.length) {
        result.aircraft = exactType;
        continue;
      }
    }
    if (!result.registration && looksLikeRegistration(tok)) {
      result.registration = formatRegistration(tok);
      continue;
    }
    if (!result.scale && SCALES.includes(normalizeScale(tok) ?? "") && /^\d{3}$/.test(tok) === false) {
      result.scale = normalizeScale(tok);
      continue;
    }
    if (result.aircraft.length === 0) {
      const hit = searchAircraft(ref.aircraft, tok, 12);
      const looksTypey = /^[a-z]{0,3}-?\d/i.test(tok) || hit.some((h) => compact(h.icaoCode ?? "") === compact(tok));
      if (hit.length && looksTypey && !/^\d{4,}$/.test(tok)) {
        const exact = hit.filter((h) => compact(h.variant) === compact(tok) || compact(h.icaoCode ?? "") === compact(tok) || h.aliases.some((x) => compact(x) === compact(tok)));
        result.aircraft = exact.length ? exact : hit;
        continue;
      }
    }
    if (!result.itemNumber && result.maker && /\d/.test(tok)) {
      result.itemNumber = tok;
      continue;
    }
    if (!result.airline && tok.length === 2 || !result.airline && tok.length === 3) {
      const a = ref.airlines.find((x) => x.iata?.toLowerCase() === tok.toLowerCase() || x.icao?.toLowerCase() === tok.toLowerCase());
      if (a) {
        result.airline = a;
        continue;
      }
    }
    leftovers.push(tok);
  }

  // Tolerate one typo in a single leftover airline word ("Lufthnasa").
  if (!result.airline) {
    for (const tok of leftovers) {
      if (tok.length < 4) continue;
      const hit = ref.airlines.find((a) =>
        [a.name, ...a.aliases].some((n) => compact(n).length >= 4 && editDistance(compact(n), compact(tok), 2) <= (tok.length > 6 ? 2 : 1)),
      );
      if (hit) {
        result.airline = hit;
        leftovers.splice(leftovers.indexOf(tok), 1);
        break;
      }
    }
  }
  result.rest = leftovers;
  return result;
}

/* ───────── duplicate detection ───────── */

const eq = (a?: string | null, b?: string | null) => compact(a ?? "") === compact(b ?? "");

export type DuplicateCandidate = Pick<
  Item,
  "airlineName" | "aircraftName" | "modelManufacturerName" | "scale" | "registration" | "itemNumber" | "liveryName"
> & { barcode?: string | null };

/** Digits only; a 12-digit UPC-A is the same product as the EAN-13 with a leading zero. */
export const normBarcode = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length === 12 ? `0${d}` : d;
};

/** EAN-8 / EAN-13 (UPC-A as EAN-13) check digit, so a scan with a correct check digit counts at once. */
export const validGtin = (code: string) => {
  if (!/^(\d{8}|\d{13})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
};

/**
 * A same registration alone is NOT a duplicate. A barcode on both sides decides alone; otherwise two rules:
 * - same manufacturer + same item number + same scale (when both sides have it), or
 * - without item numbers: manufacturer, scale, type, airline, registration and livery all match,
 *   and a registration or item number is actually present on both.
 */
export function isDuplicate(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  // The barcode identifies the product on its own: equal codes are the same release, different codes are not.
  if (a.barcode && b.barcode) return normBarcode(a.barcode) === normBarcode(b.barcode);
  if (!eq(a.modelManufacturerName, b.modelManufacturerName)) return false;
  if (a.scale && b.scale && normalizeScale(a.scale) !== normalizeScale(b.scale)) return false;
  if (a.itemNumber && b.itemNumber) return a.itemNumber.trim().toLowerCase() === b.itemNumber.trim().toLowerCase();
  if (!a.registration || !b.registration) return false;
  return (
    eq(a.registration, b.registration) &&
    eq(a.aircraftName, b.aircraftName) &&
    eq(a.airlineName, b.airlineName) &&
    eq(a.liveryName, b.liveryName) &&
    (a.scale ?? "") !== "" &&
    (b.scale ?? "") !== ""
  );
}

export const findDuplicates = <T extends DuplicateCandidate>(candidate: DuplicateCandidate, items: T[]) =>
  items.filter((i) => isDuplicate(candidate, i));
