"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useOwned } from "./AppProvider";
import { ModelImage } from "./ModelImage";
import { cx, EmptyState, Flag, PageHeader, Panel, Reg, Select } from "./ui";

interface MapData {
  width: number;
  height: number;
  countries: { id: string; d: string; x: number; y: number; tiny: boolean }[];
}

/** Sequential single-hue steps by share of the top country; zero stays neutral. */
const shade = (n: number, max: number) => (n === 0 ? "var(--surface-2)" : `color-mix(in oklab, var(--accent) ${Math.round(28 + 72 * Math.sqrt(n / max))}%, var(--surface))`);

export function WorldMap() {
  const { t, country } = useI18n();
  const owned = useOwned();
  const [map, setMap] = useState<MapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [basis, setBasis] = useState<"airline" | "registration">("airline");
  const [scale, setScale] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    fetch("/world-map.json").then((r) => r.json()).then(setMap).catch(() => setFailed(true));
  }, []);

  const scales = useMemo(() => [...new Set((owned ?? []).map((i) => i.scale).filter(Boolean) as string[])].sort(), [owned]);
  const data = useMemo(() => {
    const items = (owned ?? []).filter((i) => !scale || i.scale === scale);
    const byCountry = new Map<string, { models: number; airlines: Set<string> }>();
    let unknown = 0;
    for (const i of items) {
      const c = basis === "airline" ? i.countryCode : i.registrationCountry;
      if (!c) {
        unknown++;
        continue;
      }
      const e = byCountry.get(c) ?? { models: 0, airlines: new Set<string>() };
      e.models++;
      if (i.airlineName) e.airlines.add(i.airlineName);
      byCountry.set(c, e);
    }
    const ranked = [...byCountry].sort((a, b) => b[1].models - a[1].models);
    return { items, byCountry, ranked, unknown, max: ranked[0]?.[1].models ?? 1 };
  }, [owned, basis, scale]);

  const models = picked ? data.items.filter((i) => (basis === "airline" ? i.countryCode : i.registrationCountry) === picked) : [];
  const focus = hover ?? picked;
  const focusData = focus ? data.byCountry.get(focus) : null;

  return (
    <>
      <PageHeader title={t("World Map")} eyebrow={t("{n} countries", { n: data.ranked.length })}>
        <div role="group" aria-label={t("Assign models by")} className="flex rounded-md border border-line-strong bg-surface text-[13px]">
          <button type="button" aria-pressed={basis === "airline"} onClick={() => { setBasis("airline"); setPicked(null); }} className={cx("h-[34px] rounded-l-md px-3 max-md:h-[42px]", basis === "airline" ? "bg-surface-2 font-medium" : "text-ink-2")}>{t("Airline home")}</button>
          <button type="button" aria-pressed={basis === "registration"} onClick={() => { setBasis("registration"); setPicked(null); }} className={cx("h-[34px] rounded-r-md px-3 max-md:h-[42px]", basis === "registration" ? "bg-surface-2 font-medium" : "text-ink-2")}>{t("Registration")}</button>
        </div>
        <Select aria-label={t("Scale")} value={scale} onChange={(e) => setScale(e.target.value)} className="w-[110px]">
          <option value="">{t("All scales")}</option>
          {scales.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel className="relative overflow-hidden">
          {failed ? <EmptyState title={t("The map could not be loaded")} /> : !map ? <div className="skeleton aspect-[2/1]" /> : (
            <svg viewBox={`0 0 ${map.width} ${map.height}`} className="block w-full" role="img" aria-label={t("World map of your collection")}>
              {map.countries.map((c) => {
                const n = data.byCountry.get(c.id)?.models ?? 0;
                return (
                  <path key={c.id} d={c.d} fill={shade(n, data.max)} stroke={picked === c.id ? "var(--ink)" : "var(--surface)"} strokeWidth={picked === c.id ? 1 : 0.4}
                    className={cx(n > 0 && "cursor-pointer outline-none hover:brightness-110")}
                    onMouseEnter={() => n > 0 && setHover(c.id)} onMouseLeave={() => setHover(null)}
                    onClick={() => n > 0 && setPicked(c.id === picked ? null : c.id)}
                    tabIndex={n > 0 ? 0 : -1} aria-label={n > 0 ? `${country(c.id)}: ${t("{n} models", { n })}` : undefined}
                    onKeyDown={(e) => { if (n > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setPicked(c.id === picked ? null : c.id); } }}
                  />
                );
              })}
              {/* Singapore, Malta, Bahrain and the like get a marker so they stay reachable. */}
              {map.countries.filter((c) => c.tiny && data.byCountry.has(c.id)).map((c) => (
                <circle key={c.id} cx={c.x} cy={c.y} r={picked === c.id ? 5 : 3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth="1" className="cursor-pointer" onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)} onClick={() => setPicked(c.id === picked ? null : c.id)} />
              ))}
            </svg>
          )}
          {focus && focusData && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-[4px] bg-board px-2.5 py-1.5 text-[12.5px] text-board-ink">
              <div className="flex items-center gap-1.5 font-medium"><Flag code={focus} /> {country(focus)}</div>
              <div className="num text-board-dim">{t("{n} models", { n: focusData.models })} · {t("{n} airlines", { n: focusData.airlines.size })}</div>
            </div>
          )}
        </Panel>

        <Panel title={t("Most Frequent Countries")}>
          {data.ranked.length === 0 ? <p className="px-4 py-6 text-[13px] text-ink-3">{t("No data yet")}</p> : (
            <ul className="scroll-thin max-h-[420px] overflow-y-auto py-1">
              {data.ranked.map(([c, e]) => (
                <li key={c}>
                  <button type="button" onClick={() => setPicked(c === picked ? null : c)} aria-pressed={picked === c} className={cx("flex w-full items-center gap-2 px-4 py-1.5 text-left text-[13px] hover:bg-surface-2/60 max-md:py-2.5", picked === c && "bg-accent-soft")}>
                    <Flag code={c} /><span className="min-w-0 flex-1 truncate">{country(c)}</span>
                    <span className="num text-[12px] text-ink-3">{t("{n} airlines", { n: e.airlines.size })}</span>
                    <span className="num w-7 text-right font-medium">{e.models}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.unknown > 0 && <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">{t("{n} models without a known country", { n: data.unknown })}</p>}
        </Panel>
      </div>

      {picked && (
        <Panel className="mt-4" title={`${country(picked)} · ${t("{n} models", { n: models.length })}`} aside={<Link href={`/collection?country=${picked}`} className="text-[12px] text-accent hover:underline">{t("Open in collection")}</Link>}>
          <ul className="grid gap-px sm:grid-cols-2 xl:grid-cols-3">
            {models.slice(0, 60).map((i) => (
              <li key={i.id}>
                <Link href={`/collection/${i.id}`} className="flex items-center gap-3 p-2.5 hover:bg-surface-2/50">
                  <ModelImage item={i} className="h-10 w-16 shrink-0 rounded-[3px]" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{i.aircraftName}</span><span className="block truncate text-[12px] text-ink-2">{[i.airlineName, i.scale].filter(Boolean).join(" · ")}</span></span>
                  <Reg>{i.registration}</Reg>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
