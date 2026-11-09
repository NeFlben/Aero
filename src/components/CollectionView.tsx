"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Columns3, Download, Filter, LayoutGrid, Plus, Rows3, ScanBarcode, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SCALES } from "@/data/reference";
import { useI18n } from "@/lib/i18n";
import { activeFilterCount, aircraftFamilyOf, aircraftManufacturerOf, applyFilters, emptyFilters, isSpecialLivery, searchItems, sortItems, type Filters, type SortKey } from "@/lib/search";
import { formatRegistration, normalizeScale } from "@/lib/smart";
import { parseMoney, valueChange } from "@/lib/stats";
import { CONDITIONS, LIVERY_CATEGORIES, type Currency, type Item, type ItemInput, type ItemStatus, type LiveryCategory } from "@/lib/types";
import { ApiError, useApp } from "./AppProvider";
import { BarcodeScanner, cameraAvailable } from "./BarcodeScanner";
import { CONDITION_LABEL, LIVERY_LABEL, STATUS_LABEL } from "./ItemForm";
import { ModelImage } from "./ModelImage";
import { PickerButton } from "./Picker";
import { Silhouette } from "./Silhouette";
import { Button, Checkbox, cx, Dialog, EmptyState, Field, Flag, IconClose, Input, MultiChips, PageHeader, Reg, Select } from "./ui";

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1100);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width: w };
}

export function CollectionView() {
  const { t } = useI18n();
  const { items, loadError, reload, index, ref, types, openAdd, user } = useApp();
  const params = useSearchParams();
  const router = useRouter();

  const [statusTab, setStatusTab] = useState<ItemStatus>("collection");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHasCamera(cameraAvailable()), []);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "added", dir: "desc" });
  const [view, setView] = useState<"grid" | "table">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const pendingScroll = useRef<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(load("hangar:view", window.innerWidth < 768 ? "grid" : "grid"));
    setSort(load("hangar:sort", { key: "added" as SortKey, dir: "desc" as const }));
    const q0 = params.get("q");
    if (q0) setQ(q0);
    const country = params.get("country");
    const scale = params.get("scale");
    const airline = params.get("airline");
    if (country || scale || airline) setFilters({ ...emptyFilters(), country: country ? [country] : [], scale: scale ? [scale] : [], airline: airline ? [airline] : [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    if (!items) return [];
    const searched = q.trim() ? searchItems(index, q) : items;
    const filtered = applyFilters(searched.filter((i) => i.status === statusTab), filters, types);
    // A search ranks by relevance until the user picks a sort column.
    return q.trim() && sort.key === "added" ? filtered : sortItems(filtered, sort.key, sort.dir, types);
  }, [items, index, q, filters, types, sort, statusTab]);

  /** Makes sure the model is in the list (clearing search + filters only if needed) and marks it. */
  const highlightItem = useCallback((id: string) => {
    const it = items?.find((i) => i.id === id);
    if (!it) return;
    setStatusTab(it.status);
    if (!visible.some((v) => v.id === id)) {
      setQ("");
      setFilters(emptyFilters());
    }
    pendingScroll.current = id;
    // Release first, so picking the same model again restarts the marker and the 4.6 s timer.
    setHighlight(null);
    requestAnimationFrame(() => setHighlight(id));
  }, [items, visible]);

  const urlHighlight = params.get("highlight");
  useEffect(() => {
    if (urlHighlight && items) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      highlightItem(urlHighlight);
      router.replace("/collection", { scroll: false });
    }
  }, [urlHighlight, items, highlightItem, router]);

  useEffect(() => {
    if (!highlight) return;
    const h = setTimeout(() => setHighlight(null), 4600);
    return () => clearTimeout(h);
  }, [highlight]);

  const toggleSel = useCallback((id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);

  const count = activeFilterCount(filters);
  const setViewP = (v: "grid" | "table") => {
    setView(v);
    save("hangar:view", v);
  };
  const setSortP = (s: typeof sort) => {
    setSort(s);
    save("hangar:sort", s);
  };

  const options = useMemo(() => {
    const list = (items ?? []).filter((i) => i.status === statusTab);
    const uniq = (f: (i: Item) => string | null | undefined) => [...new Set(list.map(f).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
    return {
      airline: uniq((i) => i.airlineName), aircraft: uniq((i) => i.aircraftName), aircraftMaker: uniq((i) => aircraftManufacturerOf(i, types)),
      maker: uniq((i) => i.modelManufacturerName), scale: uniq((i) => i.scale), country: uniq((i) => i.countryCode),
    };
  }, [items, types, statusTab]);

  if (loadError) {
    return <EmptyState title={t("Could not load your collection")} body={t("Please check your connection and try again.")} action={<Button onClick={reload}>{t("Try again")}</Button>} />;
  }

  const empty = items !== null && !items.some((i) => i.status === "collection");

  return (
    <>
      <PageHeader title={t("My Collection")} eyebrow={items ? t("{n} models", { n: items.filter((i) => i.status === "collection").length }) : undefined}>
        <PickerButton currentFilters={visible} onHighlight={highlightItem} />
        <Button variant="primary" className="max-md:hidden" onClick={() => openAdd()}><Plus className="size-4" /> {t("Add Aircraft")}</Button>
      </PageHeader>

      {empty ? (
        <div className="card">
          <EmptyState
            icon={<Silhouette shape="wide" className="w-48 text-[var(--sil)]" />}
            title={t("Your hangar is empty")}
            body={t("Add your first model in a few seconds, or bring an existing collection along from a spreadsheet.")}
            action={<><Button variant="primary" onClick={() => openAdd()}><Plus className="size-4" /> {t("Add Aircraft")}</Button><Link href="/import"><Button>{t("Import a file")}</Button></Link></>}
          />
        </div>
      ) : (
        <>
          <div className="z-10 -mx-4 mb-3 flex flex-wrap items-center gap-2 px-4 py-2 md:sticky md:top-0 md:-mx-7 md:bg-bg/95 md:px-7 md:backdrop-blur">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
              <Input aria-label={t("Search your collection")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search your collection")} className={cx("pl-8", hasCamera && "pr-16")} />
              <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
                {q && <button type="button" aria-label={t("Clear")} onClick={() => setQ("")} className="grid size-8 place-items-center text-ink-3 hover:text-ink"><X className="size-3.5" /></button>}
                {hasCamera && <button type="button" aria-label={t("Scan barcode")} title={t("Scan barcode")} onClick={() => setScanOpen(true)} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:text-accent"><ScanBarcode className="size-4" /></button>}
              </span>
            </div>
            <Button aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
              <Filter className="size-4" /> {t("Filters")}
              {count > 0 && <span className="code ml-0.5 rounded-[3px] bg-accent px-1 text-[11px] text-on-accent">{count}</span>}
            </Button>
            <Select aria-label={t("Sort by")} className="w-[160px] max-sm:flex-1" value={`${sort.key}:${sort.dir}`} onChange={(e) => {
              const [key, dir] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
              setSortP({ key, dir });
            }}>
              <option value="added:desc">{t("Newest first")}</option>
              <option value="added:asc">{t("Oldest first")}</option>
              <option value="airline:asc">{t("Airline A–Z")}</option>
              <option value="aircraft:asc">{t("Aircraft A–Z")}</option>
              <option value="type:asc">{t("Aircraft type")}</option>
              <option value="value:desc">{t("Highest value")}</option>
              <option value="price:desc">{t("Highest price")}</option>
              <option value="date:desc">{t("Latest purchase")}</option>
              {!["added", "airline", "aircraft", "type", "value", "price", "date"].includes(sort.key) && <option value={`${sort.key}:${sort.dir}`}>{t("Custom column")}</option>}
            </Select>
            <div role="group" aria-label={t("View")} className="flex rounded-md border border-line-strong bg-surface">
              <button type="button" aria-label={t("Grid view")} aria-pressed={view === "grid"} onClick={() => setViewP("grid")} className={cx("grid h-[34px] w-9 place-items-center rounded-l-md max-md:h-[42px]", view === "grid" ? "bg-surface-2 text-ink" : "text-ink-3")}><LayoutGrid className="size-4" /></button>
              <button type="button" aria-label={t("Table view")} aria-pressed={view === "table"} onClick={() => setViewP("table")} className={cx("grid h-[34px] w-9 place-items-center rounded-r-md max-md:h-[42px]", view === "table" ? "bg-surface-2 text-ink" : "text-ink-3")}><Rows3 className="size-4" /></button>
            </div>
            <Button aria-label={t("Export")} onClick={() => setExportOpen(true)}><Download className="size-4" /></Button>
          </div>

          {showFilters && <FilterPanel filters={filters} setFilters={setFilters} options={options} statusTab={statusTab} setStatusTab={setStatusTab} />}

          {count > 0 && !showFilters && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {([...filters.airline, ...filters.aircraft, ...filters.aircraftMaker, ...filters.maker, ...filters.scale, ...filters.country] as string[]).map((c) => (
                <span key={c} className="rounded-[4px] bg-accent-soft px-2 py-0.5 text-[12px]">{c}</span>
              ))}
              <button type="button" onClick={() => setFilters(emptyFilters())} className="text-[12px] text-accent hover:underline">{t("Clear filters")}</button>
            </div>
          )}

          {selected.size > 0 && (
            <div className="fade-in z-10 mb-3 flex flex-wrap items-center max-lg:flex-nowrap gap-2 rounded-md bg-board px-3 py-2 text-board-ink max-lg:fixed max-lg:inset-x-3 max-lg:bottom-[calc(max(12px,env(safe-area-inset-bottom))+76px)] max-lg:z-30 max-lg:mx-auto max-lg:mb-0 max-lg:max-w-lg max-lg:rounded-2xl max-lg:shadow-[var(--shadow)] lg:sticky lg:top-14">
              <span className="code shrink-0 text-[12px] text-flap">{t("{n} selected", { n: selected.size })}</span>
              <button type="button" onClick={() => setSelected(new Set(visible.map((v) => v.id)))} className="min-w-0 truncate text-[12px] text-board-dim hover:text-board-ink">{t("Select all {n}", { n: visible.length })}</button>
              <span className="flex-1" />
              <Button size="sm" onClick={() => setBulkOpen(true)}>{t("Edit")}</Button>
              <BulkDelete ids={[...selected]} onDone={() => setSelected(new Set())} />
              <button type="button" aria-label={t("Clear selection")} onClick={() => setSelected(new Set())} className="grid size-8 shrink-0 place-items-center text-board-dim hover:text-board-ink"><X className="size-4" /></button>
            </div>
          )}

          {items === null || !ref ? (
            <GridSkeleton />
          ) : visible.length === 0 ? (
            <div className="card">
              <EmptyState title={t("No models match")} body={t("Try fewer filters or another spelling.")} action={<Button onClick={() => { setQ(""); setFilters(emptyFilters()); }}>{t("Clear filters")}</Button>} />
            </div>
          ) : view === "grid" ? (
            <GridView items={visible} selected={selected} toggle={toggleSel} highlight={highlight} pending={pendingScroll} base={user.baseCurrency} groupBy={q.trim() ? null : sort.key === "type" ? "type" : sort.key === "airline" ? "airline" : null} />
          ) : (
            <TableView items={visible} selected={selected} toggle={toggleSel} setSelected={setSelected} sort={sort} setSort={setSortP} highlight={highlight} pending={pendingScroll} />
          )}
        </>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onCode={(c) => { setScanOpen(false); setQ(c); }} />
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} label={t("Export")}>
        <ExportBody onClose={() => setExportOpen(false)} ids={selected.size ? [...selected] : null} />
      </Dialog>
      <Dialog open={bulkOpen} onClose={() => setBulkOpen(false)} label={t("Edit selected models")}>
        <BulkEdit ids={[...selected]} onClose={() => setBulkOpen(false)} />
      </Dialog>
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="card p-0">
          <div className="skeleton aspect-[16/9] rounded-t-lg" />
          <div className="space-y-2 p-3"><div className="skeleton h-3 w-1/2 rounded" /><div className="skeleton h-4 w-3/4 rounded" /><div className="skeleton h-3 w-2/3 rounded" /></div>
        </div>
      ))}
    </div>
  );
}

function FilterPanel({ filters, setFilters, options, statusTab, setStatusTab }: { filters: Filters; setFilters: (f: Filters) => void; options: Record<string, string[]>; statusTab: ItemStatus; setStatusTab: (s: ItemStatus) => void }) {
  const { t, country } = useI18n();
  const toggle = <K extends "airline" | "aircraft" | "aircraftMaker" | "maker" | "scale" | "country" | "livery" | "condition">(k: K, v: string) => {
    const cur = filters[k] as string[];
    setFilters({ ...filters, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-ink-2">{label}</div>
      {children}
    </div>
  );
  const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")) || 0);
  return (
    <section aria-label={t("Filters")} className="fade-in mb-4 grid gap-4 card p-4 md:grid-cols-2 xl:grid-cols-3">
      <Row label={t("Status")}>
        <MultiChips options={["collection", "sold"]} selected={[statusTab]} onToggle={(v) => setStatusTab(v as ItemStatus)} render={(v) => t(STATUS_LABEL[v])} />
      </Row>
      {options.scale.length > 0 && <Row label={t("Scale")}><MultiChips options={options.scale} selected={filters.scale} onToggle={(v) => toggle("scale", v)} /></Row>}
      {options.aircraftMaker.length > 0 && <Row label={t("Aircraft Manufacturer")}><MultiChips options={options.aircraftMaker} selected={filters.aircraftMaker} onToggle={(v) => toggle("aircraftMaker", v)} /></Row>}
      {options.maker.length > 0 && <Row label={t("Model Manufacturer")}><MultiChips options={options.maker} selected={filters.maker} onToggle={(v) => toggle("maker", v)} /></Row>}
      {options.airline.length > 0 && <Row label={t("Airline")}><div className="scroll-thin max-h-32 overflow-y-auto"><MultiChips options={options.airline} selected={filters.airline} onToggle={(v) => toggle("airline", v)} /></div></Row>}
      {options.aircraft.length > 0 && <Row label={t("Aircraft Type")}><div className="scroll-thin max-h-32 overflow-y-auto"><MultiChips options={options.aircraft} selected={filters.aircraft} onToggle={(v) => toggle("aircraft", v)} /></div></Row>}
      {options.country.length > 0 && <Row label={t("Country")}><div className="scroll-thin max-h-32 overflow-y-auto"><MultiChips options={options.country} selected={filters.country} onToggle={(v) => toggle("country", v)} render={(c) => <><Flag code={c} />{country(c)}</>} /></div></Row>}
      <Row label={t("Livery Type")}>
        <MultiChips options={[...LIVERY_CATEGORIES]} selected={filters.livery} onToggle={(v) => toggle("livery", v)} render={(v) => t(LIVERY_LABEL[v]).replace(/ (Livery|Lackierung)$/, "").replace(/lackierung$/, "")} />
        <label className="mt-2 flex items-center gap-2 text-[13px]"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={filters.specialOnly} onChange={(e) => setFilters({ ...filters, specialOnly: e.target.checked })} />{t("Only special liveries")}</label>
      </Row>
      <Row label={t("Condition")}>
        <MultiChips options={[...CONDITIONS]} selected={filters.condition} onToggle={(v) => toggle("condition", v)} render={(v) => t(CONDITION_LABEL[v])} />
      </Row>
      <Row label={t("Packaging and edition")}>
        <div className="flex flex-wrap gap-4 text-[13px]">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={filters.hasBox === true} onChange={(e) => setFilters({ ...filters, hasBox: e.target.checked ? true : null })} />{t("Original box")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={filters.limited === true} onChange={(e) => setFilters({ ...filters, limited: e.target.checked ? true : null })} />{t("Limited Edition")}</label>
        </div>
      </Row>
      <Row label={t("Purchase Price")}>
        <div className="flex items-center gap-2"><Input aria-label={t("Minimum")} inputMode="decimal" placeholder={t("Min")} value={filters.priceMin ?? ""} onChange={(e) => setFilters({ ...filters, priceMin: num(e.target.value) })} /><Input aria-label={t("Maximum")} inputMode="decimal" placeholder={t("Max")} value={filters.priceMax ?? ""} onChange={(e) => setFilters({ ...filters, priceMax: num(e.target.value) })} /></div>
      </Row>
      <Row label={t("Current Value")}>
        <div className="flex items-center gap-2"><Input aria-label={t("Minimum")} inputMode="decimal" placeholder={t("Min")} value={filters.valueMin ?? ""} onChange={(e) => setFilters({ ...filters, valueMin: num(e.target.value) })} /><Input aria-label={t("Maximum")} inputMode="decimal" placeholder={t("Max")} value={filters.valueMax ?? ""} onChange={(e) => setFilters({ ...filters, valueMax: num(e.target.value) })} /></div>
      </Row>
      <Row label={t("Purchase Date")}>
        <div className="flex items-center gap-2"><Input aria-label={t("From")} type="date" value={filters.dateFrom ?? ""} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value || null })} /><Input aria-label={t("To")} type="date" value={filters.dateTo ?? ""} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value || null })} /></div>
      </Row>
      <div className="flex items-end"><Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters())}>{t("Clear filters")}</Button></div>
    </section>
  );
}

/* ───────── Grid ───────── */

export function ModelCard({ item, selected, toggle, marked, share }: { item: Item; selected?: boolean; toggle?: (id: string) => void; marked?: boolean; share?: string }) {
  const { t, money, country } = useI18n();
  const special = isSpecialLivery(item);
  const liveryText = item.liveryName ?? (special ? t(LIVERY_LABEL[item.liveryCategory!]) : null);
  const body = (
    <>
      <div className="relative p-2 pb-0">
        <div className="overflow-hidden rounded-[18px]"><ModelImage item={item} share={share} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.06]" /></div>
        {special && liveryText && <span className="absolute bottom-3 left-4 max-w-[calc(100%-32px)] truncate rounded-full bg-gradient-to-r from-[var(--c6)] to-[var(--c5)] px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">✦ {liveryText}</span>}
        {item.scale && <span className="code absolute top-4 right-4 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur">{item.scale}</span>}
      </div>
      <div className="p-4 pt-3">
        <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <Flag code={item.countryCode} className="shrink-0" />
          <span className="truncate" title={item.countryCode ? country(item.countryCode) : undefined}>{item.airlineName ?? t("Unknown airline")}</span>
        </div>
        <div className="mt-1 truncate text-[16px] font-bold tracking-[-0.02em]">{item.aircraftName}</div>
        <div className="mt-1.5 flex items-center gap-2">
          {item.registration ? <Reg>{item.registration}</Reg> : <span className="text-[12px] text-ink-3">{t("No registration")}</span>}
        </div>
        {!special && liveryText && <div className="mt-1 truncate text-[12px] text-ink-2">{liveryText}</div>}
        <div className="mt-1.5 truncate text-[12px] text-ink-3">{item.modelManufacturerName}</div>
        {(item.purchasePriceCents !== null || item.valueCents !== null) && (
          <dl className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 px-3 py-2 text-[12px]">
            <div className="min-w-0"><dt className="text-ink-3">{t("Purchase")}</dt><dd className="num truncate font-medium">{item.purchasePriceCents !== null ? money(item.purchasePriceCents, item.purchaseCurrency ?? "EUR") : "—"}</dd></div>
            <div className="min-w-0"><dt className="text-ink-3">{t("Value")}</dt><dd className="num truncate font-medium">{item.valueCents !== null ? money(item.valueCents, item.valueCurrency ?? "EUR") : "—"}</dd></div>
          </dl>
        )}
      </div>
    </>
  );
  return (
    <article data-item={item.id} className={cx("card lift group relative h-full", selected && "ring-2 ring-accent", marked && "highlighted")}>
      {share ? body : <Link href={`/collection/${item.id}`} className="block rounded-3xl">{body}</Link>}
      {toggle && (
        <span className={cx("absolute top-4 left-4 grid size-8 place-items-center rounded-full bg-surface/90 shadow transition-opacity max-md:size-9 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:has-[:focus-visible]:opacity-100", selected && "opacity-100! ")}>
          <Checkbox checked={!!selected} onChange={() => toggle(item.id)} label={t("Select model")} />
        </span>
      )}
    </article>
  );
}

type GridRow = { kind: "head"; label: string; count: number; flag?: string | null } | { kind: "cards"; items: Item[] };

function GridView({ items, selected, toggle, highlight, pending, groupBy }: { items: Item[]; selected: Set<string>; toggle: (id: string) => void; highlight: string | null; pending: React.RefObject<string | null>; base: Currency; groupBy?: "type" | "airline" | null }) {
  const { t } = useI18n();
  const { types } = useApp();
  const { ref, width } = useContainerWidth();
  const cols = width >= 1280 ? 5 : width >= 960 ? 4 : width >= 640 ? 3 : 2;
  // Sorted by aircraft type: each family gets its own heading, its cards start on a fresh row.
  const rows = useMemo<GridRow[]>(() => {
    const out: GridRow[] = [];
    const chunk = (list: Item[]) => {
      for (let n = 0; n < list.length; n += cols) out.push({ kind: "cards", items: list.slice(n, n + cols) });
    };
    if (!groupBy) {
      chunk(items);
      return out;
    }
    const keyOf = (i: Item) => (groupBy === "type" ? aircraftFamilyOf(i, types) : i.airlineName ?? t("Unknown airline"));
    let start = 0;
    for (let n = 1; n <= items.length; n++) {
      const fam = keyOf(items[start]);
      if (n === items.length || keyOf(items[n]) !== fam) {
        out.push({ kind: "head", label: fam, count: n - start, flag: groupBy === "airline" ? items[start].countryCode : undefined });
        chunk(items.slice(start, n));
        start = n;
      }
    }
    return out;
  }, [items, cols, groupBy, types, t]);
  const offset = ref.current ? ref.current.getBoundingClientRect().top + window.scrollY : 0;
  const v = useWindowVirtualizer({ count: rows.length, estimateSize: (n) => (rows[n]?.kind === "head" ? 48 : 360), overscan: 3, gap: 16, scrollMargin: offset });

  useEffect(() => {
    if (!pending.current) return;
    const idx = rows.findIndex((r) => r.kind === "cards" && r.items.some((i) => i.id === pending.current));
    if (idx < 0) return;
    pending.current = null;
    v.scrollToIndex(idx, { align: "center" });
  }, [rows, pending, v, highlight]);

  return (
    <div ref={ref}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((vr) => {
          const row = rows[vr.index];
          const style = { transform: `translateY(${vr.start - v.options.scrollMargin}px)` };
          return row.kind === "head" ? (
            <h2 key={vr.key} data-index={vr.index} ref={v.measureElement} className="absolute top-0 left-0 flex w-full items-baseline gap-2.5 pt-4 pb-1" style={style}>
              <span className="flex items-center gap-2 text-[19px] font-extrabold tracking-[-0.025em]">{row.flag && <Flag code={row.flag} className="h-3.5 w-5" />}{row.label}</span>
              <span className="num rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-bold text-accent">{row.count === 1 ? t("1 model") : t("{n} models", { n: row.count })}</span>
            </h2>
          ) : (
            <div key={vr.key} data-index={vr.index} ref={v.measureElement} className="absolute top-0 left-0 grid w-full gap-3" style={{ ...style, gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
              {row.items.map((i) => (
                <ModelCard key={i.id} item={i} selected={selected.has(i.id)} toggle={toggle} marked={highlight === i.id} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Table ───────── */

interface Col {
  id: string;
  label: string;
  width: number;
  sort?: SortKey;
  align?: "right";
  edit?: { type: "text" | "money" | "date" | "scale" | "reg" | "item"; field: keyof ItemInput };
  render: (i: Item) => ReactNode;
}

function TableView({ items, selected, toggle, setSelected, sort, setSort, highlight, pending }: { items: Item[]; selected: Set<string>; toggle: (id: string) => void; setSelected: (s: Set<string>) => void; sort: { key: SortKey; dir: "asc" | "desc" }; setSort: (s: { key: SortKey; dir: "asc" | "desc" }) => void; highlight: string | null; pending: React.RefObject<string | null> }) {
  const { t, money, date } = useI18n();
  const { user } = useApp();
  const columns = useMemo<Col[]>(() => [
    { id: "image", label: t("Image"), width: 72, render: (i) => <ModelImage item={i} className="h-9 w-[56px] rounded-[3px]" /> },
    { id: "airline", label: t("Airline"), width: 200, sort: "airline", render: (i) => <span className="flex min-w-0 items-center gap-1.5"><Flag code={i.countryCode} className="shrink-0" /><span className="truncate">{i.airlineName ?? "—"}</span></span> },
    { id: "aircraft", label: t("Aircraft"), width: 190, sort: "aircraft", render: (i) => <Link href={`/collection/${i.id}`} className="truncate font-medium hover:text-accent">{i.aircraftName}</Link> },
    { id: "registration", label: t("Registration"), width: 118, sort: "registration", edit: { type: "reg", field: "registration" }, render: (i) => <span className="code text-[12.5px]">{i.registration ?? "—"}</span> },
    { id: "maker", label: t("Manufacturer"), width: 130, sort: "maker", edit: { type: "text", field: "modelManufacturerName" }, render: (i) => <span className="truncate">{i.modelManufacturerName}</span> },
    { id: "scale", label: t("Scale"), width: 74, sort: "scale", edit: { type: "scale", field: "scale" }, render: (i) => <span className="code text-[12.5px]">{i.scale ?? "—"}</span> },
    { id: "livery", label: t("Livery"), width: 150, sort: "livery", edit: { type: "text", field: "liveryName" }, render: (i) => <span className={cx("truncate", isSpecialLivery(i) && "text-accent")}>{i.liveryName ?? (i.liveryCategory ? t(LIVERY_LABEL[i.liveryCategory]) : "—")}</span> },
    { id: "itemNumber", label: t("Item Number"), width: 112, sort: "itemNumber", edit: { type: "item", field: "itemNumber" }, render: (i) => <span className="code truncate text-[12.5px]">{i.itemNumber ?? "—"}</span> },
    { id: "price", label: t("Purchase Price"), width: 112, sort: "price", align: "right", edit: { type: "money", field: "purchasePriceCents" }, render: (i) => <span className="num">{i.purchasePriceCents !== null ? money(i.purchasePriceCents, i.purchaseCurrency ?? "EUR") : "—"}</span> },
    { id: "value", label: t("Current Value"), width: 112, sort: "value", align: "right", edit: { type: "money", field: "valueCents" }, render: (i) => <ValueCell item={i} /> },
    { id: "date", label: t("Purchase Date"), width: 118, sort: "date", edit: { type: "date", field: "purchaseDate" }, render: (i) => <span className="num text-ink-2">{i.purchaseDate ? date(i.purchaseDate) : "—"}</span> },
  ], [t, money, date]);

  const [hidden, setHidden] = useState<string[]>([]);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [colsOpen, setColsOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(load("hangar:cols", []));
    setWidths(load("hangar:widths", {}));
  }, []);

  const shown = columns.filter((c) => !hidden.includes(c.id));
  const widthOf = (c: Col) => widths[c.id] ?? c.width;
  const total = 44 + shown.reduce((s, c) => s + widthOf(c), 0);
  const template = `44px ${shown.map((c) => `${widthOf(c)}px`).join(" ")}`;

  const { ref } = useContainerWidth();
  const headRef = useRef<HTMLDivElement>(null);
  const offset = ref.current ? ref.current.getBoundingClientRect().top + window.scrollY : 0;
  const v = useWindowVirtualizer({ count: items.length, estimateSize: () => 49, overscan: 12, scrollMargin: offset });

  useEffect(() => {
    if (!pending.current) return;
    const idx = items.findIndex((i) => i.id === pending.current);
    if (idx < 0) return;
    pending.current = null;
    v.scrollToIndex(idx, { align: "center" });
  }, [items, pending, v, highlight]);

  const startResize = (e: React.PointerEvent, c: Col) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = widthOf(c);
    let latest = widths;
    const move = (ev: PointerEvent) => {
      latest = { ...widths, [c.id]: Math.max(56, w0 + ev.clientX - x0) };
      setWidths(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      save("hangar:widths", latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  return (
    <div ref={ref} className="card" role="table" aria-rowcount={items.length} aria-label={t("My Collection")}>
      <div ref={headRef} className="scroll-thin sticky top-[68px] z-[5] overflow-hidden rounded-t-lg border-b border-line bg-surface sm:top-[76px] md:top-[52px]">
        <div role="row" className="grid" style={{ gridTemplateColumns: template, width: total, minWidth: "100%" }}>
          <div className="grid h-9 place-items-center"><Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={(c) => setSelected(new Set(c ? items.map((i) => i.id) : []))} label={t("Select all")} /></div>
          {shown.map((c) => {
            const on = c.sort && sort.key === c.sort;
            return (
              <div key={c.id} role="columnheader" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={cx("group relative flex h-9 min-w-0 items-center px-2.5", c.align === "right" && "justify-end")}>
                {c.sort ? (
                  <button type="button" onClick={() => setSort({ key: c.sort!, dir: on && sort.dir === "asc" ? "desc" : "asc" })} className={cx("flex min-w-0 items-center gap-1 text-[11.5px] font-medium hover:text-ink", on ? "text-ink" : "text-ink-3")}>
                    <span className="truncate">{c.label}</span>
                    {on && (sort.dir === "asc" ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />)}
                  </button>
                ) : <span className="text-[11.5px] font-medium text-ink-3">{c.label}</span>}
                <span role="separator" aria-orientation="vertical" onPointerDown={(e) => startResize(e, c)} className="absolute top-1 right-0 bottom-1 w-1.5 cursor-col-resize touch-none border-r border-transparent group-hover:border-line-strong" />
              </div>
            );
          })}
        </div>
      </div>
      <div className="scroll-thin relative overflow-x-auto" onScroll={(e) => { if (headRef.current) headRef.current.scrollLeft = e.currentTarget.scrollLeft; }}>
        <div style={{ height: v.getTotalSize(), width: total, minWidth: "100%", position: "relative" }}>
          {v.getVirtualItems().map((row) => {
            const i = items[row.index];
            return (
              <div key={i.id} role="row" data-item={i.id} aria-rowindex={row.index + 1} className={cx("absolute top-0 left-0 grid w-full items-center border-b border-line text-[13px] last:border-b-0 hover:bg-surface-2/50", selected.has(i.id) && "bg-accent-soft/60", highlight === i.id && "highlighted bg-surface")} style={{ height: 49, gridTemplateColumns: template, transform: `translateY(${row.start - v.options.scrollMargin}px)` }}>
                <div className="grid place-items-center"><Checkbox checked={selected.has(i.id)} onChange={() => toggle(i.id)} label={t("Select model")} /></div>
                {shown.map((c) => (
                  <div key={c.id} role="cell" className={cx("flex h-full min-w-0 items-center px-2.5", c.align === "right" && "justify-end text-right")}>
                    {c.edit ? <EditableCell item={i} col={c} /> : c.render(i)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        <span className="num text-[12px] text-ink-3">{t("{n} models", { n: items.length })}{user ? "" : ""}</span>
        <div className="relative">
          <Button size="sm" variant="ghost" aria-expanded={colsOpen} onClick={() => setColsOpen((o) => !o)}><Columns3 className="size-3.5" /> {t("Columns")}</Button>
          {colsOpen && (
            <div className="absolute right-0 bottom-9 z-20 w-48 rounded-md border border-line-strong bg-surface p-2 shadow-[var(--shadow)]">
              {columns.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-1 py-1 text-[13px]">
                  <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={!hidden.includes(c.id)} onChange={(e) => {
                    const next = e.target.checked ? hidden.filter((x) => x !== c.id) : [...hidden, c.id];
                    setHidden(next);
                    save("hangar:cols", next);
                  }} />{c.label}
                </label>
              ))}
              {Object.keys(widths).length > 0 && <button type="button" className="mt-1 px-1 text-[12px] text-accent hover:underline" onClick={() => { setWidths({}); save("hangar:widths", {}); }}>{t("Reset widths")}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ValueCell({ item }: { item: Item }) {
  const { money, number } = useI18n();
  const { user, rates } = useApp();
  if (item.valueCents === null) return <span className="text-ink-3">—</span>;
  const c = valueChange(item, user.baseCurrency, rates);
  return (
    <span className="num" title={c?.percent != null ? `${c.percent >= 0 ? "+" : ""}${number(c.percent, 1)}%` : undefined}>
      {money(item.valueCents, item.valueCurrency ?? "EUR")}
    </span>
  );
}

function EditableCell({ item, col }: { item: Item; col: Col }) {
  const { t, locale } = useI18n();
  const { patch, toast, user } = useApp();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  const edit = col.edit!;
  const raw = item[edit.field as keyof Item] as string | number | null;

  const begin = () => {
    if (edit.type === "money") setV(raw === null ? "" : (Number(raw) / 100).toLocaleString(locale === "de" ? "de-DE" : "en-GB", { useGrouping: false, minimumFractionDigits: 2 }));
    else setV(raw === null ? "" : String(raw));
    setEditing(true);
  };

  const commit = async () => {
    setEditing(false);
    let value: string | number | null = v.trim() || null;
    const p: Partial<ItemInput> = {};
    if (edit.type === "money") {
      const cents = value === null ? null : parseMoney(String(value));
      if (value !== null && cents === null) return toast(t("Enter an amount such as 42.99"), { tone: "error" });
      value = cents;
      if (edit.field === "purchasePriceCents") p.purchaseCurrency = cents === null ? null : (item.purchaseCurrency ?? user.baseCurrency);
      if (edit.field === "valueCents") {
        p.valueCurrency = cents === null ? null : (item.valueCurrency ?? user.baseCurrency);
        p.valueDate = cents === null ? null : new Date().toLocaleDateString("sv");
        p.valueSource = cents === null ? null : "user_estimate";
      }
    } else if (edit.type === "reg" && value) value = formatRegistration(String(value));
    else if (edit.type === "scale" && value) value = normalizeScale(String(value));
    if (value === raw) return;
    if (edit.field === "modelManufacturerName" && !value) return toast(t("Enter the model manufacturer"), { tone: "error" });
    try {
      await patch(item.id, { ...p, [edit.field]: value } as Partial<ItemInput>);
    } catch (e) {
      toast(e instanceof ApiError ? t("Could not save. Please try again.") : t("Could not save. Please try again."), { tone: "error" });
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={edit.type === "date" ? "date" : "text"}
        inputMode={edit.type === "money" ? "decimal" : undefined}
        list={edit.type === "scale" ? "hangar-scales" : undefined}
        value={v}
        aria-label={col.label}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className={cx("h-7 w-full min-w-0 rounded-[3px] border border-accent bg-surface px-1.5 text-[13px] focus:outline-none", (edit.type === "reg" || edit.type === "item" || edit.type === "scale") && "code", col.align === "right" && "text-right")}
      />
    );
  }
  return (
    <button type="button" onClick={begin} title={t("Click to edit")} className={cx("flex h-7 w-full min-w-0 cursor-text items-center rounded-[3px] px-1 -mx-1 box-content hover:bg-surface-2", col.align === "right" && "justify-end")}>
      {col.render(item)}
      {edit.type === "scale" && <datalist id="hangar-scales">{SCALES.map((s) => <option key={s} value={s} />)}</datalist>}
    </button>
  );
}

/* ───────── Bulk + export ───────── */

function BulkDelete({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const { remove, toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setConfirm(true)}><Trash2 className="size-3.5" /> {t("Delete")}</Button>
      <Dialog open={confirm} onClose={() => setConfirm(false)} label={t("Delete")}>
        <div className="p-5 text-ink">
          <h2 className="text-lg font-semibold">{t("Delete {n} models?", { n: ids.length })}</h2>
          <p className="mt-1 text-ink-2">{t("You can undo this right afterwards.")}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>{t("Cancel")}</Button>
            <Button variant="danger" onClick={async () => {
              setConfirm(false);
              try {
                await remove(ids);
                onDone();
              } catch {
                toast(t("Could not delete. Please try again."), { tone: "error" });
              }
            }}>{t("Delete")}</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function BulkEdit({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const { t } = useI18n();
  const { bulkPatch, toast } = useApp();
  const [p, setP] = useState({ status: "", scale: "", modelManufacturerName: "", liveryCategory: "", condition: "", storageLocation: "" });
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    const patch: Partial<ItemInput> = {};
    if (p.status) patch.status = p.status as ItemStatus;
    if (p.scale) patch.scale = normalizeScale(p.scale);
    if (p.modelManufacturerName.trim()) patch.modelManufacturerName = p.modelManufacturerName.trim();
    if (p.liveryCategory) patch.liveryCategory = p.liveryCategory as LiveryCategory;
    if (p.condition) patch.condition = p.condition as ItemInput["condition"];
    if (p.storageLocation.trim()) patch.storageLocation = p.storageLocation.trim();
    if (!Object.keys(patch).length) return onClose();
    setBusy(true);
    try {
      await bulkPatch(ids, patch);
      toast(t("{n} models updated", { n: ids.length }));
      onClose();
    } catch {
      toast(t("Could not save. Please try again."), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="p-5">
      <div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">{t("Edit {n} models", { n: ids.length })}</h2><p className="text-[13px] text-ink-2">{t("Only fields you fill in are changed.")}</p></div><IconClose onClick={onClose} label={t("Close")} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t("Status")}><Select value={p.status} onChange={(e) => setP({ ...p, status: e.target.value })}><option value="">{t("No change")}</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</Select></Field>
        <Field label={t("Scale")}><Input value={p.scale} onChange={(e) => setP({ ...p, scale: e.target.value })} className="code" placeholder={t("No change")} /></Field>
        <Field label={t("Model Manufacturer")}><Input value={p.modelManufacturerName} onChange={(e) => setP({ ...p, modelManufacturerName: e.target.value })} placeholder={t("No change")} /></Field>
        <Field label={t("Livery Type")}><Select value={p.liveryCategory} onChange={(e) => setP({ ...p, liveryCategory: e.target.value })}><option value="">{t("No change")}</option>{LIVERY_CATEGORIES.map((c) => <option key={c} value={c}>{t(LIVERY_LABEL[c])}</option>)}</Select></Field>
        <Field label={t("Condition")}><Select value={p.condition} onChange={(e) => setP({ ...p, condition: e.target.value })}><option value="">{t("No change")}</option>{CONDITIONS.map((c) => <option key={c} value={c}>{t(CONDITION_LABEL[c])}</option>)}</Select></Field>
        <Field label={t("Storage Location")}><Input value={p.storageLocation} onChange={(e) => setP({ ...p, storageLocation: e.target.value })} placeholder={t("No change")} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button><Button variant="primary" disabled={busy} onClick={apply}>{t("Apply")}</Button></div>
    </div>
  );
}

function ExportBody({ onClose, ids }: { onClose: () => void; ids: string[] | null }) {
  const { t } = useI18n();
  const q = ids ? `&ids=${ids.join(",")}` : "";
  return (
    <div className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("Export")}</h2>
          <p className="text-[13px] text-ink-2">{ids ? t("Exports the {n} selected models.", { n: ids.length }) : t("Exports everything, including the wishlist and all value history in JSON.")}</p>
        </div>
        <IconClose onClick={onClose} label={t("Close")} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["csv", "xlsx", "json"].map((f) => (
          <a key={f} href={`/api/export?format=${f}${q}`} onClick={onClose} className="code flex h-16 items-center justify-center rounded-md border border-line-strong text-[13px] font-medium uppercase hover:bg-surface-2">{f}</a>
        ))}
      </div>
    </div>
  );
}
