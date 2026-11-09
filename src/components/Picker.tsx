"use client";

import { Check, Dices, Eye, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { buildReel, pickRandom, secureRandomInt } from "@/lib/picker";
import { aircraftManufacturerOf, isSpecialLivery } from "@/lib/search";
import type { Item } from "@/lib/types";
import { useApp, useOwned } from "./AppProvider";
import { LIVERY_LABEL } from "./ItemForm";
import { ImageOrSilhouette } from "./ModelImage";
import { Button, cx, Dialog, IconClose } from "./ui";

type Mode = "reveal" | "highlight";
type Phase = "idle" | "spinning" | "landed" | "done";
interface Scope { id: string; label: string; pool: Item[]; featured: boolean }

const MODE_KEY = "hangar:picker-mode";
const SPIN_MS = 3400;
const TAIL = 4; // cards after the winner, so the strip never runs out on the right
const GAP = 12;

/** The button plus the dialog. `currentFilters` is the visible list on the collection page. */
export function PickerButton({ currentFilters, onHighlight, className, tone }: { currentFilters?: Item[]; onHighlight?: (id: string) => void; className?: string; tone?: "board" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      {tone === "board" ? (
        <button type="button" onClick={() => setOpen(true)} className={cx("inline-flex h-10 items-center gap-2 rounded-lg bg-flap px-4 text-[14px] font-semibold text-[#14181d] shadow-[0_8px_24px_-10px_var(--flap)] transition-[filter] hover:brightness-110", className)}>
          <Dices className="size-4" /> {t("Pick Random Aircraft")}
        </button>
      ) : (
        <Button className={className} onClick={() => setOpen(true)}><Dices className="size-4" /> {t("Pick Random Aircraft")}</Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} label={t("Random Aircraft Picker")} wide>
        <PickerBody currentFilters={currentFilters} onHighlight={onHighlight} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function PickerBody({ currentFilters, onHighlight, onClose }: { currentFilters?: Item[]; onHighlight?: (id: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const { types, openAdd } = useApp();
  const owned = useOwned();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === "highlight" ? "highlight" : "reveal";
    } catch {
      return "reveal";
    }
  });
  const modeRef = useRef(mode);
  const [scope, setScope] = useState("all");
  const [phase, setPhase] = useState<Phase>("idle");
  const [reel, setReel] = useState<Item[]>([]);
  const [winner, setWinner] = useState<Item | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const spinLock = useRef(false);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    spinLock.current = false;
  }, []);

  const scopes = useMemo<Scope[]>(() => {
    const list = owned ?? [];
    const out: Scope[] = [];
    if (currentFilters) out.push({ id: "current", label: t("Current filters"), pool: currentFilters.filter((i) => i.status === "collection"), featured: true });
    out.push({ id: "all", label: t("All"), pool: list, featured: true });
    const special = list.filter(isSpecialLivery);
    if (special.length) out.push({ id: "special", label: t("Special liveries"), pool: special, featured: true });
    const group = (prefix: string, key: (i: Item) => string | null | undefined, featuredCount: number) => {
      const groups = new Map<string, Item[]>();
      for (const i of list) {
        const k = key(i);
        if (k) groups.set(k, [...(groups.get(k) ?? []), i]);
      }
      [...groups.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, pool], n) => out.push({ id: `${prefix}:${k}`, label: k, pool, featured: n < featuredCount }));
    };
    group("mfr", (i) => aircraftManufacturerOf(i, types), 2);
    group("scale", (i) => i.scale, 3);
    group("airline", (i) => i.airlineName, 3);
    group("maker", (i) => i.modelManufacturerName, 0);
    return out;
  }, [owned, currentFilters, types, t]);

  const pool = useMemo(() => scopes.find((s) => s.id === scope)?.pool ?? [], [scopes, scope]);
  const shape = (i: Item | null) => (i?.aircraftTypeId ? types.get(i.aircraftTypeId)?.shape : undefined);

  const finish = (w: Item) => {
    setPhase("done");
    spinLock.current = false;
    if (modeRef.current === "highlight") {
      later(() => {
        onClose();
        if (onHighlight) onHighlight(w.id);
        else router.push(`/collection?highlight=${w.id}`);
      }, 250);
    }
  };

  const spin = () => {
    // A ref, so a double click within one render cannot start a second spin.
    if (spinLock.current || !pool.length) return;
    spinLock.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const w = pickRandom(pool)!; // Final here. Everything below only presents it.
    setWinner(w);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || pool.length === 1) {
      setReel([w]);
      setPhase("landed");
      later(() => finish(w), reduced ? 0 : 500);
      return;
    }
    const strip = [...buildReel(pool, w, 30), ...Array.from({ length: TAIL }, () => pool[secureRandomInt(pool.length)])];
    for (const id of new Set(strip.map((r) => r.imageId).filter(Boolean))) new Image().src = `/api/images/${id}?size=thumb`;
    if (w.imageId) new Image().src = `/api/images/${w.imageId}?`;
    setReel(strip);
    setPhase("spinning");
    later(() => setPhase("landed"), SPIN_MS);
    later(() => finish(w), SPIN_MS + 750);
  };

  // Opening the dialog is the request to spin: start as soon as the collection is there.
  const ready = !!owned && pool.length > 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) spin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const chooseMode = (m: Mode) => {
    setMode(m);
    modeRef.current = m;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  if (owned && owned.length === 0) {
    return (
      <div className="flex flex-col items-center bg-board px-6 pt-4 pb-8 text-center text-board-ink max-md:h-dvh">
        <div className="flex w-full justify-end [&_button]:text-board-dim"><IconClose onClick={onClose} label={t("Close")} /></div>
        <div className="mt-6 grid size-14 place-items-center rounded-full bg-board-2"><Dices className="size-6 text-flap" strokeWidth={1.5} /></div>
        <h2 className="mt-4 text-lg font-semibold">{t("Nothing in the hangar yet")}</h2>
        <p className="mt-1 max-w-sm text-board-dim">{t("Add your first model and the picker has something to choose from.")}</p>
        <button type="button" className="mt-6 h-10 rounded-md bg-flap px-4 text-[14px] font-medium text-[#14181d] hover:brightness-110" onClick={() => { onClose(); openAdd(); }}>{t("Add Aircraft")}</button>
      </div>
    );
  }

  const spinning = phase === "spinning" || phase === "landed";
  const featured = scopes.filter((s) => s.featured);
  const more = scopes.filter((s) => !s.featured);

  return (
    <div className="flex flex-col bg-board text-board-ink max-md:h-dvh">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className={cx("size-1.5 rounded-full bg-flap", spinning && "animate-pulse")} />
          <span className="code text-[11px] tracking-[0.16em] text-board-dim uppercase">{phase === "done" ? t("Your random aircraft") : t("Aviation Roulette")}</span>
        </div>
        <div className="flex items-center gap-2">
          {owned && <span className="code rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-board-dim">{t("{n} in the draw", { n: pool.length })}</span>}
          <span className="[&_button]:text-board-dim [&_button:hover]:bg-board-2 [&_button:hover]:text-board-ink"><IconClose onClick={onClose} label={t("Close")} /></span>
        </div>
      </div>

      {/* Stage: the strip while spinning, the result card after. Fixed height so nothing jumps. */}
      <div className="relative min-h-[330px] flex-1 sm:h-[330px] sm:flex-none">
        {phase === "done" && winner ? (
          <ResultCard item={winner} shape={shape(winner)} />
        ) : (
          <Reel reel={reel} phase={phase} shape={shape} loading={!owned} empty={!!owned && !pool.length} />
        )}
      </div>

      {/* Scope chips */}
      <div className="border-t border-white/[0.07] px-5 pt-3.5">
        <div className="mb-2 text-[11px] tracking-[0.08em] text-board-dim uppercase">{t("Pick from")}</div>
        <div className="scroll-thin -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-color:#2a323a_transparent]">
          {featured.map((s) => (
            <button key={s.id} type="button" disabled={spinning} aria-pressed={scope === s.id} onClick={() => setScope(s.id)}
              className={cx("h-8 shrink-0 rounded-full border px-3 text-[12.5px] whitespace-nowrap transition-colors disabled:opacity-50 max-md:h-10",
                scope === s.id ? "border-flap bg-flap/10 text-flap" : "border-white/10 text-board-dim hover:border-white/25 hover:text-board-ink")}>
              {s.label} <span className="code ml-0.5 text-[11px] opacity-60">{s.pool.length}</span>
            </button>
          ))}
          {more.length > 0 && (
            <select aria-label={t("More")} disabled={spinning} value={more.some((s) => s.id === scope) ? scope : ""} onChange={(e) => e.target.value && setScope(e.target.value)}
              className={cx("h-8 shrink-0 rounded-full border bg-board px-3 text-[12.5px] disabled:opacity-50 max-md:h-10", more.some((s) => s.id === scope) ? "border-flap text-flap" : "border-white/10 text-board-dim")}>
              <option value="">{t("More")}…</option>
              {more.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.pool.length})</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Mode + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3 pb-5">
        <div role="group" aria-label={t("After the spin")} className="flex rounded-full border border-white/10 p-0.5">
          {(["reveal", "highlight"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => chooseMode(m)}
              className={cx("h-7 rounded-full px-3 text-[12px] transition-colors max-md:h-9", mode === m ? "bg-board-2 text-board-ink" : "text-board-dim hover:text-board-ink")}>
              {m === "reveal" ? t("Aircraft Reveal") : t("Collection Highlight")}
            </button>
          ))}
        </div>
        <div className="flex gap-2 max-sm:w-full">
          {phase === "done" && winner && (
            <Link href={`/collection/${winner.id}`} onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 px-4 text-[14px] font-medium text-board-ink hover:bg-board-2 max-sm:flex-1 max-sm:justify-center">
              <Eye className="size-4" /> {t("View Aircraft")}
            </Link>
          )}
          <button type="button" onClick={spin} disabled={spinning || !pool.length}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-flap px-5 text-[14px] font-semibold text-[#14181d] transition-[filter,opacity] hover:brightness-110 disabled:opacity-60 max-sm:flex-1 max-sm:justify-center">
            {phase === "done" ? <RotateCw className="size-4" /> : <Dices className={cx("size-4", spinning && "animate-spin [animation-duration:1.2s]")} />}
            {spinning ? t("Spinning") : phase === "done" ? t("Spin Again") : t("Spin")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── The strip ───────── */

function Reel({ reel, phase, shape, loading, empty }: { reel: Item[]; phase: Phase; shape: (i: Item | null) => string | undefined; loading: boolean; empty: boolean }) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState(200);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setCard(el.clientWidth < 520 ? 150 : 196);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const target = Math.max(0, reel.length - 1 - (reel.length > 1 ? TAIL : 0));
  const offsetFor = (idx: number) => {
    const w = stage.current?.clientWidth ?? 0;
    return w / 2 - (idx * (card + GAP) + card / 2);
  };

  // Each new reel starts parked on its 3rd card without a transition, then glides to the winner.
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el || !reel.length) return;
    if (phase !== "spinning") {
      el.style.transition = "none";
      el.style.transform = `translate3d(${offsetFor(target)}px,0,0)`;
      return;
    }
    el.style.transition = "none";
    el.style.transform = `translate3d(${offsetFor(Math.min(2, target))}px,0,0)`;
    void el.offsetWidth; // commit the start position
    el.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.08, 1)`;
    el.style.transform = `translate3d(${offsetFor(target)}px,0,0)`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel, phase === "spinning", card]);

  const landed = phase === "landed";

  return (
    <div ref={stage} className="absolute inset-0 overflow-hidden">
      {/* Gate marker: where the winner stops. */}
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2" style={{ width: card + 16, height: card * 0.75 + 62 }}>
        <div className={cx("absolute inset-0 rounded-xl border transition-[border-color,box-shadow] duration-500", landed ? "border-flap/80 shadow-[0_0_60px_-12px_var(--flap)]" : "border-white/[0.08]")} />
        <div className="absolute -top-1.5 left-1/2 size-0 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-flap" />
        <div className="absolute -bottom-1.5 left-1/2 size-0 -translate-x-1/2 border-x-[6px] border-b-[7px] border-x-transparent border-b-flap" />
      </div>

      <div className="absolute inset-0 flex items-center [mask-image:linear-gradient(90deg,transparent,#000_18%,#000_82%,transparent)]">
        <div ref={strip} className={cx("flex will-change-transform", phase === "spinning" && "reel-blur")} style={{ gap: GAP, animationDuration: `${SPIN_MS}ms` }}>
          {reel.map((i, n) => {
            const isWin = n === target;
            return (
              <div key={n} style={{ width: card }} className={cx("shrink-0 transition-[opacity,transform] duration-500", landed && (isWin ? "scale-[1.04]" : "opacity-25"))}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-board-2 ring-1 ring-white/[0.06]">
                  <ImageOrSilhouette imageId={i.imageId} shape={shape(i)} size="thumb" alt="" className="size-full [--sil-bg:transparent] [--sil:#3a434c]" />
                </div>
                <div className="mt-2 px-0.5">
                  <div className="code truncate text-[12px] text-flap/90">{i.registration ?? "— — —"}</div>
                  <div className="truncate text-[12px] text-board-dim">{i.airlineName ?? t("Unknown airline")}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!reel.length && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <ImageOrSilhouette imageId={null} shape="wide" className="mx-auto h-20 w-48 opacity-50 [--sil-bg:transparent] [--sil:#2a323a]" />
            <p className="mt-3 text-[13px] text-board-dim">{loading ? t("Loading the hangar") : empty ? t("{n} models in the draw. Each one has the same chance.", { n: 0 }) : ""}</p>
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{phase === "spinning" ? t("Spinning") : ""}</span>
    </div>
  );
}

/* ───────── The reveal ───────── */

function ResultCard({ item, shape }: { item: Item; shape?: string }) {
  const { t, country } = useI18n();
  const rows: [string, string | null | undefined, boolean?][] = [
    [t("Scale"), item.scale, true],
    [t("Manufacturer"), item.modelManufacturerName],
    [t("Livery"), item.liveryName ?? (item.liveryCategory ? t(LIVERY_LABEL[item.liveryCategory]) : null)],
    [t("Item Number"), item.itemNumber, true],
    [t("Country"), item.countryCode ? country(item.countryCode) : null],
  ];
  const reg = item.registration ?? "";

  return (
    <div className="reveal grid h-full gap-5 px-5 pb-5 sm:grid-cols-[1.15fr_1fr] sm:items-center" aria-live="polite">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-board-2 ring-1 ring-flap/70 shadow-[0_0_70px_-20px_var(--flap)] max-sm:aspect-[16/10]">
        <ImageOrSilhouette imageId={item.imageId} registration={item.registration} shape={shape} size="full" alt={[item.airlineName, item.aircraftName].filter(Boolean).join(" ")} className="size-full [--sil-bg:transparent] [--sil:#3a434c]" />
        <span className="code absolute top-3 left-3 flex items-center gap-1 rounded-[4px] bg-flap px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-[#14181d] uppercase"><Check className="size-3" strokeWidth={3} />{t("Aircraft Selected")}</span>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[13px] text-board-dim">{item.airlineName ?? t("Unknown airline")}</div>
        <div className="mt-0.5 text-2xl leading-tight font-semibold tracking-tight text-balance">{item.aircraftName}</div>

        {reg && (
          <div className="mt-4 flex flex-wrap gap-[3px]" aria-label={`${t("Registration")} ${reg}`}>
            {[...reg].map((ch, n) => (
              <span key={n} aria-hidden className="flap code grid h-9 w-7 place-items-center rounded-[4px] bg-board-2 text-[17px] font-semibold text-flap shadow-[inset_0_-1px_0_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.04)]" style={{ animationDelay: `${120 + n * 45}ms` }}>
                {ch === " " ? " " : ch}
              </span>
            ))}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3">
          {rows.filter((r) => r[1]).map(([k, v, code]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[10.5px] tracking-[0.08em] text-board-dim uppercase">{k}</dt>
              <dd className={cx("truncate text-[14px]", code && "code")}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
