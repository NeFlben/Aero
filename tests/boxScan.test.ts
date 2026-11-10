import { describe, expect, it } from "vitest";
import { AIRCRAFT_TYPES, AIRLINES, MODEL_MANUFACTURERS } from "../src/data/reference";
import { BOX_READING_JSON_SCHEMA, boxReading, resolveBoxReading, validBarcode, type BoxReading } from "../src/lib/boxScan";
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

  it("keeps the JSON schema and the zod schema in step", () => {
    expect([...BOX_READING_JSON_SCHEMA.required].sort()).toEqual(Object.keys(boxReading.shape).sort());
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
