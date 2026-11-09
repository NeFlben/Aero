"use client";

import { CircleAlert, FileUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { countryCodeFrom } from "@/lib/countries";
import { useI18n } from "@/lib/i18n";
import { analyzeRows, guessMapping, IMPORT_FIELDS, type ImportField, type ImportRow, type Mapping } from "@/lib/importer";
import { api, ApiError, useApp } from "./AppProvider";
import { btnClass, Button, cx, Field, PageHeader, Panel, Select } from "./ui";

const FIELD_LABEL: Record<ImportField, string> = {
  airlineName: "Airline", aircraftName: "Aircraft Type", modelManufacturerName: "Model Manufacturer", scale: "Scale", registration: "Registration", itemNumber: "Item Number", barcode: "Barcode (EAN)",
  liveryCategory: "Livery Type", liveryName: "Livery Name", countryCode: "Country", purchasePrice: "Purchase Price", purchaseCurrency: "Currency", purchaseDate: "Purchase Date",
  value: "Current Value", valueCurrency: "Value Currency", notes: "Notes", condition: "Condition", storageLocation: "Storage Location",
};
const ISSUE: Record<string, string> = {
  missing_type: "Aircraft type is missing", missing_maker: "Model manufacturer is missing", bad_price: "Price could not be read", bad_value: "Value could not be read", bad_date: "Date could not be read",
  unknown_country: "Country not recognised", unknown_airline: "Airline not in our list, kept as written", unknown_aircraft: "Aircraft type not in our list, kept as written",
};
const PAGE = 100;

export function ImportWizard() {
  const { t, money } = useI18n();
  const { ref, items, user, reload, toast } = useApp();
  const [step, setStep] = useState<"file" | "map" | "preview" | "done">("file");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipDupes, setSkipDupes] = useState(true);
  const [only, setOnly] = useState<"all" | "problems">("all");
  const [imported, setImported] = useState(0);
  const [page, setPage] = useState(0);

  const analysis = useMemo<ImportRow[]>(() => {
    if (step !== "preview" || !ref) return [];
    return analyzeRows(rows, mapping, ref, items ?? [], user.baseCurrency, countryCodeFrom);
  }, [step, rows, mapping, ref, items, user.baseCurrency]);

  const counts = useMemo(() => ({
    ok: analysis.filter((r) => !r.errors.length && !r.duplicateOf && r.duplicateInFile === null).length,
    errors: analysis.filter((r) => r.errors.length).length,
    dupes: analysis.filter((r) => !r.errors.length && (r.duplicateOf || r.duplicateInFile !== null)).length,
    warnings: analysis.filter((r) => !r.errors.length && r.warnings.length).length,
  }), [analysis]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const r = await api<{ headers: string[]; rows: Record<string, string>[] }>("/api/import/parse", { method: "POST", body: fd });
      if (!r.rows.length) throw new ApiError("empty", 422);
      setFileName(file.name);
      setHeaders(r.headers);
      setRows(r.rows);
      setMapping(guessMapping(r.headers));
      setStep("map");
    } catch (e) {
      const c = e instanceof ApiError ? e.code : "";
      setError(c === "unsupported_format" ? t("Please use a CSV, XLSX or JSON file.") : c === "too_large" ? t("The file is larger than 20 MB.") : c === "too_many_rows" ? t("The file has more than 20,000 rows.") : c === "empty" ? t("No rows found in this file.") : t("This file could not be read."));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    const list = analysis.filter((r) => !r.errors.length && (!skipDupes || (!r.duplicateOf && r.duplicateInFile === null))).map((r) => r.input);
    if (!list.length) return;
    setBusy(true);
    try {
      const r = await api<{ count: number }>("/api/import/commit", { json: { items: list } });
      setImported(r.count);
      reload();
      setStep("done");
    } catch {
      toast(t("The import failed. Nothing was saved."), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const required = !!mapping.aircraftName && !!mapping.modelManufacturerName;
  const steps = [["file", t("File")], ["map", t("Columns")], ["preview", t("Review")]] as const;
  const shown = only === "problems" ? analysis.filter((r) => r.errors.length || r.warnings.length || r.duplicateOf || r.duplicateInFile !== null) : analysis;
  const importCount = analysis.filter((r) => !r.errors.length && (!skipDupes || (!r.duplicateOf && r.duplicateInFile === null))).length;

  return (
    <>
      <PageHeader title={t("Import your collection")} />
      {step !== "done" && (
        <ol className="code mb-4 flex gap-4 text-[11.5px] uppercase">
          {steps.map(([k, l], i) => <li key={k} className={step === k ? "text-accent" : "text-ink-3"}>{i + 1} {l}</li>)}
        </ol>
      )}

      {step === "file" && (
        <Panel>
          <label className={cx("m-4 flex cursor-pointer flex-col items-center rounded-md border border-dashed border-line-strong px-6 py-14 text-center hover:bg-surface-2/40", busy && "opacity-50")}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files[0]); }}>
            <FileUp className="size-7 text-ink-3" strokeWidth={1.25} />
            <span className="mt-3 font-medium">{busy ? t("Reading file") : t("Choose a CSV, XLSX or JSON file, or drop it here")}</span>
            <span className="mt-1 text-[13px] text-ink-2">{t("Nothing is saved until you have reviewed the result.")}</span>
            <input type="file" accept=".csv,.xlsx,.json,.txt" className="sr-only" disabled={busy} aria-label={t("Choose a file")} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {error && <p role="alert" className="px-5 pb-4 text-neg">{error}</p>}
        </Panel>
      )}

      {step === "map" && (
        <Panel title={t("{file}: {n} rows", { file: fileName, n: rows.length })}>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <Field key={f} label={t(FIELD_LABEL[f])} required={f === "aircraftName" || f === "modelManufacturerName"} hint={mapping[f] && rows[0]?.[mapping[f]!] ? String(rows[0][mapping[f]!]).slice(0, 26) : undefined}>
                <Select value={mapping[f] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}>
                  <option value="">{t("Do not import")}</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
            <Button variant="ghost" onClick={() => setStep("file")}>{t("Back")}</Button>
            <span className="flex items-center gap-3">
              {!required && <span className="text-[12.5px] text-signal">{t("Assign aircraft type and model manufacturer to continue.")}</span>}
              <Button variant="primary" disabled={!required || !ref} onClick={() => { setPage(0); setStep("preview"); }}>{t("Review {n} rows", { n: rows.length })}</Button>
            </span>
          </div>
        </Panel>
      )}

      {step === "preview" && (
        <>
          <section className="mb-3 grid grid-cols-2 card sm:grid-cols-4">
            {[[t("Ready"), counts.ok, ""], [t("Possible duplicates"), counts.dupes, "text-signal"], [t("With notes"), counts.warnings, "text-signal"], [t("Have errors"), counts.errors, counts.errors ? "text-neg" : ""]].map(([k, v, c]) => (
              <div key={k as string} className="border-line p-3 [&:not(:last-child)]:border-r"><div className="text-[12px] text-ink-2">{k}</div><div className={cx("num text-xl font-semibold", c as string)}>{v}</div></div>
            ))}
          </section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-[13px]">
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />{t("Skip possible duplicates")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={only === "problems"} onChange={(e) => { setOnly(e.target.checked ? "problems" : "all"); setPage(0); }} />{t("Show only rows with notes")}</label>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep("map")}>{t("Back")}</Button>
              <Button variant="primary" disabled={busy || importCount === 0} onClick={commit}>{busy ? t("Importing") : t("Import {n} models", { n: importCount })}</Button>
            </div>
          </div>
          {counts.errors > 0 && <p className="mb-3 text-[13px] text-ink-2">{t("Rows with errors are left out. Fix them in the file and import them afterwards.")}</p>}
          <div className="scroll-thin overflow-x-auto card">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] text-ink-3">
                  <th className="px-3 py-2 font-medium">{t("Row")}</th><th className="px-2 py-2 font-medium">{t("Airline")}</th><th className="px-2 py-2 font-medium">{t("Aircraft")}</th><th className="px-2 py-2 font-medium">{t("Manufacturer")}</th><th className="px-2 py-2 font-medium">{t("Scale")}</th><th className="px-2 py-2 font-medium">{t("Registration")}</th><th className="px-2 py-2 text-right font-medium">{t("Price")}</th><th className="px-3 py-2 font-medium">{t("Notes")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(page * PAGE, (page + 1) * PAGE).map((r) => {
                  const dup = r.duplicateOf ? t("Already in your collection") : r.duplicateInFile !== null ? t("Same as row {n}", { n: r.duplicateInFile + 2 }) : null;
                  return (
                    <tr key={r.index} className={cx("border-b border-line last:border-b-0", r.errors.length > 0 && "bg-neg/5", !r.errors.length && dup && "bg-signal/5")}>
                      <td className="num px-3 py-1.5 text-ink-3">{r.index + 2}</td>
                      <td className="max-w-[180px] truncate px-2 py-1.5">{r.input.airlineName ?? "—"}</td>
                      <td className="max-w-[180px] truncate px-2 py-1.5">{r.input.aircraftName || "—"}</td>
                      <td className="max-w-[120px] truncate px-2 py-1.5">{r.input.modelManufacturerName || "—"}</td>
                      <td className="code px-2 py-1.5 text-[12.5px]">{r.input.scale ?? "—"}</td>
                      <td className="code px-2 py-1.5 text-[12.5px]">{r.input.registration ?? "—"}</td>
                      <td className="num px-2 py-1.5 text-right">{r.input.purchasePriceCents != null ? money(r.input.purchasePriceCents, r.input.purchaseCurrency ?? user.baseCurrency) : "—"}</td>
                      <td className="px-3 py-1.5 text-[12px]">
                        {r.errors.map((e) => <div key={e.code} className="flex items-center gap-1 text-neg"><CircleAlert className="size-3 shrink-0" />{t(ISSUE[e.code])}</div>)}
                        {dup && <div className="flex items-center gap-1 text-signal"><TriangleAlert className="size-3 shrink-0" />{dup}</div>}
                        {r.warnings.map((e) => <div key={e.code} className="text-ink-3">{t(ISSUE[e.code])}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown.length > PAGE && (
            <div className="mt-2 flex items-center justify-end gap-2 text-[13px]">
              <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("Previous")}</Button>
              <span className="num text-ink-2">{page + 1} / {Math.ceil(shown.length / PAGE)}</span>
              <Button size="sm" disabled={(page + 1) * PAGE >= shown.length} onClick={() => setPage((p) => p + 1)}>{t("Next")}</Button>
            </div>
          )}
        </>
      )}

      {step === "done" && (
        <Panel>
          <div className="p-8 text-center">
            <h2 className="text-xl font-semibold">{t("{n} models imported", { n: imported })}</h2>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/collection" className={btnClass("primary")}>{t("Open collection")}</Link>
              <Button onClick={() => { setRows([]); setStep("file"); }}>{t("Import another file")}</Button>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}
