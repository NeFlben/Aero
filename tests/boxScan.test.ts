import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIRCRAFT_TYPES, AIRLINES, MODEL_MANUFACTURERS } from "../src/data/reference";
import { readBoxText, resolveBoxReading, validBarcode, type BoxReading, type OcrPage } from "../src/lib/boxScan";
import type { Reference } from "../src/lib/types";

const ref: Reference = {
  airlines: AIRLINES.map(([name, iata, icao, country, aliases, defunct], i) => ({ id: `al${i}`, name, iata, icao, country, aliases: aliases ?? [], defunct: !!defunct })),
  aircraft: AIRCRAFT_TYPES.map(([manufacturer, family, variant, icaoCode, shape, aliases], i) => ({ id: `ac${i}`, manufacturer, family, variant, icaoCode, shape, aliases: aliases ?? [] })),
  makers: MODEL_MANUFACTURERS.map(([name], i) => ({ id: `m${i}`, name, own: false })),
};

const none = { value: null, certainty: "printed" as const };
const printed = (value: string) => ({ value, certainty: "printed" as const });
const reading = (p: Partial<BoxReading>): BoxReading => ({
  isModelBox: true, manufacturer: none, itemNumber: none, scale: none, airline: none, aircraftType: none, registration: none,
  liveryName: none, liveryCategory: null, barcode: none, limitedEdition: null, extras: [], warnings: [], ...p,
});

describe("box reading", () => {
  it("checks EAN check digits", () => {
    expect(validBarcode("4013150523455")).toBe(true);
    expect(validBarcode("4013150523456")).toBe(false);
    expect(validBarcode("4006381333931")).toBe(true);
    expect(validBarcode("96385074")).toBe(true);
    expect(validBarcode("036000291452")).toBe(true); // UPC-A, read as EAN-13 with a leading zero
    expect(validBarcode("12345")).toBe(false);
  });

  it("maps printed text to reference entries", () => {
    const r = resolveBoxReading(reading({
      manufacturer: printed("Phoenix"), airline: printed("Lufthansa German Airlines"), aircraftType: printed("Boeing 777-300ER"),
      registration: printed("daixa"), scale: printed("1/400"), itemNumber: printed("11845"),
    }), ref);
    expect(r.input.modelManufacturerName).toBe("Phoenix Models");
    expect(r.input.airlineName).toBe("Lufthansa");
    expect(r.input.countryCode).toBe("DE");
    expect(r.input.aircraftName).toBe("Boeing 777-300ER");
    expect(r.input.aircraftTypeId).toMatch(/^ac\d+$/);
    expect(r.input.registration).toBe("D-AIXA");
    expect(r.input.registrationCountry).toBe("DE");
    expect(r.input.scale).toBe("1:400");
    expect(r.unsure).toEqual([]);
    expect(r.filled).toBe(6);
  });

  it("never takes an item number, registration or barcode from an inference", () => {
    const r = resolveBoxReading(reading({
      itemNumber: { value: "58012", certainty: "inferred" }, registration: { value: "HB-JNA", certainty: "inferred" }, barcode: { value: "4006381333931", certainty: "inferred" },
    }), ref);
    expect(r.input.itemNumber).toBeUndefined();
    expect(r.input.registration).toBeUndefined();
    expect(r.input.barcode).toBeUndefined();
  });

  it("marks unclear readings and ambiguous types for checking", () => {
    const r = resolveBoxReading(reading({ registration: { value: "HB-JN?", certainty: "unclear" }, aircraftType: printed("B772") }), ref);
    expect(r.unsure).toContain("registration");
    expect(r.unsure).toContain("aircraftName");
  });

  it("prefers a decoded barcode and drops one with a wrong check digit", () => {
    expect(resolveBoxReading(reading({ barcode: printed("4006381333932") }), ref, "4006381333931").input.barcode).toBe("4006381333931");
    const bad = resolveBoxReading(reading({ barcode: printed("4006381333932") }), ref);
    expect(bad.input.barcode).toBeUndefined();
    expect(bad.warnings).toContain("barcode_checksum");
  });

  it("keeps unknown names as printed", () => {
    const r = resolveBoxReading(reading({ manufacturer: printed("Sky Classics"), airline: printed("Fantasy Air") }), ref);
    expect(r.input.modelManufacturerName).toBe("Sky Classics");
    expect(r.input.airlineName).toBe("Fantasy Air");
    expect(r.input.airlineId).toBeNull();
  });
});

/** A photo's recognised text; every word read with the given confidence. */
const page = (text: string, confidence = 95): OcrPage => ({ text, words: text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, confidence })) });

describe("reading box text", () => {
  it("finds the facts on a typical front and side label", () => {
    const r = readBoxText([
      page("herpa WINGS\nLufthansa\nBoeing 747-8 Intercontinental\nD-ABYT\n1:500"),
      page("Item No. 536950\nLufthansa Boeing 747-8 Intercontinental - D-ABYT\n4013150536950\nNot suitable for children under 14 years"),
    ], ref);
    expect(r.isModelBox).toBe(true);
    expect(r.manufacturer.value).toBe("Herpa");
    expect(r.scale.value).toBe("1:500");
    expect(r.airline.value).toBe("Lufthansa");
    expect(r.aircraftType.value).toMatch(/747-8/);
    expect(r.registration).toEqual({ value: "D-ABYT", certainty: "printed" });
    expect(r.itemNumber).toEqual({ value: "536950", certainty: "printed" });
    // "14 years" is an age warning, not an anniversary livery.
    expect(r.liveryCategory).toBeNull();
  });

  it("reads a zero misread as the letter O in the scale", () => {
    expect(readBoxText([page("GeminiJets 1:4OO")], ref).scale.value).toBe("1:400");
  });

  it("takes a brand's item number format only for checking", () => {
    const r = readBoxText([page("JC WINGS 1:400 Singapore Airlines Airbus A350-900 9V-SMF XX40123")], ref);
    expect(r.manufacturer.value).toBe("JC Wings");
    expect(r.itemNumber).toEqual({ value: "XX40123", certainty: "unclear" });
    expect(r.registration.value).toBe("9V-SMF");
    const resolved = resolveBoxReading(r, ref);
    expect(resolved.unsure).toContain("itemNumber");
    expect(resolved.input.airlineName).toBe("Singapore Airlines");
  });

  it("does not take a type name or a scale for a registration", () => {
    const r = readBoxText([page("McDonnell Douglas MD-11 1-400 model")], ref);
    expect(r.registration.value).toBeNull();
  });

  it("marks a registration read with low confidence", () => {
    const r = readBoxText([page("Swiss HB-JNA 1:400", 55)], ref);
    expect(r.registration).toEqual({ value: "HB-JNA", certainty: "unclear" });
  });

  it("accepts barcode digits only with a valid check digit", () => {
    expect(readBoxText([page("4 006381 333931")], ref).barcode.value).toBe("4006381333931");
    expect(readBoxText([page("4 006381 333932")], ref).barcode.value).toBeNull();
  });

  it("notices alliance liveries, limited editions and extras", () => {
    const r = readBoxText([page("Star Alliance livery. Limited edition 500 pcs. Flaps down, with stand. 1:200")], ref);
    expect(r.liveryCategory).toBe("alliance");
    expect(r.liveryName.value).toBe("Star Alliance");
    expect(r.limitedEdition).toBe(true);
    expect(r.extras).toEqual(["Flaps down", "With stand"]);
  });

  it("says when there is nothing to go on", () => {
    expect(readBoxText([page("Made in China")], ref).isModelBox).toBe(false);
  });

  it("serves the text reader from a folder named after the installed version", () => {
    const { version } = JSON.parse(readFileSync("node_modules/tesseract.js/package.json", "utf8"));
    expect(readFileSync("src/components/BoxScan.tsx", "utf8")).toContain(`/vendor/tesseract-${version}"`);
  });
});
