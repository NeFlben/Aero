"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { Bucket } from "@/lib/stats";
import { cx } from "./ui";

export const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

/** Ranked horizontal bars, each row in its own hue with a rank chip. The numbers are real text. */
export function BarList({ data, limit = 8, label, onSelect, unit, lead }: { data: Bucket[]; limit?: number; label?: (s: string) => string; onSelect?: (s: string) => void; unit?: string; lead?: (s: string) => ReactNode }) {
  const { t } = useI18n();
  if (!data.length) return <p className="px-5 py-6 text-[13px] text-ink-3">{t("No data yet")}</p>;
  const shown = data.slice(0, limit);
  const other = data.slice(limit).reduce((s, b) => s + b.count, 0);
  const rows = other ? [...shown, { label: t("Other"), count: other }] : shown;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="space-y-3.5 px-5 pt-3 pb-5">
      {rows.map((r, i) => {
        const isOther = !!other && i === rows.length - 1;
        const clickable = onSelect && !isOther;
        const color = isOther ? "var(--line-strong)" : PALETTE[i % PALETTE.length];
        const inner = (
          <span className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-xl text-[12px] font-bold text-white" style={{ background: color }}>{lead && !isOther ? lead(r.label) : i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate font-semibold text-ink">{label && !isOther ? label(r.label) : r.label}</span>
                <span className="num shrink-0 font-semibold text-ink-2">{r.count}{unit}</span>
              </span>
              <span className="mt-1.5 block h-2 rounded-full bg-surface-2">
                <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(3, (r.count / max) * 100)}%`, background: color }} />
              </span>
            </span>
          </span>
        );
        return (
          <li key={r.label} title={`${r.label}: ${r.count}`}>
            {clickable ? <button type="button" onClick={() => onSelect!(r.label)} className="block w-full rounded-xl text-left transition-opacity hover:opacity-80">{inner}</button> : inner}
          </li>
        );
      })}
    </ul>
  );
}

/** Share of a whole as a ring, total in the middle, legend beside it. */
export function Donut({ data, limit = 5, centerLabel, onSelect }: { data: Bucket[]; limit?: number; centerLabel: string; onSelect?: (s: string) => void }) {
  const { t, number } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="px-5 py-6 text-[13px] text-ink-3">{t("No data yet")}</p>;
  const shown = data.slice(0, limit);
  const other = data.slice(limit).reduce((s, b) => s + b.count, 0);
  const rows = other ? [...shown, { label: t("Other"), count: other }] : shown;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const R = 42, C = 2 * Math.PI * R, GAP = rows.length > 1 ? 1.6 : 0;
  const color = (i: number) => (other && i === rows.length - 1 ? "var(--line-strong)" : PALETTE[i % PALETTE.length]);
  const offsets = rows.reduce<number[]>((a, r, i) => [...a, i ? a[i - 1] + (rows[i - 1].count / total) * C : 0], []);
  const h = hover !== null ? rows[hover] : null;
  return (
    <div className="flex flex-col items-center gap-5 px-5 pt-3 pb-5 sm:flex-row">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={rows.map((r) => `${r.label} ${r.count}`).join(", ")}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
          {rows.map((r, i) => (
            <circle key={r.label} cx="50" cy="50" r={R} fill="none" stroke={color(i)} strokeWidth={hover === i ? 15 : 12}
              strokeDasharray={`${Math.max(0.5, (r.count / total) * C - GAP)} ${C}`} strokeDashoffset={-offsets[i]} className="transition-[stroke-width] duration-200"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="num text-[26px] leading-none font-extrabold tracking-[-0.03em]">{number(h ? h.count : total)}</div>
            <div className="mx-auto mt-1 max-w-24 truncate text-[11px] font-medium text-ink-3">{h ? h.label : centerLabel}</div>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-0.5">
        {rows.map((r, i) => {
          const isOther = !!other && i === rows.length - 1;
          const content = (
            <>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: color(i) }} />
              <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
              <span className="num shrink-0 text-ink-3">{number((r.count / total) * 100, 0)}%</span>
            </>
          );
          const cls = cx("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors", hover === i && "bg-surface-2");
          return (
            <li key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {onSelect && !isOther ? <button type="button" className={cls} onClick={() => onSelect(r.label)}>{content}</button> : <span className={cls}>{content}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Minimal trend line for stat tiles; colour comes from currentColor. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const gid = useId();
  if (values.length < 2) return null;
  const W = 100, H = 32, max = Math.max(...values), min = Math.min(...values);
  const y = (v: number) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * W).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={className}>
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d}L${W} ${H}L0 ${H}Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Time series as a 2px line over a faint area, with a crosshair and tooltip. */
export function AreaChart({ points, format, ariaLabel }: { points: { x: string; y: number; label: string }[]; format: (y: number) => string; ariaLabel: string }) {
  const { t } = useI18n();
  const ref = useRef<SVGSVGElement>(null);
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="px-4 py-6 text-[13px] text-ink-3">{t("No data yet")}</p>;

  const W = 640, H = 220, L = 8, R = 8, T = 14, B = 22;
  const max = Math.max(...points.map((p) => p.y), 1);
  const xOf = (i: number) => (points.length === 1 ? W / 2 : L + (i / (points.length - 1)) * (W - L - R));
  const yOf = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)} ${yOf(p.y).toFixed(1)}`).join("");
  const area = `${path}L${xOf(points.length - 1).toFixed(1)} ${H - B}L${xOf(0).toFixed(1)} ${H - B}Z`;
  const onMove = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i;
    });
    setHover(best);
  };
  const h = hover !== null ? points[hover] : null;
  const last = points[points.length - 1];

  return (
    <div className="relative px-4 pt-2 pb-3">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ariaLabel}: ${points.map((p) => `${p.label} ${format(p.y)}`).join(", ")}`} className="block w-full touch-pan-y" onMouseMove={(e) => onMove(e.clientX)} onMouseLeave={() => setHover(null)} onTouchMove={(e) => onMove(e.touches[0].clientX)} onTouchEnd={() => setHover(null)}>
        {[0.5, 1].map((f) => <line key={f} x1={L} x2={W - R} y1={yOf(max * f)} y2={yOf(max * f)} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        {points.length > 1 && <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        <text x={L} y={H - 6} fontSize="14" fill="var(--ink-3)" fontFamily="var(--font-mono)">{points[0].label}</text>
        {points.length > 1 && <text x={W - R} y={H - 6} fontSize="14" fill="var(--ink-3)" textAnchor="end" fontFamily="var(--font-mono)">{last.label}</text>}
        {hover === null && <circle cx={xOf(points.length - 1)} cy={yOf(last.y)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
        {hover !== null && h && (
          <>
            <line x1={xOf(hover)} x2={xOf(hover)} y1={T} y2={H - B} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            <circle cx={xOf(hover)} cy={yOf(h.y)} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </>
        )}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-xl bg-board px-2 py-1 shadow-[var(--shadow)] text-[12px] whitespace-nowrap text-board-ink" style={{ left: `clamp(8px, calc(${(xOf(hover) / W) * 100}% - 40px), calc(100% - 140px))` }}>
          <span className="code text-board-dim">{h.label}</span> <span className="num font-medium">{format(h.y)}</span>
        </div>
      )}
    </div>
  );
}
