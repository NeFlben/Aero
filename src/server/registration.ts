/**
 * What a registration is: aircraft type, operators and build year, from free sources without a key.
 * hexdb.io knows aircraft that fly today; Wikimedia Commons keeps a category per registration
 * ("N665US (aircraft)") that also covers retired and scrapped aircraft.
 */
import type { RegInfo } from "@/lib/registration";

export type { RegInfo };

const UA = "Hangar/1.0 (self-hosted model aircraft collection)";
const cache = new Map<string, { at: number; info: RegInfo | null }>();
const DAY = 86_400_000;

async function hexdb(reg: string): Promise<RegInfo | null> {
  const hex = (await (await fetch(`https://hexdb.io/reg-hex?reg=${encodeURIComponent(reg)}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) })).text()).trim();
  if (!/^[0-9A-F]{6}$/i.test(hex)) return null;
  const res = await fetch(`https://hexdb.io/api/v1/aircraft/${hex}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const d = (await res.json()) as { Registration?: string; Manufacturer?: string; ICAOTypeCode?: string; Type?: string; RegisteredOwners?: string; OperatorFlagCode?: string };
  if (!d.Manufacturer && !d.ICAOTypeCode) return null;
  // "747 830" → "747-830"
  const type = d.Type ? `${d.Manufacturer ?? ""} ${d.Type.replace(/^(\w+)\s+(\w+)$/, "$1-$2")}`.trim() : null;
  return {
    registration: reg,
    types: type ? [type] : [],
    icaoType: d.ICAOTypeCode || null,
    operators: d.RegisteredOwners ? [{ name: d.RegisteredOwners, icao: d.OperatorFlagCode || null }] : [],
    built: null,
    source: "hexdb",
  };
}

export function parseCommonsCategories(reg: string, cats: string[]): RegInfo | null {
  const general: string[] = [];
  const exact: string[] = [];
  const operators: string[] = [];
  let built: number | null = null;
  for (const c of cats) {
    let m;
    if ((m = c.match(/^(.+?) by registration$/)) && !/^Aircraft/.test(m[1])) general.push(m[1]);
    else if ((m = c.match(/^(.+?) of (.+)$/)) && /\d/.test(m[1]) && !/^Aircraft/.test(m[1])) {
      general.push(m[1]);
      operators.push(m[2]);
    } else if ((m = c.match(/ built in (\d{4})$/))) built = Number(m[1]);
    else if (/^[A-Z][\w.-]*( [A-Z][\w.-]*)* [A-Z]?\d[\w-]*$/.test(c) && !/\(|registered|scrapped|Number|built|ln |msn |c\/n /i.test(c)) exact.push(c);
  }
  const types = [...new Set([...general, ...exact])];
  if (!types.length && !operators.length) return null;
  return { registration: reg, types, icaoType: null, operators: [...new Set(operators)].map((name) => ({ name, icao: null })), built, source: "commons" };
}

async function commons(reg: string): Promise<RegInfo | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1&prop=categories&cllimit=60&titles=${encodeURIComponent(`Category:${reg} (aircraft)`)}`;
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const d = (await res.json()) as { query?: { pages?: Record<string, { missing?: string; categories?: { title: string }[] }> } };
  const page = Object.values(d.query?.pages ?? {})[0];
  if (!page || "missing" in page) return null;
  return parseCommonsCategories(reg, (page.categories ?? []).map((c) => c.title.replace(/^Category:/, "")));
}

/** Both sources are asked; hexdb supplies the current operator and ICAO codes, Commons the history. */
export async function lookupRegistration(reg: string): Promise<RegInfo | null> {
  const hit = cache.get(reg);
  if (hit && Date.now() - hit.at < (hit.info ? 30 * DAY : DAY)) return hit.info;
  const [a, b] = await Promise.all([hexdb(reg).catch(() => null), commons(reg).catch(() => null)]);
  let info: RegInfo | null = null;
  if (a && b) {
    const ops = [...a.operators];
    for (const o of b.operators) if (!ops.some((x) => x.name.toLowerCase() === o.name.toLowerCase())) ops.push(o);
    info = { ...a, types: [...new Set([...b.types, ...a.types])], operators: ops, built: b.built, source: "hexdb" };
  } else info = a ?? b;
  cache.set(reg, { at: Date.now(), info });
  if (cache.size > 5000) cache.clear();
  return info;
}
