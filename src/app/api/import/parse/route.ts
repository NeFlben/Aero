import ExcelJS from "exceljs";
import Papa from "papaparse";
import { HttpError, rateLimit, route } from "@/server/http";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 20000;

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    return "";
  }
  return String(v);
}

/** Only reads the file into rows. Nothing is stored until the user confirms the preview. */
export const POST = route(async ({ req, userId }) => {
  rateLimit(`import:${userId}`, 20, 60_000);
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new HttpError(400, "no_file");
  if (file.size > MAX_BYTES) throw new HttpError(413, "too_large");
  const name = file.name.toLowerCase();
  let rows: Record<string, string>[] = [];

  try {
    if (name.endsWith(".xlsx")) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await file.arrayBuffer()) as never);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("empty");
      const headers: string[] = [];
      ws.getRow(1).eachCell({ includeEmpty: true }, (c, n) => (headers[n] = cellText(c.value).trim()));
      for (let r = 2; r <= ws.rowCount; r++) {
        const row: Record<string, string> = {};
        let any = false;
        ws.getRow(r).eachCell({ includeEmpty: false }, (c, n) => {
          if (headers[n]) {
            row[headers[n]] = cellText(c.value);
            any = true;
          }
        });
        if (any) rows.push(row);
      }
    } else if (name.endsWith(".json")) {
      const j = JSON.parse((await file.text()).replace(/^\ufeff/, ""));
      const list = Array.isArray(j) ? j : j.items;
      if (!Array.isArray(list)) throw new Error("no array");
      rows = list.map((o: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && typeof v !== "object").map(([k, v]) => [k, String(v)])),
      );
    } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const parsed = Papa.parse<Record<string, string>>((await file.text()).replace(/^\ufeff/, ""), { header: true, skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t", "|"] });
      rows = parsed.data;
    } else throw new HttpError(415, "unsupported_format");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, "unreadable_file");
  }
  if (rows.length > MAX_ROWS) throw new HttpError(413, "too_many_rows");
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(Boolean);
  return { headers, rows };
}, { limit: 30 });
