import { describe, expect, it } from "vitest";
import { airlineMergeGroups } from "@/lib/airlineCleanup";
import type { AirlineRef, Item } from "@/lib/types";

const ref = [
  { id: "sas", name: "SAS Scandinavian Airlines", iata: "SK", icao: "SAS", country: "SE", aliases: ["SAS", "Scandinavian"], defunct: false },
  { id: "lx", name: "Swiss Int. Airlines", iata: "LX", icao: "SWR", country: "CH", aliases: ["Swiss"], defunct: false },
  { id: "sr", name: "Swissair", iata: "SR", icao: "SWR", country: "CH", aliases: [], defunct: true },
  { id: "sv", name: "Saudia", iata: "SV", icao: "SVA", country: "SA", aliases: [], defunct: false },
] as AirlineRef[];
let n = 0;
const mk = (airlineName: string, airlineId: string | null = null) => ({ id: String(n++), airlineName, airlineId }) as Item;

describe("airline clean up", () => {
  const groups = airlineMergeGroups([
    mk("Scandinavian airlines / SAS", "sas"), mk("Scandinavian Airlines /SAS", "sas"), mk("SAS Scandinavian Airlines", "sas"),
    mk("Swiss Int. Airlines", "lx"), mk("Swiss Int. AIrlines", "lx"), mk("Swissair", "sr"),
    mk("Saudia", "sv"), mk("Sauda"), mk("Etihad Cargo"), mk("Etihad"),
  ], ref);
  const find = (name: string) => groups.find((g) => g.variants.some((v) => v.name === name));

  it("groups spellings of one airline and suggests the reference name", () => {
    expect(find("Scandinavian airlines / SAS")?.variants).toHaveLength(3);
    expect(find("Scandinavian airlines / SAS")?.suggestion).toBe("SAS Scandinavian Airlines");
    expect(find("Sauda")?.suggestion).toBe("Saudia");
  });
  it("keeps different airlines apart", () => {
    expect(find("Swiss Int. Airlines")?.variants.map((v) => v.name)).not.toContain("Swissair");
    expect(find("Etihad Cargo")).toBeUndefined();
  });
});
