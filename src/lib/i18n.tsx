"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { DE } from "./de";
import type { Currency } from "./types";

export type Locale = "en" | "de";
type Vars = Record<string, string | number>;

export function translate(locale: Locale, key: string, vars?: Vars) {
  let s = locale === "de" ? (DE[key] ?? key) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const tagFor = (l: Locale) => (l === "de" ? "de-DE" : "en-GB");

export function useI18n() {
  const locale = useContext(Ctx);
  const t = useCallback((key: string, vars?: Vars) => translate(locale, key, vars), [locale]);
  return useMemo(() => {
    const tag = tagFor(locale);
    const region = new Intl.DisplayNames([tag], { type: "region" });
    return {
      locale,
      t,
      money: (cents: number, currency: Currency) => new Intl.NumberFormat(tag, { style: "currency", currency }).format(cents / 100),
      moneyShort: (cents: number, currency: Currency) => new Intl.NumberFormat(tag, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100),
      number: (n: number, digits = 0) => new Intl.NumberFormat(tag, { maximumFractionDigits: digits }).format(n),
      date: (iso: string) => new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)),
      month: (ym: string) => new Intl.DateTimeFormat(tag, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`)),
      country: (code: string) => {
        try {
          return region.of(code.toUpperCase()) ?? code;
        } catch {
          return code;
        }
      },
    };
  }, [locale, t]);
}
