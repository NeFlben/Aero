import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DE } from "../src/lib/de";

const dir = path.resolve("src/components");
const sources = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");

describe("German translation", () => {
  it("covers every string passed to t()", () => {
    const keys = new Set([...sources.matchAll(/\bt\("((?:[^"\\]|\\.)+)"/g)].map((m) => m[1]));
    expect([...keys].filter((k) => !(k in DE))).toEqual([]);
  });
  it("covers the label tables", () => {
    const tables = [...sources.matchAll(/^(?:export )?const (?:LIVERY_LABEL|CONDITION_LABEL|BOX_LABEL|STATUS_LABEL|PRIORITY|SOURCE_LABEL|FIELD_LABEL|ISSUE)\b[^=]*=\s*\{([\s\S]*?)\};/gm)];
    expect(tables.length).toBeGreaterThanOrEqual(8);
    const labels = tables.flatMap((m) => [...m[1].matchAll(/:\s*"([^"]+)"/g)].map((x) => x[1]));
    expect(labels.filter((k) => !(k in DE))).toEqual([]);
  });
  it("keeps placeholders intact", () => {
    for (const [en, de] of Object.entries(DE)) {
      const vars = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
      expect(vars(de), en).toEqual(vars(en));
    }
  });
});
