"use client";

import { Check, Plane } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { matchAircraft, matchOperators, type RegInfo } from "@/lib/registration";
import { formatRegistration } from "@/lib/smart";
import { aircraftLabel } from "@/lib/types";
import { api, useApp } from "./AppProvider";
import type { FormState } from "./ItemForm";
import { cx } from "./ui";

const complete = (r: string) => /^([A-Z0-9]{1,2}-[A-Z0-9]{3,5}|N\d{1,5}[A-Z]{0,2}|JA\d{3,4}[A-Z]?|HL\d{4}|[A-Z]\d-[A-Z0-9]{3,4})$/.test(r) && r.length >= 4;

/** Under the registration field: what that registration is (type, operators, year) with one click to fill it in. */
export function RegLookup({ form, set }: { form: FormState; set: (p: Partial<FormState>) => void }) {
  const { t } = useI18n();
  const { ref } = useApp();
  const reg = formatRegistration(form.registration);
  const [found, setFound] = useState<{ reg: string; info: RegInfo | null } | null>(null);

  useEffect(() => {
    if (!complete(reg)) return;
    const timer = setTimeout(() => {
      api<{ info: RegInfo | null }>(`/api/registration?reg=${encodeURIComponent(reg)}`)
        .then((r) => setFound({ reg, info: r.info }))
        .catch(() => setFound({ reg, info: null }));
    }, 500);
    return () => clearTimeout(timer);
  }, [reg]);

  const info = found?.reg === reg ? found.info : null;
  const match = useMemo(() => (info && ref ? { aircraft: matchAircraft(info, ref.aircraft), operators: matchOperators(info, ref.airlines) } : null), [info, ref]);
  if (!info || !match) return null;

  const typeName = match.aircraft ? aircraftLabel(match.aircraft) : info.types[0];
  const fillType = match.aircraft ? { aircraftName: aircraftLabel(match.aircraft), aircraftTypeId: match.aircraft.id } : {};
  const typeDone = !match.aircraft || form.aircraftTypeId === match.aircraft.id;
  const choices = match.operators.length ? match.operators : [null];

  return (
    <div className="mt-1.5 rounded-xl bg-surface-2 px-2.5 py-2 text-[12px]">
      <p className="flex flex-wrap items-center gap-x-1.5 text-ink-2">
        <Plane className="size-3.5 shrink-0 text-accent" />
        <span className="code font-semibold text-ink">{info.registration}</span>
        {typeName && <span>· {typeName}</span>}
        {info.built && <span>· {t("built {year}", { year: info.built })}</span>}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {choices.map((o) => {
          const done = typeDone && (!o || (o.airline ? form.airlineId === o.airline.id : form.airlineName === o.name));
          return (
            <button
              key={o?.name ?? "type"}
              type="button"
              disabled={done}
              onClick={() => set({ ...fillType, ...(o ? { airlineName: o.name, airlineId: o.airline?.id ?? null, ...(o.airline?.country ? { countryCode: o.airline.country } : {}) } : {}) })}
              className={cx("inline-flex h-7 items-center gap-1 rounded-full border px-2.5 font-semibold transition-colors", done ? "border-transparent bg-accent-soft text-accent" : "border-line-strong bg-surface hover:border-accent hover:text-accent")}
            >
              {done && <Check className="size-3.5" />}
              {o ? o.name : t("Use this type")}
            </button>
          );
        })}
      </div>
      {match.operators.length > 1 && <p className="mt-1 text-[11px] text-ink-3">{t("Flew for several airlines. Pick the one of your model.")}</p>}
    </div>
  );
}
