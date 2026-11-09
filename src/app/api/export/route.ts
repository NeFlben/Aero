import ExcelJS from "exceljs";
import Papa from "papaparse";
import { NextResponse } from "next/server";
import { EXPORT_COLUMNS } from "@/lib/importer";
import { route } from "@/server/http";
import { listItems, valuesFor } from "@/server/items";

const file = (body: BodyInit, type: string, name: string) =>
  new NextResponse(body, { headers: { "content-type": type, "content-disposition": `attachment; filename="${name}"` } });

export const GET = route(async ({ req, userId }) => {
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const ids = req.nextUrl.searchParams.get("ids")?.split(",");
  const all = await listItems(userId);
  const items = ids ? all.filter((i) => ids.includes(i.id)) : all;
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), items, valueHistory: await valuesFor(userId) }, null, 2);
    return file(body, "application/json", `hangar-${stamp}.json`);
  }
  const headers = EXPORT_COLUMNS.map((c) => c[0]);
  const rows = items.map((i) => EXPORT_COLUMNS.map((c) => c[1](i)));
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Collection");
    ws.addRow(headers).font = { bold: true };
    // A leading = would run as a formula when opened in a spreadsheet.
    rows.forEach((r) => ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v))));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return file(Buffer.from(await wb.xlsx.writeBuffer()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `hangar-${stamp}.xlsx`);
  }
  const csv = Papa.unparse({ fields: headers, data: rows.map((r) => r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v))) });
  return file("\ufeff" + csv, "text/csv; charset=utf-8", `hangar-${stamp}.csv`);
}, { limit: 30 });
