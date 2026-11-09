import { compact, searchAirlines } from "./smart";
import { aircraftLabel, type AircraftRef, type AirlineRef } from "./types";

export interface RegInfo {
  registration: string;
  types: string[];
  icaoType: string | null;
  operators: { name: string; icao: string | null }[];
  built: number | null;
  source: "hexdb" | "commons";
}

/**
 * Drops manufacturer customer codes: Boeing 747-451 → 747-400, 747-830 → 747-8, 777-3DEER → 777-300ER,
 * Airbus A319-112 → A319, A340-313 → A340-300.
 */
export function baseType(name: string): string {
  return name
    .replace(/\b(7[0-8]7)-([1-9])[0-9A-Z]{2}(ER|LR|F|SR)?\b/i, (_, fam, ser, suf) => (fam === "747" && ser === "8" ? `747-8${suf === "F" ? "F" : ""}` : `${fam}-${ser}00${suf ?? ""}`))
    .replace(/\b(7[0-8]7)-([1-9])D(ER)\b/i, "$1-$200ER")
    .replace(/\b(A3[0-8]\d)-(\d)\d\d\b/, (_, fam, ser) => (["A318", "A319", "A320", "A321"].includes(fam) ? fam : `${fam}-${ser}00`));
}

/** The reference aircraft type that a looked-up type name means, or null when it is not certain. */
export function matchAircraft(info: RegInfo, aircraft: AircraftRef[]): AircraftRef | null {
  const want = [...info.types].sort((a, b) => b.length - a.length);
  for (const name of want) {
    const n = compact(baseType(name));
    const hit = aircraft.find((a) => compact(aircraftLabel(a)) === n || compact(a.variant) === n || a.aliases.some((x) => compact(x) === n));
    if (hit) return hit;
  }
  if (info.icaoType) {
    // Military versions share the ICAO code of their airliner (VC-25A = B742); the airliner is the safer guess.
    const same = aircraft.filter((a) => a.icaoCode === info.icaoType);
    if (same.length) return same.find((a) => a.family !== "Military") ?? same[0];
  }
  return null;
}

/** Operators matched to reference airlines where the name (or ICAO code) is unambiguous. */
export function matchOperators(info: RegInfo, airlines: AirlineRef[]): { name: string; airline: AirlineRef | null }[] {
  return info.operators.map((o) => {
    const byIcao = o.icao ? airlines.find((a) => a.icao === o.icao) : undefined;
    if (byIcao) return { name: byIcao.name, airline: byIcao };
    const hit = searchAirlines(airlines, o.name, 1)[0];
    const sure = hit && [hit.name, ...hit.aliases].some((x) => compact(x) === compact(o.name));
    return sure ? { name: hit.name, airline: hit } : { name: o.name, airline: null };
  });
}
