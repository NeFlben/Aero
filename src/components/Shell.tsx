"use client";

import { Building2, CloudOff, Compass, Earth, Heart, Home, LayoutGrid, LineChart, Menu, Moon, Plus, Search, Settings, Sun, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n, type Locale } from "@/lib/i18n";
import { registerServiceWorker, useOnline } from "@/lib/offline";
import { useApp, useOwned } from "./AppProvider";
import { AddDialog } from "./AddDialog";
import { CommandPalette } from "./CommandPalette";
import { cx } from "./ui";

export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <span className="grad grid size-9 place-items-center rounded-2xl text-white shadow-[0_10px_22px_-10px_var(--accent)]">
        <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]" fill="currentColor"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5Z" /></svg>
      </span>
      <span className={cx("text-[17px] font-extrabold tracking-[-0.03em]", compact && "max-[400px]:sr-only")}>Hangar</span>
    </span>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    // Mirrors the attribute the no-flash script set before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setCookie("theme", next);
    setTheme(next);
  };
  return { theme, toggle };
}

export function LocaleSwitch({ className }: { className?: string }) {
  const { locale } = useI18n();
  const router = useRouter();
  const set = (l: Locale) => {
    setCookie("locale", l);
    router.refresh();
  };
  return (
    <span role="group" aria-label="Language" className={cx("code inline-flex rounded-full bg-surface-2 p-0.5 text-[11px]", className)}>
      {(["en", "de"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} onClick={() => set(l)} className={cx("h-7 rounded-full px-2.5 font-semibold uppercase", locale === l ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-3 hover:text-ink")}>
          {l}
        </button>
      ))}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const { openAdd, toasts, dismiss, user, stale } = useApp();
  const online = useOnline();
  const { theme, toggle } = useTheme();
  const owned = useOwned();
  const { number } = useI18n();
  const [more, setMore] = useState(false);

  useEffect(() => {
    registerServiceWorker();
    // Home-screen shortcut "Add Aircraft" opens /?add=1.
    if (new URLSearchParams(window.location.search).get("add") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      openAdd();
    }
    // Runs once on mount; openAdd only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lastPath, setLastPath] = useState(path);
  // A navigation closes the "More" sheet.
  if (lastPath !== path) {
    setLastPath(path);
    setMore(false);
  }
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMore(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [more]);

  const nav = [
    { href: "/", label: t("Dashboard"), icon: Home },
    { href: "/collection", label: t("My Collection"), icon: LayoutGrid },
    { href: "/airlines", label: t("Airlines"), icon: Building2 },
    { href: "/wishlist", label: t("Wishlist"), icon: Heart },
    { href: "/explore", label: t("Explore"), icon: Compass },
    { href: "/insights", label: t("Insights"), icon: LineChart },
    { href: "/map", label: t("World Map"), icon: Earth },
    { href: "/import", label: t("Import"), icon: Upload },
    { href: "/settings", label: t("Settings"), icon: Settings },
  ];
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const moreOn = more || ["/airlines", "/explore", "/insights", "/map", "/import", "/settings"].some(active);

  const iconBtn = "grid size-10 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";

  return (
    <div className="min-h-dvh">
      {/* Floating glass bar: brand, the sections as pills, quick actions. */}
      <header className="sticky top-0 z-30 px-3 pt-[max(12px,env(safe-area-inset-top))] md:px-6 md:pt-4">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center gap-2 rounded-[22px] border border-[var(--glass-line)] bg-[var(--glass)] px-2.5 shadow-[var(--shadow-sm)] backdrop-blur-xl sm:h-16 sm:gap-3 md:px-4">
          <Link href="/" className="shrink-0"><Wordmark compact /></Link>
          <Link href="/collection" title={t("Models in your hangar")} className="flex shrink-0 items-baseline gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-accent transition-colors hover:brightness-95">
            <span className="num text-[17px] leading-none font-extrabold tracking-[-0.03em]">{owned ? number(owned.length) : "…"}</span>
            <span className="text-[11.5px] font-semibold max-sm:hidden">{t("Models")}</span>
          </Link>
          <nav className="no-scrollbar mx-auto hidden min-w-0 items-center gap-1 overflow-x-auto lg:flex" aria-label={t("Main navigation")}>
            {nav.map((n) => {
              const on = active(n.href);
              return (
                <Link key={n.href} href={n.href} aria-label={n.label} title={n.label} aria-current={on ? "page" : undefined} className={cx("flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-semibold transition-all", on ? "bg-ink text-bg shadow-[0_8px_20px_-10px_rgb(13_19_48/0.6)]" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                  <n.icon className="size-4" strokeWidth={2} />
                  <span aria-hidden className={on ? "inline" : "hidden 2xl:inline"}>{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1 lg:ml-0">
            <button type="button" aria-label={t("Search")} onClick={() => window.dispatchEvent(new Event("hangar:search"))} className={iconBtn}><Search className="size-[18px]" /></button>
            <LocaleSwitch className="max-sm:hidden" />
            <button type="button" onClick={toggle} aria-label={t("Toggle dark mode")} className={cx(iconBtn, "max-sm:hidden")}>{theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</button>
            <button type="button" onClick={() => openAdd()} className="grad ml-1 hidden h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_24px_-10px_var(--accent)] transition-[filter] hover:brightness-110 md:inline-flex">
              <Plus className="size-4" strokeWidth={2.5} /> {t("Add Aircraft")}
            </button>
            <Link href="/settings" aria-label={t("Settings")} title={user.name} className="ml-1 grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br sm:size-10 from-[var(--c6)] to-[var(--c2)] text-[12.5px] font-bold text-white ring-2 ring-surface">{initials(user.name)}</Link>
          </div>
        </div>
      </header>

      {(!online || stale) && (
        <div role="status" className="mx-auto mt-3 flex max-w-[1480px] px-3 md:px-6">
          <p className="flex w-full items-center gap-2 rounded-2xl bg-board px-3.5 py-2 text-[12.5px] text-board-ink">
            <CloudOff className="size-4 shrink-0 text-flap" />
            {t("Offline: you see the last saved state. Changes are possible again once you are online.")}
          </p>
        </div>
      )}

      <main className="mx-auto max-w-[1480px] px-4 pt-5 pb-[calc(112px+env(safe-area-inset-bottom))] md:px-6 md:pt-8 lg:pb-14">{children}</main>

      {/* Mobile and tablet: a floating dock with the add button in its centre; "More" opens every other section. */}
      <nav aria-label={t("Main navigation")} className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 mx-auto grid max-w-lg grid-cols-5 rounded-[26px] border border-[var(--glass-line)] bg-[var(--glass)] shadow-[var(--shadow)] backdrop-blur-xl lg:hidden">
        {[
          { href: "/", label: t("Home"), icon: Home },
          { href: "/collection", label: t("Collection"), icon: LayoutGrid },
          null,
          { href: "/wishlist", label: t("Wishlist"), icon: Heart },
        ].map((n) =>
          n ? (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={cx("flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold", active(n.href) && !more ? "text-accent" : "text-ink-3")}>
              <span className={cx("grid h-7 w-12 max-w-full place-items-center rounded-full transition-colors", active(n.href) && !more && "bg-accent-soft")}><n.icon className="size-5" strokeWidth={2} /></span>
              <span className="max-w-full truncate px-0.5">{n.label}</span>
            </Link>
          ) : (
            <button key="add" type="button" aria-label={t("Add Aircraft")} onClick={() => openAdd()} className="flex h-16 items-center justify-center">
              <span className="grad grid size-13 -translate-y-3 place-items-center rounded-full text-white shadow-[0_12px_24px_-8px_var(--accent)] ring-4 ring-bg"><Plus className="size-6" strokeWidth={2.5} /></span>
            </button>
          ),
        )}
        <button type="button" aria-expanded={more} aria-haspopup="dialog" onClick={() => setMore((m) => !m)} className={cx("flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold", moreOn ? "text-accent" : "text-ink-3")}>
          <span className={cx("grid h-7 w-12 max-w-full place-items-center rounded-full transition-colors", moreOn && "bg-accent-soft")}>{more ? <X className="size-5" /> : <Menu className="size-5" strokeWidth={2} />}</span>
          <span className="max-w-full truncate px-0.5">{t("More")}</span>
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-20 lg:hidden" role="dialog" aria-modal="true" aria-label={t("Main navigation")}>
          <button type="button" aria-label={t("Close")} tabIndex={-1} onClick={() => setMore(false)} className="fade-in absolute inset-0 bg-[rgb(8_11_14/0.45)] backdrop-blur-[2px]" />
          <div className="fade-in absolute inset-x-3 bottom-[calc(max(12px,env(safe-area-inset-bottom))+76px)] mx-auto max-w-lg rounded-[26px] border border-[var(--glass-line)] bg-surface p-3 shadow-[var(--shadow)]">
            <ul className="grid grid-cols-3 gap-1.5">
              {nav.map((n) => {
                const on = active(n.href);
                return (
                  <li key={n.href}>
                    <Link href={n.href} onClick={() => setMore(false)} aria-current={on ? "page" : undefined} className={cx("flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center text-[11.5px] leading-tight font-semibold transition-colors", on ? "bg-accent-soft text-accent" : "text-ink-2 active:bg-surface-2")}>
                      <n.icon className="size-5" strokeWidth={2} />
                      <span className="line-clamp-2">{n.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line px-1 pt-3">
              <LocaleSwitch />
              <button type="button" onClick={toggle} aria-pressed={theme === "dark"} className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-[12.5px] font-semibold text-ink-2">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                {t("Dark mode")}
              </button>
            </div>
          </div>
        </div>
      )}

      <AddDialog />
      <CommandPalette />

      <div aria-live="polite" className="pointer-events-none fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 z-[60] flex w-[min(calc(100vw-24px),420px)] -translate-x-1/2 flex-col gap-2 lg:bottom-6">
        {toasts.map((x) => (
          <div key={x.id} className="fade-in pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-board px-3.5 py-2.5 text-[13px] text-board-ink shadow-[var(--shadow)]">
            <span className={cx(x.tone === "error" && "text-[#ff9c90]")}>{x.text}</span>
            {x.action && (
              <button type="button" onClick={() => { x.action!.run(); dismiss(x.id); }} className="code shrink-0 text-[12px] font-semibold text-flap uppercase hover:underline">{x.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
