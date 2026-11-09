import { describe, expect, it } from "vitest";
import { aircraftCore, marketQueries, matches, summarize } from "@/lib/market";

const m = { modelManufacturerName: "Herpa Wings", scale: "1:500", airlineName: "Swiss", aircraftName: "Airbus A340-300", registration: "HB-JMA" };

describe("market matching", () => {
  it("finds the core type", () => {
    expect(aircraftCore("Boeing 747-400")).toBe("747");
    expect(aircraftCore("Airbus A340-300")).toBe("A340");
    expect(aircraftCore("McDonnell Douglas MD-11")).toBe("MD11");
  });
  it("builds queries from specific to broad", () => {
    expect(marketQueries(m)).toEqual(["Herpa 1:500 Swiss A340 HB-JMA", "Herpa 1:500 Swiss A340"]);
  });
  it("keeps the right listings and drops others", () => {
    expect(matches("Herpa Wings 1:500 Swiss International A340-300 HB-JMA", m)).toBe(true);
    expect(matches("HERPA 1/500 SWISS A 340-300", m)).toBe(true);
    expect(matches("Herpa 1:400 Swiss A340-300", m)).toBe(false);
    expect(matches("Herpa 1:500 Lufthansa A340-300", m)).toBe(false);
    expect(matches("Gemini 1:500 Swiss A340-300", m)).toBe(false);
    expect(matches("Herpa 1:500 Swiss A340 Ersatz Fahrwerk", m)).toBe(false);
  });
  it("summarizes without outliers", () => {
    const s = summarize([4000, 4500, 5000, 5500, 60000])!;
    expect(s.median).toBe(4750);
    expect(s.used).not.toContain(60000);
  });
});
