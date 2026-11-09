"use client";

import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { airlineMergeGroups, type MergeGroup } from "@/lib/airlineCleanup";
import { useI18n } from "@/lib/i18n";
import { useApp } from "./AppProvider";
import { Button, cx, Dialog, Flag, Input } from "./ui";

/** Button plus dialog that merges differently written names of the same airline. */
export function AirlineCleanup() {
  const { t } = useI18n();
  const { items, ref, bulkPatch, toast } = useApp();
  const groups = useMemo(() => (items && ref ? airlineMergeGroups(items, ref.airlines) : []), [items, ref]);
  const [open, setOpen] = useState(false);

  if (!groups.length) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-12"><Sparkles className="size-4 text-accent" /> {t("Clean up")} <span className="rounded-full bg-accent-soft px-2 text-[12px] font-bold text-accent">{groups.length}</span></Button>
      {open && <CleanupDialog groups={groups} onClose={() => setOpen(false)} apply={async (changes) => {
        let n = 0;
        try {
          for (const c of changes) {
            await bulkPatch(c.ids, { airlineName: c.name, airlineId: c.airlineId });
            n += c.ids.length;
          }
        } catch {
          // Groups saved so far stay saved; the dialog stays open (and shows why) so the rest can be retried.
          throw new Error(n ? `${t("{n} models updated", { n })} · ${t("Could not save. Please try again.")}` : t("Could not save. Please try again."));
        }
        toast(t("{n} models updated", { n }));
        setOpen(false);
      }} />}
    </>
  );
}

type Change = { ids: string[]; name: string; airlineId: string | null };

function CleanupDialog({ groups, onClose, apply }: { groups: MergeGroup[]; onClose: () => void; apply: (c: Change[]) => Promise<void> }) {
  const { t } = useI18n();
  const [target, setTarget] = useState<Record<string, string>>(() => Object.fromEntries(groups.map((g) => [g.key, g.suggestion])));
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map((g) => [g.key, true])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes = groups.flatMap((g): Change[] => {
    if (!on[g.key]) return [];
    const name = target[g.key].trim();
    if (!name) return [];
    const ids = g.variants.filter((v) => v.name !== name).flatMap((v) => v.ids);
    return ids.length ? [{ ids, name, airlineId: g.airline?.id ?? null }] : [];
  });
  const count = changes.reduce((s, c) => s + c.ids.length, 0);

  return (
    <Dialog open onClose={onClose} label={t("Clean up airline names")} wide>
      <div className="p-5 sm:p-6">
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">{t("Clean up airline names")}</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">{t("These names look like the same airline. Pick the spelling to keep; untick anything that really is a different airline.")}</p>
        <ul className="mt-5 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {groups.map((g) => {
            const options = [...new Set([...(g.airline ? [g.airline.name] : []), ...g.variants.map((v) => v.name)])];
            const active = on[g.key];
            return (
              <li key={g.key} className={cx("rounded-2xl border border-line p-3.5 transition-opacity", !active && "opacity-50")}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={active} onChange={(e) => setOn({ ...on, [g.key]: e.target.checked })} className="mt-1 size-4 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {g.variants.map((v) => (
                        <span key={v.name} className={cx("rounded-full px-2.5 py-0.5 text-[12.5px]", v.name === target[g.key] ? "bg-accent-soft font-semibold text-accent" : "bg-surface-2 text-ink-2 line-through decoration-ink-3/60")}>
                          {v.name} <span className="text-ink-3">×{v.ids.length}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                </label>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-7">
                  <ArrowRight className="size-4 text-ink-3" />
                  {g.airline && <Flag code={g.airline.country} className="h-3.5 w-5" />}
                  <div role="radiogroup" aria-label={t("Spelling to keep")} className="flex flex-wrap gap-1.5">
                    {options.map((o) => (
                      <button key={o} type="button" role="radio" aria-checked={target[g.key] === o} disabled={!active} onClick={() => setTarget({ ...target, [g.key]: o })} className={cx("inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-semibold transition-colors", target[g.key] === o ? "border-accent bg-accent text-white" : "border-line text-ink-2 hover:border-accent hover:text-ink")}>
                        {target[g.key] === o && <Check className="size-3.5" />}{o}
                        {g.airline?.name === o && <span className={cx("text-[10.5px] font-medium", target[g.key] === o ? "text-white/80" : "text-ink-3")}>· {t("suggested")}</span>}
                      </button>
                    ))}
                  </div>
                  <Input aria-label={t("Own spelling")} placeholder={t("Own spelling")} disabled={!active} className="h-8 w-44 rounded-full text-[12.5px]" value={options.includes(target[g.key]) ? "" : target[g.key]} onChange={(e) => setTarget({ ...target, [g.key]: e.target.value || g.suggestion })} />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {error && <p role="alert" className="w-full rounded-xl bg-neg/10 px-3 py-2 text-[13px] font-semibold text-neg">{error}</p>}
          <span className="mr-auto text-[13px] text-ink-3">{count === 1 ? t("1 model will be renamed") : t("{n} models will be renamed", { n: count })}</span>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={!count || busy} onClick={async () => { setBusy(true); setError(null); try { await apply(changes); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }}>{busy ? t("Saving…") : t("Apply")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
