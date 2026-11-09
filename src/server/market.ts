import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { readyDb } from "@/db";
import { items, marketSnapshots, type MarketListing } from "@/db/schema";
import { hasRegistration, marketQueries, matches, summarize, type MarketModel } from "@/lib/market";
import { getRates } from "./fx";

/**
 * Current asking prices from eBay's official Browse API. Needs a free eBay developer keyset in
 * EBAY_CLIENT_ID / EBAY_CLIENT_SECRET; without it every function here is a no-op.
 */
const CLIENT_ID = () => process.env.EBAY_CLIENT_ID?.trim();
const CLIENT_SECRET = () => process.env.EBAY_CLIENT_SECRET?.trim();
const MARKETPLACE = () => process.env.EBAY_MARKETPLACE?.trim() || "EBAY_DE";
const REFRESH_DAYS = () => Math.max(1, Number(process.env.MARKET_REFRESH_DAYS) || 7);

export const marketEnabled = () => !!(CLIENT_ID() && CLIENT_SECRET());

let token: { value: string; until: number } | null = null;
async function accessToken() {
  if (token && Date.now() < token.until) return token.value;
  const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`ebay_token_${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 };
  return token.value;
}

export interface Summary { title: string; itemWebUrl: string; price?: { value: string; currency: string }; image?: { imageUrl: string }; condition?: string }

export async function search(q: string): Promise<Summary[]> {
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?limit=50&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${await accessToken()}`, "x-ebay-c-marketplace-id": MARKETPLACE() }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 401) token = null;
  if (!r.ok) throw new Error(`ebay_search_${r.status}`);
  return ((await r.json()) as { itemSummaries?: Summary[] }).itemSummaries ?? [];
}

const today = () => new Date().toISOString().slice(0, 10);

/** Looks the model up, stores today's snapshot (replacing an earlier one from today) and returns it. */
export async function refreshItem(userId: string, itemId: string) {
  if (!marketEnabled()) return null;
  const db = await readyDb();
  const [it] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.userId, userId), isNull(items.deletedAt)));
  if (!it) return null;
  const model: MarketModel = it;
  const rates = await getRates();
  // Everything is stored in EUR; rates are "units per EUR".
  const toEur = (value: string, cur: string) => {
    const cents = Math.round(Number(value) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return null;
    if (cur === "EUR") return cents;
    const r = rates?.rates[cur];
    return r ? Math.round(cents / r) : null;
  };

  let used = "";
  let offers: (MarketListing & { exact: boolean })[] = [];
  for (const q of marketQueries(model)) {
    used = q;
    const seen = new Set(offers.map((o) => o.url));
    for (const s of await search(q)) {
      if (!s.price || seen.has(s.itemWebUrl) || !matches(s.title, model)) continue;
      const cents = toEur(s.price.value, s.price.currency);
      if (cents === null) continue;
      offers.push({ title: s.title, cents, currency: "EUR", url: s.itemWebUrl, image: s.image?.imageUrl ?? null, condition: s.condition ?? null, exact: hasRegistration(s.title, model.registration) });
    }
    if (offers.length >= 3) break;
  }
  // Listings with the exact registration beat look-alikes in other liveries or years.
  const exact = offers.filter((o) => o.exact);
  if (exact.length >= 2) offers = exact;
  const sum = summarize(offers.map((o) => o.cents));
  const kept = sum ? offers.filter((o) => o.cents >= sum.used[0] && o.cents <= sum.used[sum.used.length - 1]) : [];
  kept.sort((a, b) => Math.abs(a.cents - (sum?.median ?? 0)) - Math.abs(b.cents - (sum?.median ?? 0)));

  const row = {
    itemId, userId, source: "ebay", date: today(), query: used, exact: exact.length >= 2,
    count: kept.length, medianCents: sum?.median ?? null, lowCents: sum?.low ?? null, highCents: sum?.high ?? null, currency: "EUR" as const,
    listings: kept.slice(0, 8).map(({ exact: _e, ...l }) => (void _e, l)),
  };
  const [saved] = await db
    .insert(marketSnapshots)
    .values(row)
    .onConflictDoUpdate({ target: [marketSnapshots.itemId, marketSnapshots.source, marketSnapshots.date], set: { ...row, createdAt: new Date() } })
    .returning();
  return saved;
}

export async function snapshotsFor(userId: string, itemId: string) {
  const db = await readyDb();
  return db.select().from(marketSnapshots).where(and(eq(marketSnapshots.userId, userId), eq(marketSnapshots.itemId, itemId))).orderBy(marketSnapshots.date);
}

/** Latest snapshot per model, for collection-wide totals. */
export async function latestSnapshots(userId: string) {
  const db = await readyDb();
  const rows = await db.select({ itemId: marketSnapshots.itemId, date: marketSnapshots.date, count: marketSnapshots.count, medianCents: marketSnapshots.medianCents }).from(marketSnapshots).where(eq(marketSnapshots.userId, userId)).orderBy(desc(marketSnapshots.date));
  const out = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!out.has(r.itemId)) out.set(r.itemId, r);
  return [...out.values()];
}

/** Models without a snapshot in the last MARKET_REFRESH_DAYS, oldest first. */
async function due(limit: number) {
  const db = await readyDb();
  const last = db
    .select({ itemId: marketSnapshots.itemId, at: sql<string>`max(${marketSnapshots.date})`.as("at") })
    .from(marketSnapshots)
    .groupBy(marketSnapshots.itemId)
    .as("last");
  return db
    .select({ id: items.id, userId: items.userId })
    .from(items)
    .leftJoin(last, eq(last.itemId, items.id))
    .where(and(isNull(items.deletedAt), inArray(items.status, ["collection", "wishlist", "ordered", "preordered"]), sql`(${last.at} is null or ${last.at} < current_date - ${REFRESH_DAYS()}::int)`))
    .orderBy(sql`${last.at} nulls first`, items.createdAt)
    .limit(limit);
}

const g = globalThis as unknown as { __hangarMarket?: { timer: NodeJS.Timeout; running: boolean; lastRun: string | null; lastError: string | null } };

/** Refreshes due models one by one, spaced out, until the batch or the time budget is used up. */
export async function runDueRefreshes(budgetMs = Infinity) {
  const end = Date.now() + budgetMs;
  let done = 0;
  for (const it of await due(40)) {
    if (Date.now() > end) break;
    await refreshItem(it.userId, it.id);
    done++;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return done;
}

/** Works through due models in small, spaced batches so the daily API quota is never close. */
async function tick() {
  const s = g.__hangarMarket!;
  if (s.running || !marketEnabled()) return;
  s.running = true;
  try {
    await runDueRefreshes();
    s.lastError = null;
  } catch (e) {
    s.lastError = e instanceof Error ? e.message : String(e);
    console.error("[market]", s.lastError);
  } finally {
    s.lastRun = new Date().toISOString();
    s.running = false;
  }
}

export function startMarketScheduler() {
  // On serverless hosting (CRON_SECRET set) there is no long-lived process; /api/cron/market does the work.
  if (g.__hangarMarket || !marketEnabled() || process.env.CRON_SECRET) return;
  g.__hangarMarket = { timer: setInterval(tick, 30 * 60_000), running: false, lastRun: null, lastError: null };
  g.__hangarMarket.timer.unref?.();
  setTimeout(tick, 60_000).unref?.();
}

export const marketStatus = () => ({ enabled: marketEnabled(), marketplace: MARKETPLACE(), refreshDays: REFRESH_DAYS(), running: g.__hangarMarket?.running ?? false, lastRun: g.__hangarMarket?.lastRun ?? null, lastError: g.__hangarMarket?.lastError ?? null });
