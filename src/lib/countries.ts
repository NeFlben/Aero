import countries from "i18n-iso-countries";

export const COUNTRY_CODES = Object.keys(countries.getAlpha2Codes());

let reverse: Map<string, string> | null = null;
const ALIASES: Record<string, string> = { usa: "US", uk: "GB", "great britain": "GB", england: "GB", schweiz: "CH", deutschland: "DE", uae: "AE", "united states of america": "US", holland: "NL" };

/** Accepts ISO codes and English or German country names, as found in imported spreadsheets. */
export function countryCodeFrom(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z]{2}$/.test(s) && COUNTRY_CODES.includes(s.toUpperCase())) return s.toUpperCase();
  if (!reverse) {
    reverse = new Map();
    for (const tag of ["en", "de"]) {
      const names = new Intl.DisplayNames([tag], { type: "region" });
      for (const c of COUNTRY_CODES) {
        try {
          const n = names.of(c);
          if (n) reverse.set(n.toLowerCase(), c);
        } catch {}
      }
    }
  }
  const low = s.toLowerCase();
  return ALIASES[low] ?? reverse.get(low) ?? null;
}
