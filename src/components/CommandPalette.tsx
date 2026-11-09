"use client";

import { Compass, Earth, Heart, Home, LayoutGrid, LineChart, Plus, Search, Settings, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { searchItems } from "@/lib/search";
import { useApp } from "./AppProvider";
import { ModelImage } from "./ModelImage";
import { cx, Dialog, Reg } from "./ui";

const HISTORY = "hangar:search-history";

export function CommandPalette() {
  const { t } = useI18n();
  const router = useRouter();
  const { index, openAdd } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hangar:search", onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hangar:search", onEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ("");
    setActive(0);
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY) ?? "[]"));
    } catch {}
  }, [open]);

  const remember = () => {
    const term = q.trim();
    if (term.length < 2) return;
    try {
      localStorage.setItem(HISTORY, JSON.stringify([term, ...history.filter((h) => h !== term)].slice(0, 6)));
    } catch {}
  };

  const items = useMemo(() => (q.trim() ? searchItems(index, q).slice(0, 8) : []), [q, index]);
  const actions = useMemo(() => {
    const all = [
      { label: t("Add Aircraft"), icon: Plus, run: () => openAdd() },
      { label: t("Dashboard"), icon: Home, run: () => router.push("/") },
      { label: t("My Collection"), icon: LayoutGrid, run: () => router.push("/collection") },
      { label: t("Wishlist"), icon: Heart, run: () => router.push("/wishlist") },
      { label: t("Explore"), icon: Compass, run: () => router.push("/explore") },
      { label: t("Insights"), icon: LineChart, run: () => router.push("/insights") },
      { label: t("World Map"), icon: Earth, run: () => router.push("/map") },
      { label: t("Import"), icon: Upload, run: () => router.push("/import") },
      { label: t("Settings"), icon: Settings, run: () => router.push("/settings") },
    ];
    const n = q.trim().toLowerCase();
    return n ? all.filter((a) => a.label.toLowerCase().includes(n)) : all;
  }, [q, t, openAdd, router]);

  const rows = [
    ...items.map((i) => ({ key: i.id, run: () => { remember(); router.push(`/collection/${i.id}`); }, item: i })),
    ...actions.map((a) => ({ key: a.label, run: a.run, action: a })),
  ];

  const go = (run: () => void) => {
    setOpen(false);
    run();
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} label={t("Search")} align="top">
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search className="size-4 shrink-0 text-ink-3" />
        <input
          autoFocus
          value={q}
          aria-label={t("Search your collection")}
          placeholder={t("Search your collection")}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && rows[active]) { e.preventDefault(); go(rows[active].run); }
          }}
          className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3 max-md:text-base"
        />
        <kbd className="code hidden rounded border border-line px-1.5 text-[10px] text-ink-3 md:block">ESC</kbd>
      </div>
      {!q && history.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
          {history.map((h) => <button key={h} type="button" onClick={() => setQ(h)} className="rounded-[4px] bg-surface-2 px-2 py-0.5 text-[12px] text-ink-2 hover:text-ink">{h}</button>)}
        </div>
      )}
      <ul className="scroll-thin max-h-[56vh] overflow-y-auto py-1 max-md:max-h-[calc(100dvh-110px)]">
        {rows.map((r, i) => (
          <li key={r.key}>
            <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r.run)} className={cx("flex w-full items-center gap-3 px-4 py-2 text-left", i === active && "bg-accent-soft")}>
              {"item" in r && r.item ? (
                <>
                  <ModelImage item={r.item} className="h-9 w-14 shrink-0 rounded-[3px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{[r.item.airlineName, r.item.aircraftName].filter(Boolean).join(" · ")}</span>
                    <span className="block truncate text-[12px] text-ink-2">{[r.item.modelManufacturerName, r.item.scale, r.item.itemNumber].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Reg>{r.item.registration}</Reg>
                </>
              ) : "action" in r && r.action ? (
                <>
                  <r.action.icon className="size-4 text-ink-3" />
                  <span className="text-[13.5px]">{r.action.label}</span>
                </>
              ) : null}
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-6 text-center text-ink-2">{t("No matches for this search.")}</li>}
      </ul>
    </Dialog>
  );
}
