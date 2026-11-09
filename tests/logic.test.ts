import { describe, expect, it } from "vitest";
import { AIRCRAFT_TYPES, AIRLINES, MODEL_MANUFACTURERS } from "../src/data/reference";
import { analyzeRows, guessMapping, normalizeDate } from "../src/lib/importer";
import { aircraftOfTheDay, buildReel, pickRandom, reelDelays } from "../src/lib/picker";
import { applyFilters, buildIndex, emptyFilters, searchItems } from "../src/lib/search";
import { findDuplicates, formatRegistration, isDuplicate, normBarcode, normalizeScale, parseSmartQuery, registrationCountry, searchAircraft } from "../src/lib/smart";
import { computeStats, convert, parseMoney } from "../src/lib/stats";
import type { Item, Reference } from "../src/lib/types";

const ref: Reference = {
  airlines: AIRLINES.map(([name, iata, icao, country, aliases, defunct], i) => ({ id: `al${i}`, name, iata, icao, country, aliases: aliases ?? [], defunct: !!defunct })),
  aircraft: AIRCRAFT_TYPES.map(([manufacturer, family, variant, icaoCode, shape, aliases], i) => ({ id: `ac${i}`, manufacturer, family, variant, icaoCode, shape, aliases: aliases ?? [] })),
  makers: MODEL_MANUFACTURERS.map(([name], i) => ({ id: `m${i}`, name, own: false })),
};

const base: Item = {
  id: "x", releaseId: null, status: "collection", airlineId: null, airlineName: null, aircraftTypeId: null, aircraftName: "", modelManufacturerName: "NG Models",
  scale: "1:400", registration: null, itemNumber: null, barcode: null, liveryCategory: null, liveryName: null, countryCode: null, registrationCountry: null,
  purchasePriceCents: null, purchaseCurrency: null, purchaseDate: null, valueCents: null, valueCurrency: null, valueDate: null, valueSource: null, condition: null,
  boxStatus: null, limitedEdition: null, certificate: null, storageLocation: null, purchaseSource: null, rating: null, notes: null, priority: null,
  desiredPriceCents: null, desiredCurrency: null, expectedRelease: null, dealer: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", imageId: null,
};
const mk = (o: Partial<Item>): Item => ({ ...base, ...o });
const variants = (q: string) => searchAircraft(ref.aircraft, q).map((a) => a.variant);

describe("aircraft autocomplete", () => {
  it("A35 offers exactly the two A350s", () => expect(variants("A35")).toEqual(["A350-900", "A350-1000"]));
  it("B77 offers every 777", () => {
    for (const v of ["777-200", "777-200ER", "777-200LR", "777-300", "777-300ER", "777F", "777-8", "777-9"]) expect(variants("B77")).toContain(v);
    expect(variants("B77").every((v) => v.startsWith("777"))).toBe(true);
  });
  it("B77W resolves to the 777-300ER", () => expect(variants("B77W")[0]).toBe("777-300ER"));
});

describe("reference data integrity", () => {
  it("has no duplicate names", () => {
    expect(new Set(AIRLINES.map((a) => a[0])).size).toBe(AIRLINES.length);
    expect(new Set(AIRCRAFT_TYPES.map((a) => a[0] + a[2])).size).toBe(AIRCRAFT_TYPES.length);
  });
  it("codes have the right shape", () => {
    for (const [, iata, icao, country] of AIRLINES) {
      if (iata) expect(iata).toMatch(/^[A-Z0-9]{2}$/);
      if (icao) expect(icao).toMatch(/^[A-Z]{3}$/);
      expect(country).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe("smart query", () => {
  it("SWISS A350", () => {
    const p = parseSmartQuery("SWISS A350", ref);
    expect(p.airline?.name).toBe("Swiss Int. Airlines");
    expect(p.aircraft.map((a) => a.variant)).toEqual(["A350-900", "A350-1000"]);
  });
  it("Lufthansa 747-8", () => {
    const p = parseSmartQuery("Lufthansa 747-8", ref);
    expect(p.airline?.name).toBe("Lufthansa");
    expect(p.aircraft[0].variant).toBe("747-8");
  });
  it("US Air Force is not United Airlines", () => {
    expect(parseSmartQuery("United States Air Force C-17", ref).airline?.name).toBe("US Air Force");
    expect(parseSmartQuery("USAF 747-8", ref).airline?.name).toBe("US Air Force");
  });
  it("military types and private operators", () => {
    expect(parseSmartQuery("USAF C-17", ref).aircraft.map((a) => a.variant)).toEqual(["C-17 Globemaster III"]);
    expect(parseSmartQuery("USAF VC-25", ref).aircraft.map((a) => a.variant)).toEqual(["VC-25A"]);
    expect(searchAircraft(ref.aircraft, "Air Force One")[0].variant).toBe("VC-25A");
    expect(parseSmartQuery("Trump Force One 757-200", ref).airline?.name).toBe("Trump Force One");
    expect(parseSmartQuery("Trump Shuttle 727-200", ref).airline?.name).toBe("Trump Shuttle");
    expect(parseSmartQuery("Pegasus A320neo", ref).airline?.name).toBe("Pegasus Airlines");
    expect(parseSmartQuery("Atlas Air 747-400F", ref).airline?.name).toBe("Atlas Air");
  });
  it("registration only", () => expect(parseSmartQuery("HB-JNA", ref).registration).toBe("HB-JNA"));
  it("type names with a dash are types, not registrations", () => {
    const p = parseSmartQuery("YY Wings Lufthansa Cargo MD-11F D-ALCA 1:400", ref);
    expect(p.maker?.name).toBe("YY Wings");
    expect(p.aircraft.map((a) => a.variant)).toEqual(["MD-11F"]);
    expect(p.registration).toBe("D-ALCA");
    expect(parseSmartQuery("777-300ER", ref).aircraft[0].variant).toBe("777-300ER");
    expect(parseSmartQuery("777-300ER", ref).registration).toBeNull();
  });
  it("maker + item number", () => {
    const p = parseSmartQuery("NG Models 58012", ref);
    expect(p.maker?.name).toBe("NG Models");
    expect(p.itemNumber).toBe("58012");
    expect(p.aircraft).toEqual([]);
  });
  it("GeminiJets Delta 767", () => {
    const p = parseSmartQuery("GeminiJets Delta 767", ref);
    expect(p.maker?.name).toBe("GeminiJets");
    expect(p.airline?.name).toBe("Delta Air Lines");
    expect(p.aircraft[0].family).toBe("767");
  });
  it("JC Wings A330 1:400", () => {
    const p = parseSmartQuery("JC Wings A330 1:400", ref);
    expect(p.maker?.name).toBe("JC Wings");
    expect(p.scale).toBe("1:400");
    expect(p.aircraft.every((a) => a.variant.startsWith("A330"))).toBe(true);
  });
  it("keeps an unknown livery word as unrecognised text, not a fact", () => {
    const p = parseSmartQuery("Swiss A350 Wanderlust", ref);
    expect(p.rest).toEqual(["Wanderlust"]);
  });
  it("tolerates an airline typo", () => expect(parseSmartQuery("Lufthnasa 747-8", ref).airline?.name).toBe("Lufthansa"));
});

describe("registration + scale", () => {
  it("formats conservatively", () => {
    expect(formatRegistration("hbjna")).toBe("HB-JNA");
    expect(formatRegistration("n123ab")).toBe("N123AB");
    expect(formatRegistration("JA873J")).toBe("JA873J");
    expect(formatRegistration("xyzzy12")).toBe("XYZZY12");
  });
  it("derives the country", () => {
    expect(registrationCountry("HB-JNA")).toBe("CH");
    expect(registrationCountry("N123AB")).toBe("US");
    expect(registrationCountry("B-HNA")).toBe("HK");
    expect(registrationCountry("B-2088")).toBe("CN");
  });
  it("normalises scales and never mixes 1:400 with 1:500", () => {
    expect(normalizeScale("1/400")).toBe("1:400");
    expect(normalizeScale("500")).toBe("1:500");
    expect(normalizeScale("HO")).toBe("HO");
  });
});

describe("duplicates", () => {
  const a = { airlineName: "SWISS", aircraftName: "Boeing 777-300ER", modelManufacturerName: "JC Wings", scale: "1:400", registration: "HB-JNA", itemNumber: "A1", liveryName: null };
  it("same item number is a duplicate", () => expect(isDuplicate(a, { ...a })).toBe(true));
  it("same registration from another maker is not", () => expect(isDuplicate(a, { ...a, modelManufacturerName: "NG Models", itemNumber: "B2" })).toBe(false));
  it("same registration in another scale is not", () => expect(isDuplicate(a, { ...a, scale: "1:200", itemNumber: "A2" })).toBe(false));
  it("another edition with its own number is not", () => expect(isDuplicate(a, { ...a, itemNumber: "A1-2" })).toBe(false));
  it("same barcode is a duplicate even with other details", () => expect(isDuplicate({ ...a, barcode: "4013150523456" }, { ...a, modelManufacturerName: "Other", itemNumber: "Z9", barcode: "4013150523456" })).toBe(true));
  it("different barcodes are not, even with the same item number", () => expect(isDuplicate({ ...a, barcode: "4013150523456" }, { ...a, barcode: "4013150523463" })).toBe(false));
  it("UPC-A equals its EAN-13 form", () => expect(normBarcode("013150523456")).toBe(normBarcode("0013150523456")));
  it("no item numbers: full match needed", () => {
    const n = { ...a, itemNumber: null };
    expect(isDuplicate(n, { ...n })).toBe(true);
    expect(isDuplicate(n, { ...n, liveryName: "Retro" })).toBe(false);
  });
  it("sparse entries never count as duplicates", () => {
    const sparse = { ...a, itemNumber: null, registration: null };
    expect(findDuplicates(sparse, [sparse])).toEqual([]);
  });
});

describe("collection search", () => {
  const swiss = ref.airlines.find((a) => a.name.startsWith("Swiss Int."))!;
  const w = ref.aircraft.find((a) => a.variant === "777-300ER")!;
  const items = [
    mk({ id: "1", airlineId: swiss.id, airlineName: swiss.name, aircraftTypeId: w.id, aircraftName: "Boeing 777-300ER", registration: "HB-JNA" }),
    mk({ id: "2", airlineName: "Lufthansa", aircraftName: "Boeing 747-8", registration: "D-ABYA", notes: "gift from Anna" }),
  ];
  const idx = buildIndex(items, ref);
  const ids = (q: string) => searchItems(idx, q).map((i) => i.id);
  for (const q of ["Swiss 777", "SWISS B77W", "777-300ER Swiss", "Swis 777", "LX 777", "HBJNA", "hb-jna"]) it(q, () => expect(ids(q)).toEqual(["1"]));
  it("searches notes", () => expect(ids("anna")).toEqual(["2"]));
  it("all words must match", () => expect(ids("Swiss 747")).toEqual([]));
});

describe("filters", () => {
  const types = new Map(ref.aircraft.map((a) => [a.id, a]));
  const items = [mk({ id: "a", scale: "1:400", airlineName: "SWISS", aircraftName: "x" }), mk({ id: "b", scale: "1:500", airlineName: "SWISS", aircraftName: "x" })];
  it("combine", () => expect(applyFilters(items, { ...emptyFilters(), airline: ["SWISS"], scale: ["1:500"] }, types).map((i) => i.id)).toEqual(["b"]));
  it("price range excludes unpriced", () => expect(applyFilters(items, { ...emptyFilters(), priceMin: 1 }, types)).toEqual([]));
});

describe("random picker", () => {
  it("every item has the same probability", () => {
    const pool = ["a", "b", "c", "d", "e"];
    const n = 50000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const k = pickRandom(pool)!;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    // chi² with 4 degrees of freedom; p≈1e-6 threshold keeps this from flaking.
    const chi = pool.reduce((s, k) => s + (counts[k] - n / 5) ** 2 / (n / 5), 0);
    expect(chi).toBeLessThan(33);
  });
  it("empty pool", () => expect(pickRandom([])).toBeNull());
  it("single model", () => {
    expect(pickRandom(["only"])).toBe("only");
    expect(buildReel(["only"], "only")).toEqual(["only"]);
    expect(reelDelays(1)).toEqual([]);
  });
  it("reel ends on the winner and only shows pool items", () => {
    const pool = [1, 2, 3];
    for (let i = 0; i < 200; i++) {
      const r = buildReel(pool, 2);
      expect(r.at(-1)).toBe(2);
      expect(r.every((x) => pool.includes(x))).toBe(true);
      for (let j = 1; j < r.length; j++) expect(r[j]).not.toBe(r[j - 1]);
    }
  });
  it("delays sum to the duration and brake", () => {
    const d = reelDelays(22, 3000);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(3000);
    expect(d.at(-1)!).toBeGreaterThan(d[0] * 5);
  });
  it("aircraft of the day is stable within a day and changes across days", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `id${i}` }));
    expect(aircraftOfTheDay(items, "u", "2026-11-01")).toBe(aircraftOfTheDay([...items].reverse(), "u", "2026-11-01"));
    const days = new Set(Array.from({ length: 30 }, (_, d) => aircraftOfTheDay(items, "u", `2026-11-${String(d + 1).padStart(2, "0")}`)!.id));
    expect(days.size).toBeGreaterThan(10);
  });
});

describe("money + stats", () => {
  it("parses both locales", () => {
    expect(parseMoney("42,99")).toBe(4299);
    expect(parseMoney("42.99")).toBe(4299);
    expect(parseMoney("1.299,00")).toBe(129900);
    expect(parseMoney("1,299.00")).toBe(129900);
    expect(parseMoney("€ 49")).toBe(4900);
    expect(parseMoney("abc")).toBeNull();
  });
  it("does not convert without a rate", () => {
    expect(convert(100, "CHF", "EUR", null)).toBeNull();
    expect(convert(100, "EUR", "EUR", null)).toBe(100);
    expect(convert(110, "USD", "EUR", { base: "EUR", rates: { USD: 1.1 }, date: "" })).toBe(100);
  });
  it("spec example: 42.99 → 65.00, wishlist excluded", () => {
    const s = computeStats(
      [
        mk({ id: "1", purchasePriceCents: 4299, purchaseCurrency: "EUR", valueCents: 6500, valueCurrency: "EUR" }),
        mk({ id: "2", purchasePriceCents: 1000, purchaseCurrency: "EUR" }),
        mk({ id: "3", status: "wishlist", purchasePriceCents: 9999, purchaseCurrency: "EUR" }),
      ],
      "EUR", null, new Map(),
    );
    expect(s.total).toBe(2);
    expect(s.spent).toBe(5299);
    expect(s.value).toBe(6500);
    expect(s.change).toBe(2201); // only the model with both numbers
    expect(s.changePercent).toBeCloseTo(51.2, 1);
  });
});

describe("import", () => {
  it("maps the spec's headers", () => {
    expect(guessMapping(["Airline Name", "Aircraft Model", "Scale", "Reg", "Manufacturer", "Price Paid"])).toEqual({
      airlineName: "Airline Name", aircraftName: "Aircraft Model", scale: "Scale", registration: "Reg", modelManufacturerName: "Manufacturer", purchasePrice: "Price Paid",
    });
  });
  it("maps German headers", () => {
    const m = guessMapping(["Fluggesellschaft", "Flugzeug", "Hersteller", "Maßstab", "Kennzeichen", "Kaufpreis", "Kaufdatum"]);
    expect(m.purchaseDate).toBe("Kaufdatum");
    expect(m.modelManufacturerName).toBe("Hersteller");
  });
  it("dates", () => {
    expect(normalizeDate("24.12.2023")).toBe("2023-12-24");
    expect(normalizeDate("2023-12-24")).toBe("2023-12-24");
    expect(normalizeDate("31.02.2023")).toBeNull();
  });
  const map = guessMapping(["Airline", "Aircraft", "Manufacturer", "Scale", "Reg", "Item Number", "Price"]);
  const code = (s: string) => (s.length === 2 ? s.toUpperCase() : null);
  const analyze = (rows: Record<string, string>[], existing: Item[] = []) => analyzeRows(rows, map, ref, existing, "EUR", code);
  it("normalises spelling, scale and derives the country", () => {
    const [r] = analyze([{ Airline: "swiss", Aircraft: "B77W", Manufacturer: "jc wings", Scale: "1/400", Reg: "hbjna", "Item Number": "XX-1", Price: "42,99 €" }]);
    expect(r.errors).toEqual([]);
    expect(r.input.airlineName).toBe("Swiss Int. Airlines");
    expect(r.input.aircraftName).toBe("Boeing 777-300ER");
    expect(r.input.modelManufacturerName).toBe("JC Wings");
    expect(r.input.scale).toBe("1:400");
    expect(r.input.registration).toBe("HB-JNA");
    expect(r.input.countryCode).toBe("CH");
    expect(r.input.purchasePriceCents).toBe(4299);
  });
  it("flags problems without guessing", () => {
    const [r] = analyze([{ Airline: "Mystery Air", Aircraft: "", Manufacturer: "NG Models", Price: "lots" }]);
    expect(r.errors.map((e) => e.code).sort()).toEqual(["bad_price", "missing_type"]);
    expect(r.warnings.map((e) => e.code)).toContain("unknown_airline");
    expect(r.input.airlineName).toBe("Mystery Air");
  });
  it("finds duplicates in the collection and within the file", () => {
    const row = { Airline: "Lufthansa", Aircraft: "747-8", Manufacturer: "Herpa", Scale: "1:500", Reg: "D-ABYA", "Item Number": "500", Price: "" };
    const [a, b] = analyze([row, row]);
    expect(a.duplicateInFile).toBeNull();
    expect(b.duplicateInFile).toBe(0);
    const existing = mk({ id: "e1", modelManufacturerName: "Herpa", scale: "1:500", itemNumber: "500" });
    expect(analyze([row], [existing])[0].duplicateOf).toBe("e1");
  });
});
