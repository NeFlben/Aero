/**
 * Generates public/world-map.json from Natural Earth (world-atlas, public domain): one projected
 * SVG path per country plus a marker point for countries too small to click on the map.
 * Run once when the map should change; the output is committed.
 */
import fs from "node:fs";
import path from "node:path";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import countries from "i18n-iso-countries";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

const topo = JSON.parse(fs.readFileSync("node_modules/world-atlas/countries-50m.json", "utf8")) as Topology;
const fc = feature(topo, topo.objects.countries as GeometryCollection);

const W = 960;
const H = 490;
const projection = geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: "Sphere" });
const pathGen = geoPath(projection).digits(1);

const out: { id: string; d: string; x: number; y: number; tiny: boolean }[] = [];
for (const f of fc.features) {
  const numeric = String(f.id ?? "").padStart(3, "0");
  const iso = countries.numericToAlpha2(numeric);
  if (!iso || iso === "AQ") continue;
  const d = pathGen(f);
  if (!d) continue;
  const [x, y] = pathGen.centroid(f);
  // Only the largest polygons matter at this scale; dropping specks keeps the file small.
  const parts = d.split(/(?=M)/).filter((p) => p.length > 28 || d.length < 200).join("");
  const area = pathGen.area(f);
  // Some territories share a parent's code (Ashmore and Cartier Islands are AU): one shape per code,
  // labelled at the larger part, because the map keys its paths by code.
  const prev = out.find((c) => c.id === iso);
  if (prev) {
    if (!prev.tiny || area < 14) prev.d += parts;
    else Object.assign(prev, { d: parts + prev.d, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, tiny: false });
    continue;
  }
  out.push({ id: iso, d: parts, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, tiny: area < 14 });
}
const file = path.join("public", "world-map.json");
fs.writeFileSync(file, JSON.stringify({ width: W, height: H, countries: out }));
console.log(`${out.length} countries, ${(fs.statSync(file).size / 1024).toFixed(0)} KB, tiny: ${out.filter((c) => c.tiny).length}`);

