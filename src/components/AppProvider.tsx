"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { readCached, writeCached } from "@/lib/offline";
import { buildIndex, type Indexed } from "@/lib/search";
import type { Rates } from "@/lib/stats";
import type { AircraftRef, Currency, Item, ItemInput, Reference } from "@/lib/types";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  baseCurrency: Currency;
  /** False when the app runs without login (single local user). */
  authEnabled?: boolean;
}

interface Toast {
  id: number;
  text: string;
  tone?: "error";
  action?: { label: string; run: () => void };
}

/** Thrown for any refused request; `code` is the API's error code. */
export class ApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, json !== undefined ? { ...rest, method: rest.method ?? "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) } : rest);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? "server_error", res.status);
  }
  return res.json();
}

export type AddSeed = Partial<ItemInput> & { intent?: "manual" };

interface App {
  user: AppUser;
  setUser: (u: Partial<AppUser>) => void;
  items: Item[] | null;
  loadError: boolean;
  /** True while the shown collection is the copy saved on this device, not a fresh one from the server. */
  stale: boolean;
  reload: () => void;
  ref: Reference | null;
  setRef: (r: Reference) => void;
  rates: Rates | null;
  types: Map<string, AircraftRef>;
  index: Indexed[];
  byId: Map<string, Item>;
  addOpen: boolean;
  addSeed: AddSeed | null;
  openAdd: (seed?: AddSeed) => void;
  closeAdd: () => void;
  create: (input: ItemInput) => Promise<Item>;
  patch: (id: string, p: Partial<ItemInput>) => Promise<Item>;
  bulkPatch: (ids: string[], p: Partial<ItemInput>) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
  applyLocal: (item: Item) => void;
  toast: (text: string, opts?: Omit<Toast, "id" | "text">) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
}

const Ctx = createContext<App | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
};

export function AppProvider({ user: initialUser, children }: { user: AppUser; children: ReactNode }) {
  const { t, country } = useI18n();
  const [user, setUserState] = useState(initialUser);
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [stale, setStale] = useState(false);
  const [ref, setRef] = useState<Reference | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSeed, setAddSeed] = useState<AddSeed | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((l) => l.filter((x) => x.id !== id)), []);
  const toast = useCallback<App["toast"]>((text, opts) => {
    const id = ++toastId.current;
    setToasts((l) => [...l.slice(-2), { id, text, ...opts }]);
    setTimeout(() => dismiss(id), opts?.action ? 8000 : 3500);
  }, [dismiss]);

  const uid = initialUser.id;
  const reload = useCallback(() => {
    setLoadError(false);
    api<{ items: Item[] }>("/api/items")
      .then((r) => {
        setItems(r.items);
        setStale(false);
      })
      .catch(async () => {
        // Offline or server unreachable: the last copy on this device, read-only.
        const cached = await readCached<Item[]>(uid, "items");
        if (cached) {
          setItems((cur) => cur ?? cached);
          setStale(true);
        } else setLoadError(true);
      });
  }, [uid]);

  useEffect(() => {
    // The saved copy paints at once; the server's answer replaces it a moment later.
    let fresh = false;
    void readCached<Item[]>(uid, "items").then((cached) => {
      if (cached) setItems((cur) => cur ?? cached);
    });
    void readCached<Reference & { rates: Rates | null }>(uid, "reference").then((cached) => {
      if (!cached || fresh) return;
      const { rates: r, ...rest } = cached;
      setRef((cur) => cur ?? rest);
      setRates((cur) => cur ?? r);
    });
    // Initial load from the server; reload() resets the error flag before its request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    api<Reference & { rates: Rates | null }>("/api/reference")
      .then((all) => {
        fresh = true;
        const { rates, ...r } = all;
        setRef(r);
        setRates(rates);
        void writeCached(uid, "reference", all);
      })
      .catch(() => {});
  }, [reload, uid]);

  // Every change is mirrored into the saved copy, so it is current the next time the app opens offline.
  useEffect(() => {
    if (items && !stale) void writeCached(uid, "items", items);
  }, [items, stale, uid]);

  useEffect(() => {
    const back = () => reload();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [reload]);

  const create = useCallback(async (input: ItemInput) => {
    const { item } = await api<{ item: Item }>("/api/items", { json: input });
    setItems((l) => [item, ...(l ?? [])]);
    return item;
  }, []);

  const patch = useCallback(async (id: string, p: Partial<ItemInput>) => {
    const { item } = await api<{ item: Item }>(`/api/items/${id}`, { method: "PATCH", json: p });
    setItems((l) => l?.map((x) => (x.id === id ? item : x)) ?? null);
    return item;
  }, []);

  const bulkPatch = useCallback(async (ids: string[], p: Partial<ItemInput>) => {
    await api("/api/items/bulk", { json: { ids, action: "update", patch: p } });
    reload();
  }, [reload]);

  const remove = useCallback(async (ids: string[]) => {
    await api("/api/items/bulk", { json: { ids, action: "delete" } });
    const set = new Set(ids);
    let removed: Item[] = [];
    setItems((l) => {
      removed = l?.filter((x) => set.has(x.id)) ?? [];
      return l?.filter((x) => !set.has(x.id)) ?? null;
    });
    toast(ids.length === 1 ? t("Model deleted") : t("{n} models deleted", { n: ids.length }), {
      action: {
        label: t("Undo"),
        run: async () => {
          await api("/api/items/bulk", { json: { ids, action: "restore" } });
          setItems((l) => [...removed, ...(l ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        },
      },
    });
  }, [t, toast]);

  const applyLocal = useCallback((item: Item) => setItems((l) => l?.map((x) => (x.id === item.id ? item : x)) ?? null), []);

  const types = useMemo(() => new Map((ref?.aircraft ?? []).map((a) => [a.id, a])), [ref]);
  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const index = useMemo(() => buildIndex(items ?? [], ref, country), [items, ref, country]);

  const value = useMemo<App>(() => ({
    user,
    setUser: (u) => setUserState((c) => ({ ...c, ...u })),
    items, loadError, stale, reload, ref, setRef, rates, types, index, byId,
    addOpen, addSeed,
    openAdd: (seed) => {
      setAddSeed(seed ?? null);
      setAddOpen(true);
    },
    closeAdd: () => setAddOpen(false),
    create, patch, bulkPatch, remove, applyLocal, toast, toasts, dismiss,
  }), [user, items, loadError, stale, reload, ref, rates, types, index, byId, addOpen, addSeed, create, patch, bulkPatch, remove, applyLocal, toast, toasts, dismiss]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useOwned = () => {
  const { items } = useApp();
  return useMemo(() => items?.filter((i) => i.status === "collection") ?? null, [items]);
};
