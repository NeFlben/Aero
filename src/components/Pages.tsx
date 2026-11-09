"use client";

import { ArrowRight, ArrowUpRight, BadgeCheck, Building2, CalendarDays, CircleHelp, Compass, Earth, Gem, Heart, Layers, LineChart, Minus, PieChart, Plane, Plus, Ruler, Search, Sparkles, Trash2, TrendingDown, TrendingUp, Trophy, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { aircraftOfTheDay, localDay } from "@/lib/picker";
import { aircraftFamilyOf } from "@/lib/search";
import { computeStats, convert, valueChange, valueTimeline, type ValuePoint } from "@/lib/stats";
import type { Item, ReleaseRef } from "@/lib/types";
import { api, useApp, useOwned } from "./AppProvider";
import { AirlineCleanup } from "./AirlineCleanup";
import { AreaChart, BarList, Donut, PALETTE, Sparkline } from "./Charts";
import { formFromItem, LIVERY_LABEL, STATUS_LABEL } from "./ItemForm";
import { ImageOrSilhouette, ModelImage } from "./ModelImage";
import { PickerButton } from "./Picker";
import { Silhouette } from "./Silhouette";
import { btnClass, Button, cx, Dialog, EmptyState, Flag, Input, PageHeader, Panel, Reg } from "./ui";

function useStats() {
  const { items, user, rates, types } = useApp();
  return useMemo(() => (items ? computeStats(items, user.baseCurrency, rates, types) : null), [items, user.baseCurrency, rates, types]);
}

function useValuePoints() {
  const [values, setValues] = useState<ValuePoint[]>([]);
  const { items } = useApp();
  useEffect(() => {
    api<{ values: ValuePoint[] }>("/api/values").then((r) => setValues(r.values)).catch(() => {});
  }, [items?.length]);
  return values;
}

export function ChangeStat({ change, percent, money }: { change: number | null; percent: number | null; money: (c: number) => string }) {
  const { number } = useI18n();
  if (change === null) return <>—</>;
  const Icon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-1", change >= 0 ? "text-pos" : "text-neg")}>
      <Icon className="size-4 shrink-0" /> {change >= 0 ? "+" : "−"}{money(Math.abs(change))}
      {percent !== null && <span className="text-[12px] font-normal">({percent >= 0 ? "+" : "−"}{number(Math.abs(percent), 1)}%)</span>}
    </span>
  );
}

export function Dashboard() {
  const { t, money, moneyShort, month, number, locale } = useI18n();
  const { user, openAdd, rates, types } = useApp();
  const owned = useOwned();
  const stats = useStats();
  const values = useValuePoints();
  const router = useRouter();
  const base = user.baseCurrency;
  const m = (c: number) => money(c, base);

  // Rolls over at local midnight even when the dashboard stays open.
  const [today, setToday] = useState(localDay);
  useEffect(() => {
    const id = setInterval(() => setToday(localDay()), 60_000);
    return () => clearInterval(id);
  }, []);
  const day = useMemo(() => (owned ? aircraftOfTheDay(owned, user.id, today) : null), [owned, user.id, today]);
  const recent = useMemo(() => [...(owned ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6), [owned]);
  const ownedIds = useMemo(() => new Set((owned ?? []).map((i) => i.id)), [owned]);
  const timeline = useMemo(() => valueTimeline(values, ownedIds, base, rates), [values, ownedIds, base, rates]);
  const loading = stats === null;
  void convert;

  if (stats && stats.total === 0) {
    return (
      <>
        <PageHeader title={t("Your collection, at a glance.")} />
        <div className="card">
          <EmptyState icon={<Silhouette shape="wide" className="w-52 text-[var(--sil)]" />} title={t("Your hangar is empty")} body={t("Add your first model in a few seconds, or bring an existing collection along from a spreadsheet.")}
            action={<><Button variant="primary" size="lg" onClick={() => openAdd()}><Plus className="size-4" /> {t("Add Aircraft")}</Button><Link href="/import" className={btnClass("secondary", "lg")}>{t("Import a file")}</Link></>} />
        </div>
      </>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 5 ? t("Good evening") : hour < 12 ? t("Good morning") : hour < 18 ? t("Good afternoon") : t("Good evening");
  const firstName = user.name.split(/\s+/)[0];
  const dateLine = new Date().toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  const changeUp = (stats?.change ?? 0) >= 0;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[11.5px] font-semibold text-accent" suppressHydrationWarning>
            <CalendarDays className="size-3.5" /> {dateLine}
          </div>
          <h1 className="text-[32px] leading-[1.05] font-extrabold tracking-[-0.035em] md:text-[46px]" suppressHydrationWarning>
            {greeting}, <span className="grad-text">{firstName}</span>.
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">{t("Your collection, at a glance.")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-5">
          {/* The headline number: how many models are in the hangar. */}
          <div className="flex flex-col items-end">
            <Link href="/collection" className="group text-right" aria-label={t("{n} models", { n: stats?.total ?? 0 })}>
              <div className="num grad-text text-[64px] leading-[0.9] font-extrabold tracking-[-0.05em] transition-transform group-hover:scale-[1.03] md:text-[88px]">
                {loading ? "…" : number(stats!.total)}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-ink-2">{t("Models in your hangar")}</div>
            </Link>
            {stats && stats.scales.length > 0 && <ScaleBreakdown scales={stats.scales} total={stats.total} className="justify-end" />}
          </div>
          <div className="flex flex-col gap-2">
            <PickerButton />
            <Button variant="primary" onClick={() => openAdd()}><Plus className="size-4" /> {t("Add Aircraft")}</Button>
          </div>
        </div>
      </div>
      {stats && stats.unconverted > 0 && <p className="-mt-3 mb-4 text-[12px] text-signal">{t("{n} amounts in other currencies are not included because no exchange rate is available.", { n: stats.unconverted })}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Aircraft of the Day: the visual anchor of the page. */}
        {day ? (
          <Link href={`/collection/${day.id}`} aria-label={`${t("Aircraft of the Day")}: ${day.aircraftName}`}
            className="group relative isolate flex min-h-[380px] flex-col overflow-hidden rounded-[28px] bg-board text-board-ink shadow-[var(--shadow)] md:col-span-2 xl:row-span-2">
            <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_70%_at_75%_30%,rgb(99_102_241/0.55),transparent_70%),radial-gradient(60%_60%_at_10%_100%,rgb(14_165_233/0.35),transparent_70%)]" />
            <div className="flex items-center justify-between p-6 pb-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-semibold backdrop-blur"><Sparkles className="size-3.5 text-flap" /> {t("Aircraft of the Day")}</span>
              <span className="grid size-10 place-items-center rounded-full bg-white/10 backdrop-blur transition-transform group-hover:translate-x-0.5 group-hover:bg-white/20"><ArrowUpRight className="size-5" /></span>
            </div>
            <div className="relative flex flex-1 items-center justify-center px-4">
              <ImageOrSilhouette imageId={day.imageId} registration={day.registration} shape={day.aircraftTypeId ? types.get(day.aircraftTypeId)?.shape : undefined} size="full" alt={day.aircraftName}
                className="aspect-[16/9] w-full rounded-2xl bg-transparent! transition-transform duration-700 group-hover:scale-[1.04] [--sil:rgb(255_255_255/0.85)] [--sil-bg:transparent] drop-shadow-[0_30px_30px_rgb(0_0_0/0.45)]" />
            </div>
            <div className="bg-gradient-to-t from-black/50 to-transparent p-6 pt-10">
              <div className="flex items-center gap-2 text-[13.5px] text-board-dim"><Flag code={day.countryCode} /><span className="truncate">{day.airlineName ?? t("Unknown airline")}</span></div>
              <div className="mt-1 text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] md:text-[38px]">{day.aircraftName}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                {day.registration && <span className="code rounded-full bg-flap px-3 py-1 font-bold text-[#1a1305]">{day.registration}</span>}
                {day.modelManufacturerName && <span className="rounded-full bg-white/10 px-3 py-1 font-medium backdrop-blur">{day.modelManufacturerName}</span>}
                {day.scale && <span className="rounded-full bg-white/10 px-3 py-1 font-medium backdrop-blur">{day.scale}</span>}
              </div>
            </div>
          </Link>
        ) : (
          <div className="skeleton min-h-[380px] rounded-[28px] md:col-span-2 xl:row-span-2" />
        )}

        <StatTile loading={loading} icon={<Plane />} color="var(--c1)" label={t("Total Models")} value={number(stats?.total ?? 0)}
          sub={stats ? t("{a} airlines · {b} types", { a: stats.airlines.length, b: stats.aircraftTypes.length }) : undefined} spark={(stats?.growth ?? []).map((g) => g.total)} />
        <StatTile loading={loading} icon={<Gem />} color="var(--c6)" label={t("Collection Value")} value={stats?.valuedCount ? m(stats.value) : "—"}
          sub={stats ? t("{n} of {total} models valued", { n: stats.valuedCount, total: stats.total }) : undefined} spark={timeline.map((p) => p.total)} />
        <StatTile loading={loading} icon={<Wallet />} color="var(--c2)" label={t("Total Spent")} value={stats?.pricedCount ? m(stats.spent) : "—"}
          sub={stats ? t("{n} models with a price", { n: stats.pricedCount }) : undefined} />
        <StatTile loading={loading} icon={changeUp ? <TrendingUp /> : <TrendingDown />} color={changeUp ? "var(--c3)" : "var(--c5)"} label={t("Value Change")}
          value={stats ? <ChangeStat change={stats.change} percent={null} money={m} /> : ""}
          sub={stats ? (stats.change === null ? t("Needs a price and a value") : t("{p}% across {n} valued models", { p: `${stats.changePercent! >= 0 ? "+" : "−"}${number(Math.abs(stats.changePercent!), 1)}`, n: stats.changeBasis })) : undefined} />

        <Panel title={t("Collection Growth")} icon={<LineChart />} className="md:col-span-2">
          <AreaChart ariaLabel={t("Collection Growth")} format={(y) => t("{n} models", { n: y })} points={(stats?.growth ?? []).map((g) => ({ x: g.month, y: g.total, label: month(g.month) }))} />
        </Panel>
        <Panel title={t("Collection Value")} icon={<Gem />} className="md:col-span-2">
          {timeline.length ? <AreaChart ariaLabel={t("Collection Value")} format={(y) => moneyShort(y, base)} points={timeline.map((p) => ({ x: p.month, y: p.total, label: month(p.month) }))} /> : <p className="px-5 py-6 text-[13px] text-ink-3">{t("Market value not available")}. {t("Enter your own estimate on a model and the history starts here.")}</p>}
        </Panel>

        <Panel title={t("Favorite Airlines")} icon={<Building2 />} className="md:col-span-2">
          <BarList data={stats?.airlines ?? []} limit={6} onSelect={(v) => router.push(`/collection?q=${encodeURIComponent(v)}`)} />
        </Panel>
        <Panel title={t("Aircraft Distribution")} icon={<PieChart />}>
          <Donut data={stats?.aircraftMakers ?? []} centerLabel={t("Models")} />
        </Panel>
        <Panel title={t("Collection by Scale")} icon={<Ruler />}>
          <Donut data={stats?.scales ?? []} centerLabel={t("Models")} onSelect={(v) => router.push(`/collection?scale=${encodeURIComponent(v)}`)} />
        </Panel>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-[22px] font-extrabold tracking-[-0.03em]">{t("Recent Additions")}</h2>
          <Link href="/collection" className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft">{t("All models")} <ArrowRight className="size-4" /></Link>
        </div>
        <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-6">
          {recent.map((i) => (
            <li key={i.id} className="w-[220px] shrink-0 snap-start md:w-auto">
              <Link href={`/collection/${i.id}`} className="card lift group block overflow-hidden p-2">
                <div className="overflow-hidden rounded-[18px]">
                  <ModelImage item={i} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.06]" />
                </div>
                <div className="px-2 pt-3 pb-2">
                  <div className="truncate text-[14px] font-bold tracking-[-0.01em]">{i.aircraftName}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3"><Flag code={i.countryCode} /><span className="truncate">{i.airlineName ?? t("Unknown airline")}</span></div>
                  {i.registration && <Reg className="mt-2 inline-block">{i.registration}</Reg>}
                </div>
              </Link>
            </li>
          ))}
          {loading && Array.from({ length: 6 }, (_, n) => <li key={n} className="w-[220px] shrink-0 md:w-auto"><div className="skeleton aspect-[4/5] rounded-3xl" /></li>)}
        </ul>
      </section>
    </>
  );
}

/** Count per scale under the total; each one opens the collection filtered to that scale. */
function ScaleBreakdown({ scales, total, className }: { scales: { label: string; count: number }[]; total: number; className?: string }) {
  const { t, number } = useI18n();
  const without = total - scales.reduce((s, b) => s + b.count, 0);
  const chip = "inline-flex items-baseline gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--c1)_12%,transparent)] px-2.5 py-1 text-[12px]";
  return (
    <ul aria-label={t("Collection by Scale")} className={cx("mt-3 flex max-w-[420px] flex-wrap gap-1.5", className)}>
      {scales.map((s) => (
        <li key={s.label}>
          <Link href={`/collection?scale=${encodeURIComponent(s.label)}`} className={cx(chip, "transition-colors hover:bg-[color-mix(in_oklab,var(--c1)_22%,transparent)]")}>
            <span className="font-semibold text-ink-2">{s.label}</span>
            <span className="num font-bold">{number(s.count)}</span>
          </Link>
        </li>
      ))}
      {without > 0 && (
        <li className={chip}>
          <span className="text-ink-3">{t("No scale")}</span>
          <span className="num font-bold">{number(without)}</span>
        </li>
      )}
    </ul>
  );
}

function StatTile({ label, value, sub, loading, icon, color, spark }: { label: string; value: ReactNode; sub?: string; loading?: boolean; icon: ReactNode; color: string; spark?: number[] }) {
  return (
    <div className="card lift relative flex min-w-0 flex-col overflow-hidden p-5" style={{ ["--tile" as string]: color }}>
      <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full opacity-20 blur-2xl" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-2xl text-white shadow-[0_8px_18px_-8px_var(--tile)] [&_svg]:size-5" style={{ background: color }}>{icon}</span>
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      </div>
      {loading ? <div className="skeleton mt-5 h-9 w-32 rounded-lg" /> : <div className="num mt-4 truncate text-[30px] leading-none font-extrabold tracking-[-0.035em]">{value}</div>}
      {sub && !loading && <div className="mt-2 truncate text-[12.5px] text-ink-3">{sub}</div>}      {spark && spark.length > 1 && <Sparkline values={spark} className="mt-auto -mx-5 -mb-5 h-12 w-[calc(100%+2.5rem)] pt-3 text-[var(--tile)]" />}
    </div>
  );
}

const BODY_LABEL: Record<string, string> = {
  narrow: "Narrowbody", wide: "Twin-engine widebody", wide4: "Four-engine widebody", jumbo: "Jumbo jet", a380: "Double-decker",
  trijet: "Trijet", tailjet: "Rear-engine jet", regional: "Regional jet", prop: "Propeller", concorde: "Supersonic",
};

export function Insights() {
  const { t, money, month, number, country } = useI18n();
  const { user, types, rates } = useApp();
  const owned = useOwned();
  const s = useStats();
  const base = user.baseCurrency;

  const extra = useMemo(() => {
    if (!owned) return null;
    const shapes = new Map<string, number>();
    for (const i of owned) {
      const sh = (i.aircraftTypeId && types.get(i.aircraftTypeId)?.shape) || "unknown";
      shapes.set(sh, (shapes.get(sh) ?? 0) + 1);
    }
    let up = 0, down = 0, flat = 0;
    const valued: { item: Item; cents: number }[] = [];
    // Price bands in the base currency (upper bound in whole units).
    const bands = [10, 20, 30, 50, 75, 100, Infinity].map((max) => ({ max, count: 0 }));
    for (const i of owned) {
      if (i.purchasePriceCents !== null) {
        const p = convert(i.purchasePriceCents, i.purchaseCurrency ?? base, base, rates);
        if (p !== null) bands.find((b) => p / 100 < b.max)!.count++;
      }
      const c = valueChange(i, base, rates);
      if (c) (c.absolute > 0 ? up++ : c.absolute < 0 ? down++ : flat++);
      if (i.valueCents !== null) {
        const v = convert(i.valueCents, i.valueCurrency ?? base, base, rates);
        if (v !== null) valued.push({ item: i, cents: v });
      }
    }
    return {
      shapes: [...shapes].filter(([k]) => k !== "unknown").sort((a, b) => b[1] - a[1]),
      up, down, flat, bands,
      top5: valued.sort((a, b) => b.cents - a.cents).slice(0, 5),
    };
  }, [owned, types, base, rates]);

  if (!s || !extra || !owned) return <div className="skeleton h-80 rounded-3xl" />;
  if (s.total === 0) return <><PageHeader title={t("Insights")} /><div className="card"><EmptyState title={t("Nothing to analyse yet")} body={t("Insights are calculated only from your own models.")} /></div></>;

  const label = (i: Item) => [i.airlineName, i.aircraftName].filter(Boolean).join(" · ");
  const top = s.airlines[0];
  const topItems = top ? owned.filter((i) => i.airlineName === top.label) : [];
  const topCountry = topItems.find((i) => i.countryCode)?.countryCode;
  const fam = s.families[0];
  const rare = s.aircraftTypes.filter((a) => a.count === 1);
  const months = s.growth.slice(-18);
  const maxAdded = Math.max(1, ...months.map((g) => g.added));
  // With little purchase history a timeline is one bar; then the price bands say more.
  const showTimeline = months.filter((g) => g.added > 0).length >= 4 && maxAdded / s.total < 0.6;
  const maxBand = Math.max(1, ...extra.bands.map((b) => b.count));
  const bandLabel = (n: number) => {
    const lo = n ? extra.bands[n - 1].max : 0, hi = extra.bands[n].max;
    return hi === Infinity ? `${lo}+` : `${lo}–${hi}`;
  };
  const totalShapes = extra.shapes.reduce((n, [, c]) => n + c, 0) || 1;
  const valuedTotal = extra.up + extra.down + extra.flat;

  return (
    <>
      <PageHeader title={t("Insights")} eyebrow={t("From your own data")} />

      {/* Headline figures on a colour band. */}
      <section className="grad relative mb-5 overflow-hidden rounded-[28px] p-6 text-white shadow-[var(--shadow)] md:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-80 rounded-full bg-white/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute right-6 bottom-0 w-[340px] max-w-[45%] text-white/15 max-md:hidden"><Silhouette shape="jumbo" /></div>
        <dl className="relative grid grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { k: t("Models"), v: s.total, icon: <Plane /> },
            { k: t("Airlines"), v: s.airlines.length, icon: <Building2 /> },
            { k: t("Countries"), v: s.countries.length, icon: <Earth /> },
            { k: t("Aircraft types"), v: s.aircraftTypes.length, icon: <Layers /> },
          ].map((f) => (
            <div key={f.k}>
              <dt className="flex items-center gap-2 text-[13px] font-semibold text-white/80 [&_svg]:size-4">{f.icon}{f.k}</dt>
              <dd className="num mt-1 text-[44px] leading-none font-extrabold tracking-[-0.04em] md:text-[56px]">{number(f.v)}</dd>
            </div>
          ))}
        </dl>
        <div className="relative mt-6 flex flex-wrap gap-2 text-[13px] font-semibold">
          {s.valuedCount > 0 && <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{t("Collection Value")}: {money(s.value, base)}</span>}
          {s.pricedCount > 0 && <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{t("Total Spent")}: {money(s.spent, base)}</span>}
          {s.pricedCount > 0 && <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{t("Average price")}: {money(Math.round(s.spent / s.pricedCount), base)}</span>}
          <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{t("Special Liveries")}: {number(s.special)}</span>
        </div>
      </section>

      {/* Records, each with the model's picture. */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {s.mostValuable && <PhotoFact icon={<Trophy />} k={t("Most Expensive Aircraft")} item={s.mostValuable.item} v={label(s.mostValuable.item)} sub={money(s.mostValuable.cents, base)} />}
        {s.biggestGain && <PhotoFact icon={<TrendingUp />} k={t("Biggest Value Increase")} item={s.biggestGain.item} v={label(s.biggestGain.item)} sub={`+${money(s.biggestGain.absolute, base)}${s.biggestGain.percent !== null ? ` (+${number(s.biggestGain.percent, 0)}%)` : ""}`} />}
        {s.newest && <PhotoFact icon={<Sparkles />} k={t("Newest Addition")} item={s.newest} v={label(s.newest)} sub={s.newest.registration ?? undefined} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Favourite airline as a photo collage. */}
        {top && (
          <Link href={`/collection?q=${encodeURIComponent(top.label)}`} className="card lift group flex flex-col overflow-hidden p-2 lg:col-span-2">
            <div className="grid h-56 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-[18px] md:h-64">
              {topItems.slice(0, 5).map((i, n) => (
                <ModelImage key={i.id} item={i} className={cx("size-full rounded-xl object-cover!", n === 0 ? "col-span-2 row-span-2" : "")} />
              ))}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3 px-3 pt-4 pb-2">
              <div>
                <div className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{t("Most Collected Airline")}</div>
                <div className="mt-1 flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.03em]"><Flag code={topCountry} className="h-4 w-6" />{top.label}</div>
              </div>
              <div className="text-right">
                <div className="num grad-text text-[40px] leading-none font-extrabold tracking-[-0.04em]">{top.count}</div>
                <div className="text-[12px] font-semibold text-ink-3">{t("{p}% of the collection", { p: number((top.count / s.total) * 100, 0) })}</div>
              </div>
            </div>
          </Link>
        )}

        {/* Favourite family. */}
        {fam && (
          <div className="card relative flex flex-col justify-between overflow-hidden p-5">
            <div className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{t("Favorite Aircraft Family")}</div>
            <div className="my-4 text-[var(--c1)]"><Silhouette shape={owned.find((i) => aircraftFamilyOf(i, types) === fam.label && i.aircraftTypeId)?.aircraftTypeId ? types.get(owned.find((i) => aircraftFamilyOf(i, types) === fam.label && i.aircraftTypeId)!.aircraftTypeId!)?.shape : "wide"} className="mx-auto w-[85%]" /></div>
            <div>
              <div className="text-[24px] font-extrabold tracking-[-0.03em]">{fam.label}</div>
              <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-2"><span className="num rounded-full bg-accent-soft px-2.5 py-0.5 font-bold text-accent">{fam.count}</span> {t("models")}</div>
            </div>
          </div>
        )}

        {/* Body types with their silhouettes. */}
        <Panel title={t("By body type")} icon={<Plane />} className="lg:col-span-2">
          <ul className="grid grid-cols-2 gap-3 p-5 pt-3 sm:grid-cols-3 xl:grid-cols-5">
            {extra.shapes.map(([shape, c], n) => (
              <li key={shape} className="rounded-2xl bg-surface-2 p-3">
                <div className="h-12" style={{ color: PALETTE[n % PALETTE.length] }}><Silhouette shape={shape} className="mx-auto h-full w-auto" /></div>
                <div className="mt-2 truncate text-[12.5px] font-semibold">{t(BODY_LABEL[shape] ?? shape)}</div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span className="num text-[20px] font-extrabold tracking-[-0.03em]">{c}</span>
                  <span className="num text-[12px] text-ink-3">{number((c / totalShapes) * 100, 0)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface"><div className="h-full rounded-full" style={{ width: `${(c / extra.shapes[0][1]) * 100}%`, background: PALETTE[n % PALETTE.length] }} /></div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Winners and losers. */}
        <Panel title={t("Value development")} icon={<TrendingUp />}>
          {valuedTotal ? (
            <div className="p-5 pt-3">
              <div className="flex h-4 overflow-hidden rounded-full">
                <div className="bg-[var(--c3)]" style={{ width: `${(extra.up / valuedTotal) * 100}%` }} />
                <div className="bg-line-strong" style={{ width: `${(extra.flat / valuedTotal) * 100}%` }} />
                <div className="bg-[var(--c5)]" style={{ width: `${(extra.down / valuedTotal) * 100}%` }} />
              </div>
              <ul className="mt-4 space-y-2 text-[13px]">
                {[
                  { k: t("Gained value"), v: extra.up, c: "var(--c3)", icon: <TrendingUp className="size-4" /> },
                  { k: t("Unchanged"), v: extra.flat, c: "var(--line-strong)", icon: <Minus className="size-4" /> },
                  { k: t("Lost value"), v: extra.down, c: "var(--c5)", icon: <TrendingDown className="size-4" /> },
                ].map((r) => (
                  <li key={r.k} className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-xl text-white" style={{ background: r.c }}>{r.icon}</span>
                    <span className="flex-1 font-semibold">{r.k}</span>
                    <span className="num font-bold">{r.v}</span>
                  </li>
                ))}
              </ul>
              {s.change !== null && <div className="mt-4 rounded-2xl bg-surface-2 p-3 text-[13px]"><span className="text-ink-2">{t("Value Change")}: </span><span className="font-bold"><ChangeStat change={s.change} percent={s.changePercent} money={(c) => money(c, base)} /></span></div>}
            </div>
          ) : <p className="px-5 py-6 text-[13px] text-ink-3">{t("Needs a price and a value")}</p>}
        </Panel>

        {/* Additions per month as columns. */}
        {showTimeline ? (
        <Panel title={t("Collection Timeline")} icon={<CalendarDays />} className="lg:col-span-2">
          <div className="px-5 pt-4 pb-5">
            <div className="flex h-44 items-end gap-1.5">
              {months.map((g) => (
                <div key={g.month} className="group relative flex h-full flex-1 flex-col justify-end" title={`${month(g.month)}: ${g.added}`}>
                  <span className="num pointer-events-none absolute inset-x-0 -top-1 text-center text-[11px] font-bold text-ink-2 opacity-0 transition-opacity group-hover:opacity-100">{g.added}</span>
                  <div className="grad min-h-1 rounded-t-lg rounded-b-sm transition-[filter] group-hover:brightness-110" style={{ height: `${(g.added / maxAdded) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11.5px] font-medium text-ink-3">
              <span>{months[0] && month(months[0].month)}</span>
              <span>{months.length > 1 && month(months[months.length - 1].month)}</span>
            </div>
          </div>
        </Panel>
        ) : (
        <Panel title={t("Price ranges")} icon={<Wallet />} className="lg:col-span-2" aside={<span className="text-[11.5px] text-ink-3">{t("Purchase price")} · {base}</span>}>
          <div className="px-5 pt-6 pb-5">
            <div className="flex h-48 items-end gap-3">
              {extra.bands.map((b, n) => (
                <div key={n} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${bandLabel(n)}: ${b.count}`}>
                  <span className="num text-[13px] font-extrabold">{b.count}</span>
                  <div className="w-full min-h-1 rounded-t-xl rounded-b-sm transition-[filter] group-hover:brightness-110" style={{ height: `${(b.count / maxBand) * 100}%`, background: PALETTE[n % PALETTE.length] }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-3">
              {extra.bands.map((b, n) => <span key={n} className="num flex-1 text-center text-[11.5px] font-semibold text-ink-3">{bandLabel(n)}</span>)}
            </div>
          </div>
        </Panel>
        )}

        {/* Most valuable five. */}
        <Panel title={t("Top 5 by value")} icon={<Trophy />}>
          {extra.top5.length ? (
            <ol className="space-y-1 p-3 pt-2">
              {extra.top5.map(({ item, cents }, n) => (
                <li key={item.id}>
                  <Link href={`/collection/${item.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-surface-2">
                    <span className={cx("num grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-extrabold", n === 0 ? "bg-flap text-[#1a1305]" : "bg-surface-2 text-ink-2")}>{n + 1}</span>
                    <ModelImage item={item} className="h-11 w-16 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold">{item.aircraftName}</span>
                      <span className="block truncate text-[12px] text-ink-3">{item.airlineName}</span>
                    </span>
                    <span className="num shrink-0 text-[13px] font-bold">{money(cents, base)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : <p className="px-5 py-6 text-[13px] text-ink-3">{t("Market value not available")}</p>}
        </Panel>

        {/* Countries as a wall of flags. */}
        <Panel title={t("Countries")} icon={<Earth />} className="lg:col-span-2" aside={<Link href="/map" className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-semibold text-accent hover:bg-accent-soft">{t("World Map")} <ArrowRight className="size-3.5" /></Link>}>
          <ul className="grid grid-cols-2 gap-2 p-5 pt-3 sm:grid-cols-3 xl:grid-cols-4">
            {s.countries.slice(0, 16).map((c) => (
              <li key={c.label} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
                <Flag code={c.label} className="h-5 w-7 shrink-0 rounded-[3px]" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{country(c.label)}</span>
                <span className="num text-[13px] font-extrabold text-accent">{c.count}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("Aircraft Families")} icon={<PieChart />}><Donut data={s.families} limit={6} centerLabel={t("Models")} /></Panel>
        <Panel title={t("Collection by Model Manufacturer")} icon={<Building2 />}><BarList data={s.makers} limit={6} /></Panel>
        <Panel title={t("Collection by Airline")} icon={<Plane />}><BarList data={s.airlines} limit={6} /></Panel>

        <Panel title={t("Rare Aircraft Types")} icon={<Gem />} aside={<span className="text-[11.5px] text-ink-3">{t("exactly one in your collection")}</span>}>
          {rare.length ? (
            <ul className="flex flex-wrap gap-2 p-5 pt-3">
              {rare.slice(0, 18).map((r) => <li key={r.label} className="rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-semibold text-accent">{r.label}</li>)}
              {rare.length > 18 && <li className="rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-3">+{rare.length - 18}</li>}
            </ul>
          ) : <p className="px-5 py-6 text-[13px] text-ink-3">{t("Every type appears more than once.")}</p>}
        </Panel>
      </div>
    </>
  );
}

function PhotoFact({ k, v, sub, item, icon }: { k: string; v: string; sub?: string; item: Item; icon: ReactNode }) {
  return (
    <Link href={`/collection/${item.id}`} className="group relative isolate block overflow-hidden rounded-[24px] bg-board text-white shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow)]">
      <ModelImage item={item} size="full" className="aspect-[16/10] w-full object-cover! transition-transform duration-700 group-hover:scale-[1.05]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[11.5px] font-semibold backdrop-blur [&_svg]:size-3.5 [&_svg]:text-flap">{icon}{k}</span>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="truncate text-[17px] font-extrabold tracking-[-0.02em]">{v}</div>
        {sub && <div className="num mt-0.5 truncate text-[14px] font-bold text-flap">{sub}</div>}
      </div>
    </Link>
  );
}

const PRIORITY: Record<number, string> = { 1: "High", 2: "Medium", 3: "Low" };

export function Wishlist() {
  const { t, money, date } = useI18n();
  const { items, openAdd, patch, remove, toast } = useApp();
  const [tab, setTab] = useState<"all" | "wishlist" | "ordered" | "preordered">("all");
  const list = useMemo(() => {
    const open = (items ?? []).filter((i) => ["wishlist", "ordered", "preordered"].includes(i.status));
    const shown = tab === "all" ? open : open.filter((i) => i.status === tab);
    return [...shown].sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || b.createdAt.localeCompare(a.createdAt));
  }, [items, tab]);

  const promote = async (i: Item) => {
    try {
      await patch(i.id, { status: "collection", purchaseDate: i.purchaseDate ?? new Date().toLocaleDateString("sv"), purchasePriceCents: i.purchasePriceCents ?? i.desiredPriceCents ?? null, purchaseCurrency: i.purchaseCurrency ?? i.desiredCurrency ?? null });
      toast(t("Moved to your collection"), { action: { label: t("Undo"), run: () => patch(i.id, { status: i.status, purchaseDate: i.purchaseDate, purchasePriceCents: i.purchasePriceCents, purchaseCurrency: i.purchaseCurrency }) } });
    } catch {
      toast(t("Could not save. Please try again."), { tone: "error" });
    }
  };

  return (
    <>
      <PageHeader title={t("Wishlist")}>
        <Button variant="primary" onClick={() => openAdd({ status: "wishlist", aircraftName: "", modelManufacturerName: "" })}><Plus className="size-4" /> {t("Add to Wishlist")}</Button>
      </PageHeader>
      <div role="tablist" className="no-scrollbar mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
        {(["all", "wishlist", "ordered", "preordered"] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-colors max-md:h-10", tab === k ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-2 hover:text-ink")}>{k === "all" ? t("All") : t(STATUS_LABEL[k])}</button>
        ))}
      </div>
      {items === null ? <div className="skeleton h-64 rounded-lg" /> : list.length === 0 ? (
        <div className="card"><EmptyState icon={<Heart className="size-8 text-ink-3" strokeWidth={1.25} />} title={t("Nothing on your wishlist")} body={t("Keep track of models you want, have ordered or pre-ordered.")} /></div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((i) => (
            <li key={i.id} className="card lift flex flex-col overflow-hidden p-2">
              <Link href={`/collection/${i.id}`} className="flex min-w-0 flex-1 flex-col">
                <span className="relative block overflow-hidden rounded-[18px]">
                  <ModelImage item={i} className="aspect-[16/9] w-full" />
                  <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{t(STATUS_LABEL[i.status])}</span>
                </span>
                <span className="block min-w-0 px-3 pt-3">
                  <span className="block truncate text-[15px] font-bold tracking-[-0.01em]">{[i.airlineName, i.aircraftName].filter(Boolean).join(" · ")}</span>
                  <span className="block truncate text-[12.5px] text-ink-2">{[i.modelManufacturerName, i.scale, i.registration, i.dealer].filter(Boolean).join(" · ")}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-ink-3">
                    <span>{t(STATUS_LABEL[i.status])}</span>
                    {i.priority && <span>{t("Priority")}: {t(PRIORITY[i.priority])}</span>}
                    {i.desiredPriceCents !== null && <span className="num">{t("Desired Price")}: {money(i.desiredPriceCents, i.desiredCurrency ?? "EUR")}</span>}
                    {i.expectedRelease && <span>{t("Expected Release")}: {date(i.expectedRelease)}</span>}
                  </span>
                </span>
              </Link>
              <div className="flex gap-1.5 p-3 pt-4">
                <Button size="sm" variant="primary" className="flex-1 max-sm:h-10" onClick={() => promote(i)}>{t("Move to Collection")} <ArrowRight className="size-3.5" /></Button>
                <Button size="sm" variant="ghost" className="max-sm:h-10" onClick={() => remove([i.id])}>{t("Remove")}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function Explore() {
  const { t } = useI18n();
  const { openAdd, types, ref, toast } = useApp();
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ releases: ReleaseRef[]; isAdmin: boolean; canManage?: boolean } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    const h = setTimeout(() => {
      fetch(`/api/catalog?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json()).then(setData).catch(() => {});
    }, 200);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [q, nonce]);

  const moderate = async (id: string, action: "verify" | "reject") => {
    try {
      await api(`/api/catalog/${id}`, { json: { action } });
      setNonce((n) => n + 1);
    } catch {
      toast(t("Could not save. Please try again."), { tone: "error" });
    }
  };
  const removeOne = async (id: string) => {
    try {
      await api(`/api/catalog/${id}`, { method: "DELETE" });
      setData((d) => d && { ...d, releases: d.releases.filter((r) => r.id !== id) });
      toast(t("Removed from the catalog"));
    } catch {
      toast(t("Could not delete. Please try again."), { tone: "error" });
    }
  };
  const clearAll = async () => {
    try {
      const { count } = await api<{ count: number }>("/api/catalog", { method: "DELETE" });
      setConfirmClear(false);
      setQ("");
      setNonce((n) => n + 1);
      toast(t("{n} catalog entries removed", { n: count }));
    } catch {
      toast(t("Could not delete. Please try again."), { tone: "error" });
    }
  };
  const report = async (id: string) => {
    const message = window.prompt(t("What is wrong with this entry?"));
    if (!message) return;
    await api("/api/catalog", { method: "PUT", json: { releaseId: id, message } }).then(() => toast(t("Thanks. Your report was recorded."))).catch(() => toast(t("Could not save. Please try again."), { tone: "error" }));
  };

  return (
    <>
      <PageHeader title={t("Explore")} eyebrow={t("Global model catalog")}>
        {!!data?.releases.length && <Button variant="danger" onClick={() => setConfirmClear(true)}><Trash2 className="size-4" /> {t("Clear catalog")}</Button>}
      </PageHeader>
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} label={t("Clear catalog")}>
        <div className="p-6">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">{t("Clear the catalog?")}</h2>
          <p className="mt-2 text-[13.5px] text-ink-2">{t("All entries on this page are removed. The models in your collection stay exactly as they are.")}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>{t("Cancel")}</Button>
            <Button variant="danger" onClick={clearAll}><Trash2 className="size-4" /> {t("Clear catalog")}</Button>
          </div>
        </div>
      </Dialog>
      <div className="relative mb-6 max-w-xl">
        <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
        <Input aria-label={t("Search the catalog")} className="h-12 rounded-full pl-11 text-[15px]" placeholder={t("Search the catalog")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!data ? <div className="skeleton h-64 rounded-lg" /> : data.releases.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Compass className="size-8 text-ink-3" strokeWidth={1.25} />} title={q ? t("No catalog entries for this search") : t("The catalog has no entries yet")}
            body={t("Entries appear here only after they have been verified, so nothing in the catalog is guessed. You can suggest any model from its detail page.")} />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.releases.map((r) => (
            <li key={r.id} className="card lift flex flex-col overflow-hidden p-2">
              <ImageOrSilhouette imageId={r.imageId} registration={r.registration} shape={r.aircraftTypeId ? types.get(r.aircraftTypeId)?.shape : undefined} className="aspect-[16/9] w-full rounded-[18px]" />
              <div className="min-w-0 flex-1 px-3 pt-3">
                <div className="truncate text-[15px] font-bold tracking-[-0.01em]">{[r.airlineName, r.aircraftName].filter(Boolean).join(" · ")}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-2">
                  {r.registration && <Reg>{r.registration}</Reg>}
                  <span>{[r.modelManufacturerName, r.scale, r.itemNumber].filter(Boolean).join(" · ")}</span>
                  {r.liveryName && <span className="text-accent">{r.liveryName}</span>}
                  {r.liveryCategory && !r.liveryName && r.liveryCategory !== "standard" && <span className="text-accent">{t(LIVERY_LABEL[r.liveryCategory])}</span>}
                </div>
                <div className="mt-0.5 text-[11.5px]">
                  {r.status === "verified" ? <span className="inline-flex items-center gap-1 text-pos"><BadgeCheck className="size-3" />{t("Verified")}</span> : <span className="inline-flex items-center gap-1 text-signal"><CircleHelp className="size-3" />{t("Unverified")}</span>}
                  {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener" className="ml-2 text-ink-3 underline">{t("Source")}</a>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 p-3 pt-4">
                {data.isAdmin && r.status === "unverified" && <><Button size="sm" onClick={() => moderate(r.id, "verify")}>{t("Verify")}</Button><Button size="sm" variant="ghost" onClick={() => moderate(r.id, "reject")}>{t("Reject")}</Button></>}
                <Button size="sm" variant="ghost" onClick={() => report(r.id)}>{t("Report")}</Button>
                {(data.canManage || r.status === "unverified") && <Button size="sm" variant="ghost" aria-label={t("Remove")} title={t("Remove")} onClick={() => removeOne(r.id)}><Trash2 className="size-3.5" /></Button>}
                <Button size="sm" variant="primary" onClick={() => openAdd({ releaseId: r.id, airlineId: r.airlineId, airlineName: r.airlineName, aircraftTypeId: r.aircraftTypeId, aircraftName: r.aircraftName, modelManufacturerName: r.modelManufacturerName, scale: r.scale, registration: r.registration, itemNumber: r.itemNumber, liveryCategory: r.liveryCategory, liveryName: r.liveryName, countryCode: ref?.airlines.find((a) => a.id === r.airlineId)?.country ?? null })}>
                  <Plus className="size-3.5" /> {t("Add")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

void formFromItem;

/** Every airline in the collection as a card: pictures, flag, count and the types flown. */
export function Airlines() {
  const { t, number, money, country } = useI18n();
  const { user, rates } = useApp();
  const owned = useOwned();
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"count" | "name" | "country">("count");
  const base = user.baseCurrency;

  const airlines = useMemo(() => {
    if (!owned) return null;
    const m = new Map<string, Item[]>();
    for (const i of owned) {
      const k = i.airlineName ?? t("Unknown airline");
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m].map(([name, list]) => {
      const types = new Map<string, number>();
      let value = 0;
      for (const i of list) {
        types.set(i.aircraftName, (types.get(i.aircraftName) ?? 0) + 1);
        if (i.valueCents !== null) value += convert(i.valueCents, i.valueCurrency ?? base, base, rates) ?? 0;
      }
      return {
        name, list, value,
        countryCode: list.find((i) => i.countryCode)?.countryCode ?? null,
        // Pictures first, so the collage shows real models where there are any.
        pics: [...list].sort((a, b) => Number(!!b.imageId) - Number(!!a.imageId)).slice(0, 3),
        types: [...types].sort((a, b) => b[1] - a[1]),
      };
    });
  }, [owned, base, rates, t]);

  const shown = useMemo(() => {
    if (!airlines) return [];
    const needle = q.trim().toLowerCase();
    const list = needle ? airlines.filter((a) => a.name.toLowerCase().includes(needle) || (a.countryCode && country(a.countryCode).toLowerCase().includes(needle))) : airlines;
    return [...list].sort((a, b) =>
      order === "name" ? a.name.localeCompare(b.name)
        : order === "country" ? (a.countryCode ? country(a.countryCode) : "~").localeCompare(b.countryCode ? country(b.countryCode) : "~") || b.list.length - a.list.length
          : b.list.length - a.list.length || a.name.localeCompare(b.name));
  }, [airlines, q, order, country]);

  if (!airlines) return <div className="skeleton h-80 rounded-3xl" />;

  return (
    <>
      <PageHeader title={t("Airlines")} eyebrow={t("{n} airlines", { n: airlines.length })} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
          <Input aria-label={t("Search airlines")} placeholder={t("Search airlines")} className="h-12 rounded-full pl-11 text-[15px]" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <AirlineCleanup />
        <div role="group" aria-label={t("Sort by")} className="inline-flex rounded-full bg-surface-2 p-1">
          {([["count", t("Most models")], ["name", t("A–Z")], ["country", t("Country")]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={order === k} onClick={() => setOrder(k)} className={cx("h-10 rounded-full px-4 text-[13px] font-semibold transition-colors", order === k ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-2 hover:text-ink")}>{l}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card"><EmptyState title={t("No airlines match this search")} /></div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((a) => (
            <li key={a.name}>
              <Link href={`/collection?airline=${encodeURIComponent(a.name)}`} className="card lift group flex h-full flex-col overflow-hidden p-2">
                <div className="grid h-40 grid-cols-3 grid-rows-2 gap-1.5 overflow-hidden rounded-[18px]">
                  {a.pics.map((i, n) => (
                    <ModelImage key={i.id} item={i} className={cx("size-full rounded-lg object-cover! transition-transform duration-500 group-hover:scale-[1.03]", n === 0 ? (a.pics.length === 1 ? "col-span-3 row-span-2" : "col-span-2 row-span-2") : a.pics.length === 2 ? "row-span-2" : "")} />
                  ))}
                </div>
                <div className="flex flex-1 flex-col px-3 pt-3.5 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.02em]"><Flag code={a.countryCode} className="h-3.5 w-5 shrink-0" /><span className="truncate">{a.name}</span></div>
                      <div className="mt-0.5 truncate text-[12px] text-ink-3">{a.countryCode ? country(a.countryCode) : "—"}{a.value > 0 && ` · ${money(a.value, base)}`}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num grad-text text-[30px] leading-none font-extrabold tracking-[-0.04em]">{number(a.list.length)}</div>
                      <div className="text-[11px] font-semibold text-ink-3">{a.list.length === 1 ? t("Model") : t("Models")}</div>
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {a.types.slice(0, 4).map(([ty, c]) => (
                      <li key={ty} className="max-w-full truncate rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-2">{ty.replace(/^(Airbus|Boeing|McDonnell Douglas) /, "")}{c > 1 && <span className="text-accent"> ×{c}</span>}</li>
                    ))}
                    {a.types.length > 4 && <li className="rounded-full px-1.5 py-1 text-[11.5px] font-semibold text-ink-3">+{a.types.length - 4}</li>}
                  </ul>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
