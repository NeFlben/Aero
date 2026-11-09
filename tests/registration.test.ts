import { describe, expect, test } from "vitest";
import { baseType, matchAircraft, matchOperators, type RegInfo } from "@/lib/registration";
import { parseCommonsCategories } from "@/server/registration";
import type { AircraftRef, AirlineRef } from "@/lib/types";

const ac = (id: string, manufacturer: string, variant: string, icaoCode: string | null = null): AircraftRef => ({ id, manufacturer, family: "", variant, icaoCode, shape: "", aliases: [] });
const aircraft = [ac("744", "Boeing", "747-400", "B744"), ac("748", "Boeing", "747-8", "B748"), ac("748f", "Boeing", "747-8F", "B748"), ac("74s", "Boeing", "747SP", "B74S"), ac("319", "Airbus", "A319", "A319"), ac("343", "Airbus", "A340-300", "A343"), ac("77w", "Boeing", "777-300ER", "B77W")];
const al = (id: string, name: string, icao: string): AirlineRef => ({ id, name, icao, iata: null, country: "US", aliases: [], defunct: false } as unknown as AirlineRef);
const airlines = [al("nw", "Northwest Airlines", "NWA"), al("dl", "Delta Air Lines", "DAL"), al("lh", "Lufthansa", "DLH")];
const info = (p: Partial<RegInfo>): RegInfo => ({ registration: "X", types: [], icaoType: null, operators: [], built: null, source: "commons", ...p });

describe("registration lookup", () => {
  test("customer codes", () => {
    expect(baseType("Boeing 747-451")).toBe("Boeing 747-400");
    expect(baseType("Boeing 747-830")).toBe("Boeing 747-8");
    expect(baseType("Boeing 777-3DEER")).toBe("Boeing 777-300ER");
    expect(baseType("Airbus A319-112")).toBe("Airbus A319");
    expect(baseType("Airbus A340-313")).toBe("Airbus A340-300");
  });
  test("commons categories of N665US", () => {
    const i = parseCommonsCategories("N665US", ["Aircraft by registration", "Aircraft registered in the United States (100-999)", "Aircraft scrapped in 2018", "Boeing 747-400 (ln 726)", "Boeing 747-400 (msn 23820)", "Boeing 747-400 built in 1989", "Boeing 747-400 by registration", "Boeing 747-400 of Delta Air Lines", "Boeing 747-400 of Northwest Airlines", "Boeing 747-451", "Number 665 on aircraft"])!;
    expect(i.types).toEqual(["Boeing 747-400", "Boeing 747-451"]);
    expect(i.operators.map((o) => o.name)).toEqual(["Delta Air Lines", "Northwest Airlines"]);
    expect(i.built).toBe(1989);
    expect(matchAircraft(i, aircraft)?.id).toBe("744");
    expect(matchOperators(i, airlines).map((o) => o.airline?.id)).toEqual(["dl", "nw"]);
  });
  test("hexdb style", () => {
    const i = info({ types: ["Boeing 747-830"], icaoType: "B748", operators: [{ name: "Lufthansa", icao: "DLH" }] });
    expect(matchAircraft(i, aircraft)?.id).toBe("748");
    expect(matchOperators(i, airlines)[0].airline?.id).toBe("lh");
  });
  test("unknown airline stays unmatched", () => {
    expect(matchOperators(info({ operators: [{ name: "Planet Airways", icao: null }] }), airlines)[0]).toEqual({ name: "Planet Airways", airline: null });
  });
});
