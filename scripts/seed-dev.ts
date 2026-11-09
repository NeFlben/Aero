/**
 * Development and test data only. Creates demo@hangar.test with an invented sample collection
 * (item numbers, prices and values are made up) plus a user-free account for comparison.
 * Stop the dev server first: PGlite allows one process at a time.
 *   npm run db:seed-dev [-- 400]
 */
import { eq } from "drizzle-orm";
import { closeDb, getDb, readyDb } from "../src/db";
import { airlines, aircraftTypes, items, user, valueHistory } from "../src/db/schema";
import { getAuth } from "../src/server/auth";

const COUNT = Number(process.argv[2] ?? 64);
const EMAIL = "demo@hangar.test";
const PASSWORD = "hangar-demo-1";

let seed = 42;
const rnd = (n: number) => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed % n;
};
const pick = <T,>(a: T[]) => a[rnd(a.length)];

async function main() {
  await readyDb();
  const db = getDb();
  const auth = await getAuth();
  const [existing] = await db.select().from(user).where(eq(user.email, EMAIL));
  if (existing) await db.delete(user).where(eq(user.id, existing.id));
  const signed = await auth.api.signUpEmail({ body: { name: "Demo Collector", email: EMAIL, password: PASSWORD } });
  const userId = signed.user.id;

  const al = await db.select().from(airlines);
  const ty = await db.select().from(aircraftTypes);
  const airlineNames = ["SWISS International Air Lines", "Lufthansa", "Edelweiss Air", "British Airways", "Emirates", "Delta Air Lines", "United Airlines", "Singapore Airlines", "KLM Royal Dutch Airlines", "Qatar Airways", "Cathay Pacific", "Japan Airlines", "Air Canada", "Swissair", "Pan Am"];
  const carriers = airlineNames.map((n) => al.find((a) => a.name === n)!);
  const variants = ["A350-900", "A350-1000", "A330-300", "A340-300", "A320neo", "A321neo", "A220-300", "A380-800", "777-300ER", "777-200ER", "747-8", "747-400", "787-9", "767-300ER", "737-800", "MD-11", "E195-E2"];
  const types = variants.map((v) => ty.find((t) => t.variant === v)!);
  const makers = ["NG Models", "JC Wings", "GeminiJets", "Phoenix Models", "Herpa", "Aviation400", "InFlight200"];
  const scales = ["1:400", "1:400", "1:400", "1:200", "1:500"];
  const prefix: Record<string, string> = { CH: "HB-", DE: "D-", GB: "G-", AE: "A6-", SG: "9V-", NL: "PH-", QA: "A7-", HK: "B-", CA: "C-" };
  const liveries: [string | null, string | null][] = [["standard", null], ["standard", null], ["standard", null], ["standard", null], ["retro", "Retro"], ["special", "Demo Special"], ["alliance", "Alliance"], ["anniversary", "Anniversary"]];
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";

  const rows: (typeof items.$inferInsert)[] = [];
  for (let i = 0; i < COUNT; i++) {
    const a = pick(carriers);
    const t = pick(types);
    const [cat, name] = pick(liveries);
    const p = prefix[a.country ?? ""] ?? "N";
    const reg = p === "N" ? `N${100 + rnd(899)}${pick([...letters])}${pick([...letters])}` : p + Array.from({ length: p.length === 2 ? 4 : 3 }, () => pick([...letters])).join("");
    const price = 2500 + rnd(9000);
    const valued = rnd(10) < 6;
    const month = rnd(40);
    const date = new Date(Date.UTC(2023, month, 1 + rnd(27))).toISOString().slice(0, 10);
    rows.push({
      userId, airlineId: a.id, airlineName: a.name, aircraftTypeId: t.id, aircraftName: `${t.manufacturer} ${t.variant}`, modelManufacturerName: pick(makers), scale: pick(scales),
      registration: reg, registrationCountry: a.country, itemNumber: `DEMO-${10000 + i}`, liveryCategory: cat as never, liveryName: name, countryCode: a.country,
      purchasePriceCents: price, purchaseCurrency: rnd(5) === 0 ? "CHF" : "EUR", purchaseDate: date,
      valueCents: valued ? price + rnd(3500) - 800 : null, valueCurrency: valued ? "EUR" : null, valueDate: valued ? "2026-10-01" : null, valueSource: valued ? "user_estimate" : null,
      condition: pick(["mint", "very_good", "good"]) as never, boxStatus: pick(["with_box", "with_box", "no_box"]) as never, limitedEdition: rnd(6) === 0, storageLocation: `Shelf ${1 + rnd(9)}`,
    });
  }
  const wishlist = [
    { aircraftName: "Boeing 777-9", airline: "Lufthansa", status: "preordered" as const },
    { aircraftName: "Airbus A350-1000", airline: "British Airways", status: "wishlist" as const },
    { aircraftName: "McDonnell Douglas MD-11", airline: "Swissair", status: "ordered" as const },
  ];
  for (const w of wishlist) {
    const a = al.find((x) => x.name === w.airline)!;
    rows.push({ userId, status: w.status, airlineId: a.id, airlineName: a.name, aircraftName: w.aircraftName, modelManufacturerName: "NG Models", scale: "1:400", countryCode: a.country, priority: 1 + rnd(3), desiredPriceCents: 4500, desiredCurrency: "EUR", dealer: "Demo Dealer" });
  }

  const inserted = [];
  for (let i = 0; i < rows.length; i += 500) inserted.push(...(await db.insert(items).values(rows.slice(i, i + 500)).returning()));
  const hist = inserted.filter((r) => r.valueCents !== null).flatMap((r) => [
    { itemId: r.id, userId, cents: Math.round(r.valueCents! * 0.92), currency: "EUR" as const, date: "2026-04-01", source: "user_estimate" },
    { itemId: r.id, userId, cents: r.valueCents!, currency: "EUR" as const, date: "2026-10-01", source: "user_estimate" },
  ]);
  for (let i = 0; i < hist.length; i += 500) await db.insert(valueHistory).values(hist.slice(i, i + 500));

  console.log(`Seeded ${inserted.length} models.\nLogin: ${EMAIL} / ${PASSWORD}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
