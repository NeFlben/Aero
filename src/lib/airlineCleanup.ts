import { editDistance, fold, searchAirlines } from "./smart";
import type { AirlineRef, Item } from "./types";

export interface Variant { name: string; ids: string[] }
export interface MergeGroup { key: string; variants: Variant[]; airline: AirlineRef | null; suggestion: string }

/** "Swiss Int. Airlines" → "swiss": spelling, case, spacing and the usual suffixes don't count. */
const core = (s: string) =>
  fold(s)
    .replace(/\b(airlines?|airways|air lines|international|intl|int)\b\.?/g, " ")
    .replace(/[^a-z0-9]/g, "");

/**
 * Finds airline names in the collection that mean the same airline: linked to the same reference
 * airline, an exact name or alias of one, or the same after dropping case, punctuation and suffixes
 * (one typo allowed on longer names). Each group gets a suggested spelling, the reference name if known.
 */
export function airlineMergeGroups(items: Item[], airlines: AirlineRef[]): MergeGroup[] {
  const byName = new Map<string, { ids: string[]; airlineId: string | null }>();
  for (const i of items) {
    const n = i.airlineName?.trim();
    if (!n) continue;
    const e = byName.get(n) ?? { ids: [], airlineId: null };
    e.ids.push(i.id);
    e.airlineId ??= i.airlineId;
    byName.set(n, e);
  }
  const names = [...byName.keys()];
  const parent = new Map(names.map((n) => [n, n]));
  const find = (n: string): string => (parent.get(n) === n ? n : find(parent.get(n)!));
  const join = (a: string, b: string) => parent.set(find(a), find(b));

  // An unlinked name that is exactly a reference airline's name or alias belongs to that airline.
  const refOf = (n: string) => {
    const e = byName.get(n)!;
    if (e.airlineId) return e.airlineId;
    const hit = searchAirlines(airlines, n, 1)[0];
    return hit && [hit.name, ...hit.aliases].some((x) => fold(x).replace(/[^a-z0-9]/g, "") === fold(n).replace(/[^a-z0-9]/g, "")) ? hit.id : null;
  };
  const refs = new Map(names.map((n) => [n, refOf(n)]));

  for (let x = 0; x < names.length; x++) {
    for (let y = x + 1; y < names.length; y++) {
      const a = names[x], b = names[y];
      const ra = refs.get(a), rb = refs.get(b);
      // Two different reference airlines are never merged (Swiss vs. Swissair).
      if (ra && rb) {
        if (ra === rb) join(a, b);
        continue;
      }
      const ca = core(a), cb = core(b);
      if (!ca || !cb) continue;
      if (ca === cb || (Math.min(ca.length, cb.length) >= 5 && editDistance(ca, cb, 1) <= 1)) join(a, b);
    }
  }

  const groups = new Map<string, string[]>();
  for (const n of names) groups.set(find(n), [...(groups.get(find(n)) ?? []), n]);
  const out: MergeGroup[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const variants = list.map((name) => ({ name, ids: byName.get(name)!.ids })).sort((a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name));
    const refId = list.map((n) => refs.get(n)).find(Boolean);
    const airline = airlines.find((a) => a.id === refId) ?? null;
    out.push({ key, variants, airline, suggestion: airline?.name ?? variants[0].name });
  }
  return out.sort((a, b) => a.suggestion.localeCompare(b.suggestion));
}
