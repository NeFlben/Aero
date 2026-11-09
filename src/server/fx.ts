import { eq } from "drizzle-orm";
import { readyDb } from "@/db";
import { fxRates } from "@/db/schema";
import type { Rates } from "@/lib/stats";

const MAX_AGE = 12 * 3600 * 1000;

/**
 * ECB reference rates via frankfurter.dev (free, no key), cached in the database. If the service is
 * unreachable the last stored rates are used. With no rates at all the app shows amounts per
 * currency rather than converting them with an assumed number.
 */
export async function getRates(): Promise<Rates | null> {
  const db = await readyDb();
  const [row] = await db.select().from(fxRates).where(eq(fxRates.base, "EUR"));
  if (row && Date.now() - new Date(row.fetchedAt).getTime() < MAX_AGE) return { base: "EUR", rates: row.rates, date: row.rateDate };
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=CHF,USD,GBP", { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { rates: Record<string, number>; date: string };
    await db
      .insert(fxRates)
      .values({ base: "EUR", rates: j.rates, rateDate: j.date, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: fxRates.base, set: { rates: j.rates, rateDate: j.date, fetchedAt: new Date() } });
    return { base: "EUR", rates: j.rates, date: j.date };
  } catch {
    return row ? { base: "EUR", rates: row.rates, date: row.rateDate } : null;
  }
}
