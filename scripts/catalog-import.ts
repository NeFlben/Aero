/**
 * Loads real model releases into the shared catalog from a CSV you trust.
 *   npm run catalog:import -- releases.csv --source "https://…" [--verified]
 * Columns: airline, aircraft, manufacturer, scale, registration, item_number, barcode, livery_type, livery, year
 * Without --verified entries stay unverified. Airline and aircraft link to reference data only on an
 * exact match, and rows that already exist (same manufacturer + item number) are skipped.
 */
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import Papa from "papaparse";
import { closeDb, readyDb } from "../src/db";
import { airlines, aircraftTypes, modelReleases } from "../src/db/schema";
import { normalizeScale } from "../src/lib/smart";
import { aircraftLabel, LIVERY_CATEGORIES } from "../src/lib/types";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--source");
  if (!file) throw new Error("Usage: catalog:import <file.csv> [--source url] [--verified]");
  const source = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;
  const verified = args.includes("--verified");
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(file, "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });

  const db = await readyDb();
  const al = await db.select().from(airlines);
  const ty = await db.select().from(aircraftTypes);
  let added = 0, skipped = 0;
  for (const r of data) {
    const aircraft = r.aircraft?.trim();
    const maker = r.manufacturer?.trim();
    if (!aircraft || !maker) {
      skipped++;
      continue;
    }
    const item = r.item_number?.trim() || null;
    if (item) {
      const [dupe] = await db.select({ id: modelReleases.id }).from(modelReleases).where(and(eq(modelReleases.modelManufacturerName, maker), eq(modelReleases.itemNumber, item)));
      if (dupe) {
        skipped++;
        continue;
      }
    }
    const a = al.find((x) => x.name.toLowerCase() === r.airline?.trim().toLowerCase());
    const t = ty.find((x) => aircraftLabel(x).toLowerCase() === aircraft.toLowerCase() || x.variant.toLowerCase() === aircraft.toLowerCase());
    const cat = r.livery_type?.trim().toLowerCase();
    await db.insert(modelReleases).values({
      airlineId: a?.id, airlineName: a?.name ?? (r.airline?.trim() || null), aircraftTypeId: t?.id, aircraftName: t ? aircraftLabel(t) : aircraft, modelManufacturerName: maker,
      scale: normalizeScale(r.scale), registration: r.registration?.trim() || null, itemNumber: item, barcode: r.barcode?.trim() || null,
      liveryCategory: (LIVERY_CATEGORIES as readonly string[]).includes(cat) ? (cat as never) : null, liveryName: r.livery?.trim() || null,
      releaseYear: Number(r.year) || null, status: verified ? "verified" : "unverified", sourceUrl: source,
    });
    added++;
  }
  console.log(`Added ${added}, skipped ${skipped}.`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
