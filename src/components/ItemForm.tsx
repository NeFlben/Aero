"use client";

import { ChevronRight, ScanBarcode, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SCALES } from "@/data/reference";
import { COUNTRY_CODES } from "@/lib/countries";
import { useI18n } from "@/lib/i18n";
import { formatRegistration, normBarcode, registrationCountry, searchAircraft, searchAirlines, searchMakers } from "@/lib/smart";
import { parseMoney } from "@/lib/stats";
import { aircraftLabel, BOX_STATUSES, CONDITIONS, CURRENCIES, LIVERY_CATEGORIES, type Currency, type Item, type ItemInput, type ItemStatus } from "@/lib/types";
import { useApp } from "./AppProvider";
import { BarcodeScanner, cameraAvailable } from "./BarcodeScanner";
import { RegLookup } from "./RegLookup";
import { Combobox, Field, Input, Select, cx } from "./ui";

export interface FormState {
  releaseId: string | null;
  status: ItemStatus;
  airlineId: string | null;
  airlineName: string;
  aircraftTypeId: string | null;
  aircraftName: string;
  modelManufacturerName: string;
  scale: string;
  registration: string;
  itemNumber: string;
  barcode: string;
  liveryCategory: string;
  liveryName: string;
  countryCode: string;
  price: string;
  purchaseCurrency: Currency;
  purchaseDate: string;
  value: string;
  valueCurrency: Currency;
  condition: string;
  boxStatus: string;
  limitedEdition: boolean;
  certificate: boolean;
  storageLocation: string;
  purchaseSource: string;
  rating: string;
  notes: string;
  priority: string;
  desiredPrice: string;
  desiredCurrency: Currency;
  expectedRelease: string;
  dealer: string;
}

export const today = () => new Date().toLocaleDateString("sv"); // yyyy-mm-dd in local time

const major = (c: number | null | undefined, locale: string) => (c === null || c === undefined ? "" : (c / 100).toLocaleString(locale === "de" ? "de-DE" : "en-GB", { minimumFractionDigits: 2, useGrouping: false }));

export function blankForm(base: Currency): FormState {
  return {
    releaseId: null, status: "collection", airlineId: null, airlineName: "", aircraftTypeId: null, aircraftName: "", modelManufacturerName: "", scale: "", registration: "", itemNumber: "", barcode: "",
    liveryCategory: "", liveryName: "", countryCode: "", price: "", purchaseCurrency: base, purchaseDate: today(), value: "", valueCurrency: base, condition: "", boxStatus: "",
    limitedEdition: false, certificate: false, storageLocation: "", purchaseSource: "", rating: "", notes: "", priority: "", desiredPrice: "", desiredCurrency: base, expectedRelease: "", dealer: "",
  };
}

export function formFromItem(i: Partial<Item> & Partial<ItemInput>, base: Currency, locale: string): FormState {
  const b = blankForm(base);
  return {
    ...b,
    releaseId: i.releaseId ?? null, status: i.status ?? "collection", airlineId: i.airlineId ?? null, airlineName: i.airlineName ?? "", aircraftTypeId: i.aircraftTypeId ?? null, aircraftName: i.aircraftName ?? "",
    modelManufacturerName: i.modelManufacturerName ?? "", scale: i.scale ?? "", registration: i.registration ?? "", itemNumber: i.itemNumber ?? "", barcode: i.barcode ?? "", liveryCategory: i.liveryCategory ?? "", liveryName: i.liveryName ?? "",
    countryCode: i.countryCode ?? "", price: major(i.purchasePriceCents, locale), purchaseCurrency: i.purchaseCurrency ?? base, purchaseDate: i.purchaseDate ?? "", value: major(i.valueCents, locale), valueCurrency: i.valueCurrency ?? base,
    condition: i.condition ?? "", boxStatus: i.boxStatus ?? "", limitedEdition: !!i.limitedEdition, certificate: !!i.certificate, storageLocation: i.storageLocation ?? "", purchaseSource: i.purchaseSource ?? "",
    rating: i.rating ? String(i.rating) : "", notes: i.notes ?? "", priority: i.priority ? String(i.priority) : "", desiredPrice: major(i.desiredPriceCents, locale), desiredCurrency: i.desiredCurrency ?? base, expectedRelease: i.expectedRelease ?? "", dealer: i.dealer ?? "",
  };
}

/** Returns field errors, or the validated input for the API. */
export function formToInput(f: FormState, t: (k: string) => string): { errors: Record<string, string> } | { input: ItemInput } {
  const errors: Record<string, string> = {};
  if (!f.aircraftName.trim()) errors.aircraftName = t("Enter the aircraft type");
  if (!f.modelManufacturerName.trim()) errors.modelManufacturerName = t("Enter the model manufacturer");
  const money = (raw: string, key: string) => {
    if (!raw.trim()) return null;
    const v = parseMoney(raw);
    if (v === null) errors[key] = t("Enter an amount such as 42.99");
    return v;
  };
  const price = money(f.price, "price");
  const value = money(f.value, "value");
  const desired = money(f.desiredPrice, "desiredPrice");
  if (Object.keys(errors).length) return { errors };
  const none = (s: string) => s.trim() || null;
  return {
    input: {
      releaseId: f.releaseId, status: f.status, airlineId: f.airlineId, airlineName: none(f.airlineName), aircraftTypeId: f.aircraftTypeId, aircraftName: f.aircraftName.trim(),
      modelManufacturerName: f.modelManufacturerName.trim(), scale: none(f.scale), registration: none(f.registration), itemNumber: none(f.itemNumber), barcode: normBarcode(f.barcode) || null,
      liveryCategory: (f.liveryCategory || null) as ItemInput["liveryCategory"], liveryName: none(f.liveryName), countryCode: f.countryCode || null,
      purchasePriceCents: price, purchaseCurrency: price !== null ? f.purchaseCurrency : null, purchaseDate: f.purchaseDate || null,
      valueCents: value, valueCurrency: value !== null ? f.valueCurrency : null, valueDate: value !== null ? today() : null, valueSource: value !== null ? "user_estimate" : null,
      condition: (f.condition || null) as ItemInput["condition"], boxStatus: (f.boxStatus || null) as ItemInput["boxStatus"], limitedEdition: f.limitedEdition || null, certificate: f.certificate || null,
      storageLocation: none(f.storageLocation), purchaseSource: none(f.purchaseSource), rating: f.rating ? Number(f.rating) : null, notes: none(f.notes), priority: f.priority ? Number(f.priority) : null,
      desiredPriceCents: desired, desiredCurrency: desired !== null ? f.desiredCurrency : null, expectedRelease: f.expectedRelease || null, dealer: none(f.dealer),
    },
  };
}

export const LIVERY_LABEL: Record<string, string> = {
  standard: "Standard Livery", retro: "Retro Livery", anniversary: "Anniversary Livery", special: "Special Livery", alliance: "Alliance Livery", promotional: "Promotional Livery", hybrid: "Hybrid Livery", other: "Other",
};
export const CONDITION_LABEL: Record<string, string> = { mint: "Mint", very_good: "Very good", good: "Good", fair: "Fair", damaged: "Damaged" };
export const BOX_LABEL: Record<string, string> = { with_box: "Original box", damaged_box: "Box damaged", no_box: "No box" };
export const STATUS_LABEL: Record<string, string> = { collection: "In Collection", wishlist: "Wishlist", ordered: "Ordered", preordered: "Pre-ordered", sold: "Sold" };

function MoneyField({ label, value, currency, onValue, onCurrency, error, hint }: { label: string; value: string; currency: Currency; onValue: (v: string) => void; onCurrency: (c: Currency) => void; error?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      <div className="flex gap-1.5">
        <Input inputMode="decimal" value={value} onChange={(e) => onValue(e.target.value)} placeholder="0.00" className="num min-w-0 flex-1" aria-invalid={!!error} />
        <Select aria-label={label} value={currency} onChange={(e) => onCurrency(e.target.value as Currency)} className="w-[82px] shrink-0">
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>
    </Field>
  );
}

const Unsure = ({ children }: { children: ReactNode }) => (
  <span className="mt-1 flex items-center gap-1 text-[11.5px] text-signal"><TriangleAlert className="size-3 shrink-0" />{children}</span>
);

export function ItemForm({ form, set, errors, unsure, compact }: { form: FormState; set: (p: Partial<FormState>) => void; errors: Record<string, string>; unsure?: Set<string>; compact?: boolean }) {
  const { t, country, locale } = useI18n();
  const { ref } = useApp();
  const [more, setMore] = useState(!compact);

  const countries = useMemo(() => COUNTRY_CODES.map((c) => ({ c, n: country(c) })).sort((a, b) => a.n.localeCompare(b.n, locale)), [country, locale]);
  const regC = registrationCountry(form.registration);
  const wishlist = form.status === "wishlist" || form.status === "ordered" || form.status === "preordered";
  const check = t("Recognised from your search. Please check.");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Aircraft Type")} required error={errors.aircraftName}>
          <Combobox
            value={form.aircraftName}
            placeholder="Airbus A350-900"
            onChange={(v) => set({ aircraftName: v, aircraftTypeId: null })}
            search={(q) => (ref && q ? searchAircraft(ref.aircraft, q, 10).map((a) => ({ id: a.id, label: aircraftLabel(a), hint: a.icaoCode ?? undefined })) : [])}
            onPick={(o) => set({ aircraftName: o.label, aircraftTypeId: o.id })}
          />
          {unsure?.has("aircraftName") && <Unsure>{t("Variant not certain. Please pick the exact one.")}</Unsure>}
        </Field>
        <Field label={t("Model Manufacturer")} required error={errors.modelManufacturerName}>
          <Combobox
            value={form.modelManufacturerName}
            placeholder="NG Models"
            onChange={(v) => set({ modelManufacturerName: v })}
            search={(q) => (ref ? searchMakers(ref.makers, q, 8).map((m) => ({ id: m.id, label: m.name })) : [])}
          />
        </Field>
        <Field label={t("Airline")}>
          <Combobox
            value={form.airlineName}
            placeholder="SWISS"
            onChange={(v) => set({ airlineName: v, airlineId: null })}
            search={(q) => (ref && q ? searchAirlines(ref.airlines, q, 8).map((a) => ({ id: a.id, label: a.name, hint: [a.iata, a.icao].filter(Boolean).join(" · "), flag: a.country })) : [])}
            onPick={(o) => {
              const a = ref?.airlines.find((x) => x.id === o.id);
              set({ airlineName: o.label, airlineId: o.id, countryCode: a?.country ?? form.countryCode });
            }}
          />
        </Field>
        <Field label={t("Scale")}>
          <div className="flex gap-1">
            {SCALES.slice(0, 3).map((s) => (
              <button key={s} type="button" aria-pressed={form.scale === s} onClick={() => set({ scale: form.scale === s ? "" : s })} className={cx("code h-9 min-w-0 flex-1 rounded-md border text-[13px] max-md:h-11", form.scale === s ? "border-accent bg-accent-soft font-medium" : "border-line-strong hover:bg-surface-2")}>{s}</button>
            ))}
            <Input aria-label={t("Other scale")} value={SCALES.slice(0, 3).includes(form.scale) ? "" : form.scale} onChange={(e) => set({ scale: e.target.value })} placeholder={t("Other")} className="code w-[74px]! shrink-0" />
          </div>
        </Field>
        <Field label={t("Registration")} hint={regC ? country(regC) : undefined}>
          <Input
            className="code uppercase placeholder:normal-case"
            autoCapitalize="characters"
            spellCheck={false}
            value={form.registration}
            placeholder="HB-JNA"
            onChange={(e) => set({ registration: e.target.value })}
            onBlur={(e) => set({ registration: formatRegistration(e.target.value) })}
          />
          {unsure?.has("registration") && <Unsure>{check}</Unsure>}
          <RegLookup form={form} set={set} />
        </Field>
        <Field label={t("Item Number")}>
          <Input className="code" spellCheck={false} value={form.itemNumber} onChange={(e) => set({ itemNumber: e.target.value })} placeholder="11045" />
          {unsure?.has("itemNumber") && <Unsure>{check}</Unsure>}
        </Field>
        <BarcodeField value={form.barcode} onChange={(barcode) => set({ barcode })} />
        <Field label={t("Livery Type")}>
          <Select value={form.liveryCategory} onChange={(e) => set({ liveryCategory: e.target.value })}>
            <option value="">—</option>
            {LIVERY_CATEGORIES.map((c) => <option key={c} value={c}>{t(LIVERY_LABEL[c])}</option>)}
          </Select>
        </Field>
        <Field label={t("Livery Name")}>
          <Input value={form.liveryName} onChange={(e) => set({ liveryName: e.target.value })} placeholder={t("e.g. Retro 1960s")} />
          {unsure?.has("liveryName") && <Unsure>{t("Taken from your search text. Remove it if this is not the livery.")}</Unsure>}
        </Field>
      </div>

      {wishlist ? (
        <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <MoneyField label={t("Desired Price")} value={form.desiredPrice} currency={form.desiredCurrency} onValue={(v) => set({ desiredPrice: v })} onCurrency={(c) => set({ desiredCurrency: c })} error={errors.desiredPrice} />
          <Field label={t("Expected Release")}><Input type="date" value={form.expectedRelease} onChange={(e) => set({ expectedRelease: e.target.value })} /></Field>
          <Field label={t("Dealer")}><Input value={form.dealer} onChange={(e) => set({ dealer: e.target.value })} /></Field>
          <Field label={t("Priority")}>
            <Select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">—</option>
              <option value="1">{t("High")}</option>
              <option value="2">{t("Medium")}</option>
              <option value="3">{t("Low")}</option>
            </Select>
          </Field>
        </div>
      ) : (
        <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
          <MoneyField label={t("Purchase Price")} value={form.price} currency={form.purchaseCurrency} onValue={(v) => set({ price: v })} onCurrency={(c) => set({ purchaseCurrency: c })} error={errors.price} />
          <Field label={t("Purchase Date")}><Input type="date" value={form.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} /></Field>
          <MoneyField label={t("Current Value")} hint={t("your estimate")} value={form.value} currency={form.valueCurrency} onValue={(v) => set({ value: v })} onCurrency={(c) => set({ valueCurrency: c })} error={errors.value} />
        </div>
      )}

      <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex h-8 items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink max-md:h-11">
        <ChevronRight className={cx("size-3.5 transition-transform", more && "rotate-90")} /> {t("More details")}
      </button>

      {more && (
        <div className="fade-in grid gap-3 sm:grid-cols-2">
          <Field label={t("Airline Country")} hint={t("airline's home, not the registration")}>
            <Select value={form.countryCode} onChange={(e) => set({ countryCode: e.target.value })}>
              <option value="">—</option>
              {countries.map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
            </Select>
          </Field>
          <Field label={t("Status")}>
            <Select value={form.status} onChange={(e) => set({ status: e.target.value as ItemStatus })}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </Select>
          </Field>
          <Field label={t("Condition")}>
            <Select value={form.condition} onChange={(e) => set({ condition: e.target.value })}>
              <option value="">—</option>
              {CONDITIONS.map((c) => <option key={c} value={c}>{t(CONDITION_LABEL[c])}</option>)}
            </Select>
          </Field>
          <Field label={t("Packaging")}>
            <Select value={form.boxStatus} onChange={(e) => set({ boxStatus: e.target.value })}>
              <option value="">—</option>
              {BOX_STATUSES.map((c) => <option key={c} value={c}>{t(BOX_LABEL[c])}</option>)}
            </Select>
          </Field>
          <Field label={t("Storage Location")}><Input value={form.storageLocation} onChange={(e) => set({ storageLocation: e.target.value })} /></Field>
          <Field label={t("Purchase Source")}><Input value={form.purchaseSource} onChange={(e) => set({ purchaseSource: e.target.value })} /></Field>
          <Field label={t("Personal Rating")}>
            <Select value={form.rating} onChange={(e) => set({ rating: e.target.value })}>
              <option value="">—</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
            </Select>
          </Field>
          <div className="flex items-end gap-5 pb-2">
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form.limitedEdition} onChange={(e) => set({ limitedEdition: e.target.checked })} />{t("Limited Edition")}</label>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form.certificate} onChange={(e) => set({ certificate: e.target.checked })} />{t("Certificate")}</label>
          </div>
          <div className="sm:col-span-2">
            <Field label={t("Notes")}>
              <textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function BarcodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const [scan, setScan] = useState(false);
  const [canScan, setCanScan] = useState(false);
  // Only known after mount: the camera API is a browser feature.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCanScan(cameraAvailable()), []);
  return (
    <div className="min-w-0">
      <Field label={t("Barcode (EAN)")}>
        <div className="flex gap-1.5">
          <Input className="code" inputMode="numeric" spellCheck={false} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(normBarcode(e.target.value))} placeholder="4013150523455" />
          {canScan && (
            <button type="button" aria-label={t("Scan barcode")} title={t("Scan barcode")} onClick={() => setScan(true)} className="grid h-10 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink-2 shadow-[var(--shadow-sm)] hover:text-accent max-md:h-11">
              <ScanBarcode className="size-[18px]" />
            </button>
          )}
        </div>
      </Field>
      <BarcodeScanner open={scan} onClose={() => setScan(false)} onCode={(c) => { onChange(c); setScan(false); }} />
    </div>
  );
}
