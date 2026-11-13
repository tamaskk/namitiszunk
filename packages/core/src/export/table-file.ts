import "server-only";

import ExcelJS from "exceljs";
import Papa from "papaparse";

export type TableFile = {
  filename: string;
  contentType: string;
  body: Uint8Array<ArrayBuffer>;
};

// Written as an escape: a literal BOM is invisible in review and trips the linter.
const BOM = String.fromCharCode(0xfeff);

// A cell starting with one of these runs as a formula in Excel (CSV injection); a quote keeps it text.
const neutralize = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

/**
 * A table for the books as CSV (Hungarian Excel: BOM and semicolons) or Excel. Columns flagged
 * as forints get a thousands format in Excel. Shared by the Orders (T-056) and Payouts (T-059) exports.
 */
export async function writeTableFile(table: {
  header: string[];
  rows: (string | number)[][];
  hufColumns: boolean[];
  format: "csv" | "xlsx";
  filename: string;
  sheet: string;
}): Promise<TableFile> {
  const filename = `${table.filename}.${table.format}`;
  if (table.format === "csv") {
    // Only the CSV needs it: Excel files store text cells as text, never as formulas.
    const safe = table.rows.map((row) =>
      row.map((cell) => (typeof cell === "string" ? neutralize(cell) : cell)),
    );
    const csv = `${BOM}${Papa.unparse([table.header, ...safe], { delimiter: ";" })}`;
    return {
      filename,
      contentType: "text/csv; charset=utf-8",
      body: new TextEncoder().encode(csv),
    };
  }

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(table.sheet);
  sheet.addRow(table.header).font = { bold: true };
  sheet.addRows(table.rows);
  table.header.forEach((title, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = Math.max(12, title.length + 2);
    if (table.hufColumns[i]) col.numFmt = "#,##0";
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return {
    filename,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: new Uint8Array(await book.xlsx.writeBuffer()),
  };
}
